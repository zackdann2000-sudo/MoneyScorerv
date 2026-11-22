import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { hubLeague, hubSeason, hubStanding, hubTeam } from "@/db/hub-schema";
import { ensureSeason, upsertLeague, upsertTeam } from "./identity";
import { fdFetch, espnCodesForFd, fdCompetitionCode } from "@/lib/providers";
import {
  DESEMPATE_PADRAO,
  ordenarTabela,
  regraPara,
  explicaPosicao,
  type CampoDesempate,
  type RegraDesempate,
} from "./tiebreak";

/**
 * Persistência da classificação (Gap G1 do plano).
 *
 * Antes: `/api/standings` perguntava ao fornecedor a cada request. Fornecedor
 * fora do ar = aba CLASSIFICAÇÃO vazia; nenhuma regra de desempate auditável;
 * nenhuma ligação com `hub_team` para destacar o time do jogo aberto.
 *
 * Depois: o fornecedor é consultado por um JOB, a tabela vira retrato em
 * `hub_standing`, e o request só lê o banco.
 *
 * Regra de ouro do sync: **tabela velha é melhor que tabela errada**. Se o
 * fornecedor vier sem um campo que a regra exige, o sync lança e o retrato
 * anterior continua servindo. Nada de "degradar para o padrão e gravar assim
 * mesmo" — foi exatamente esse degradar silencioso que invertería o Brasileirão.
 */

export type RelatorioClassificacao = {
  codigo: string;
  liga: string;
  temporada: string;
  fase: string;
  times: number;
  /** Quantas posições divergem do `position` do fornecedor. 0 = regra confere. */
  divergencias: number;
  /** false = houve empate em todos os critérios; ordem veio do fornecedor. */
  confiavel: boolean;
  regra: string;
  /** Linhas apagadas porque o time saiu da tabela do fornecedor. */
  removidos: number;
  fonte: "footballdata";
};

/** Linha crua do Football-Data, já no formato que `ordenarTabela` consome. */
type LinhaFd = {
  teamId: string;
  name: string;
  logo: string;
  positionFornecedor: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string | null;
  group: string;
};

/** Linha do FD + a posição que NOSSA regra calculou. */
type LinhaComPosicao = LinhaFd & { position: number };
/** Retorno de `ordenarTabela`: as linhas como array, com o selo de confiança. */
type TabelaOrdenada = LinhaComPosicao[] & { confiavel: boolean };

function extrairLinhas(json: any): LinhaFd[] {
  const blocos: any[] = Array.isArray(json?.standings) ? json.standings : [];
  const out: LinhaFd[] = [];
  for (const bloco of blocos) {
    // Só a tabela TOTAL: HOME/AWAY são recortes e gerariam linhas duplicadas.
    if ((bloco?.type || "TOTAL") !== "TOTAL") continue;
    const grupo: string = bloco?.group ?? "";
    for (const linha of Array.isArray(bloco?.table) ? bloco.table : []) {
      if (!linha?.team?.id) continue; // linha sem time não é tabela, é lixo
      out.push({
        teamId: String(linha.team.id),
        name: String(linha.team.name ?? ""),
        logo: String(linha.team.crest ?? ""),
        positionFornecedor: Number(linha.position ?? 0) || 0,
        played: Number(linha.playedGames ?? 0),
        won: Number(linha.won ?? 0),
        draw: Number(linha.draw ?? 0),
        lost: Number(linha.lost ?? 0),
        goalsFor: Number(linha.goalsFor ?? 0),
        goalsAgainst: Number(linha.goalsAgainst ?? 0),
        goalDifference: Number(linha.goalDifference ?? 0),
        points: Number(linha.points ?? 0),
        form: linha.form ? String(linha.form) : null,
        group: grupo,
      });
    }
  }
  return out;
}

/**
 * Sincroniza a classificação de UMA competição do Football-Data.
 *
 * Idempotente: rodar duas vezes seguidas produz o mesmo resultado.
 * Lança sem gravar nada quando a regra de desempate não pode ser aplicada.
 */
export async function sincronizarClassificacao(codigo: string): Promise<RelatorioClassificacao> {
  const code = codigo.toUpperCase();
  const json = await fdFetch(`/competitions/${code}/standings`, 0); // sem cache: é job
  const linhas = extrairLinhas(json);

  if (linhas.length === 0) {
    throw new Error(`${code}: fornecedor não devolveu tabela TOTAL. Nada gravado.`);
  }

  const regra: RegraDesempate = regraPara(code);

  // Agrupa por fase (grupo). Sem grupo, tudo vira a tabela única "".
  const porFase = new Map<string, LinhaFd[]>();
  for (const linha of linhas) {
    const fase = linha.group || "";
    const atual = porFase.get(fase) ?? [];
    atual.push(linha);
    porFase.set(fase, atual);
  }

  // ── Ordena ANTES de abrir transação. Se a regra não puder ser aplicada,
  //    `ordenarTabela` lança aqui e o retrato antigo permanece intacto.
  const ordenadasPorFase = new Map<string, TabelaOrdenada>();
  for (const [fase, doFase] of porFase) {
    try {
      ordenadasPorFase.set(
        fase,
        ordenarTabela<LinhaComPosicao>(
          doFase.map((l) => ({ ...l, position: l.positionFornecedor })),
          regra,
        ) as TabelaOrdenada,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`${code}/${fase || "tabela"}: regra de desempate inaplicável — ${msg}`);
    }
  }

  const comp = json?.competition ?? {};
  const season = json?.season ?? {};
  const seasonKey =
    season.startDate && season.endDate
      ? `${String(season.startDate).slice(0, 4)}-${String(season.endDate).slice(0, 4)}`
      : season.startDate
        ? String(season.startDate).slice(0, 4)
        : null;
  if (!seasonKey) {
    // Sem temporada não há chave única confiável (season_id é NOT NULL de propósito).
    throw new Error(`${code}: fornecedor sem season.startDate — não dá para ancorar o retrato.`);
  }

  const leagueId = await upsertLeague({
    source: "footballdata",
    externalRef: code,
    name: String(comp.name ?? code),
    logoUrl: comp.emblem ?? null,
    countryIso2: comp.area?.code ?? null,
    countryName: comp.area?.name ?? null,
    competitionType: String(comp.type ?? "").toUpperCase().includes("CUP") ? "Cup" : "Liga",
  });
  const seasonId = await ensureSeason(leagueId, seasonKey, seasonKey);

  // A coluna espelha a regra aplicada — é o que a UI exibe como explicação.
  await db
    .update(hubLeague)
    .set({
      tiebreakRules: regra as unknown as string[],
      hasKnockout: String(comp.type ?? "").toUpperCase().includes("CUP"),
    })
    .where(eq(hubLeague.id, leagueId));

  let divergencias = 0;
  let removidos = 0;
  let confiavel = true;

  await db.transaction(async (tx) => {
    for (const [fase, ordenadas] of ordenadasPorFase) {
      confiavel = confiavel && ordenadas.confiavel;

      const teamIds: number[] = [];
      for (const linha of ordenadas) {
        const teamId = await upsertTeam({
          source: "footballdata",
          externalRef: linha.teamId,
          name: linha.name,
          logoUrl: linha.logo || null,
          leagueId,
        });
        teamIds.push(teamId);

        if (linha.positionFornecedor && linha.position !== linha.positionFornecedor) {
          divergencias++;
        }

        await tx
          .insert(hubStanding)
          .values({
            leagueId,
            seasonId,
            teamId,
            stageName: fase,
            position: linha.position,
            played: linha.played,
            wins: linha.won,
            draws: linha.draw,
            losses: linha.lost,
            goalsFor: linha.goalsFor,
            goalsAgainst: linha.goalsAgainst,
            // Derivado aqui, na mesma escrita de GF/GC: o CHECK do banco exige
            // que estes três nunca divirjam.
            goalDiff: linha.goalsFor - linha.goalsAgainst,
            points: linha.points,
            form: linha.form,
            formHome: null,
            formAway: null,
            source: "footballdata",
          })
          .onConflictDoUpdate({
            target: [hubStanding.leagueId, hubStanding.seasonId, hubStanding.stageName, hubStanding.teamId],
            set: {
              position: linha.position,
              played: linha.played,
              wins: linha.won,
              draws: linha.draw,
              losses: linha.lost,
              goalsFor: linha.goalsFor,
              goalsAgainst: linha.goalsAgainst,
              goalDiff: linha.goalsFor - linha.goalsAgainst,
              points: linha.points,
              form: linha.form,
              source: "footballdata",
              updatedAt: new Date(),
            },
          });
      }

      // Time que saiu da tabela não pode continuar aparecendo com posição velha.
      const apagadas = await tx
        .delete(hubStanding)
        .where(
          and(
            eq(hubStanding.leagueId, leagueId),
            eq(hubStanding.seasonId, seasonId),
            eq(hubStanding.stageName, fase),
            notInArray(hubStanding.teamId, teamIds),
          ),
        )
        .returning({ id: hubStanding.id });
      removidos += apagadas.length;
    }
  });

  return {
    codigo: code,
    liga: String(comp.name ?? code),
    temporada: seasonKey,
    fase: [...porFase.keys()].filter(Boolean).join(", ") || "tabela única",
    times: linhas.length,
    divergencias,
    confiavel,
    regra: explicaPosicao(regra),
    removidos,
    fonte: "footballdata",
  };
}

/* ===== leitura (o que a API e a UI consomem) ===== */

export type LinhaClassificacao = {
  position: number;
  teamId: number;
  teamName: string;
  teamSlug: string;
  teamLogo: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  form: string | null;
};

export type Classificacao = {
  leagueId: number;
  leagueName: string;
  leagueSlug: string;
  seasonId: number;
  seasonKey: string;
  stageName: string;
  stages: string[];
  tiebreak: CampoDesempate[];
  regraTexto: string;
  hasKnockout: boolean;
  updatedAt: Date | null;
  rows: LinhaClassificacao[];
};

/**
 * Resolve o id interno da liga a partir de um código ESPN ("bra.1") ou de um
 * código Football-Data ("BSA").
 *
 * A liga pode ter sido criada pela ESPN (source='espn', external_ref='bra.1'),
 * enquanto o retrato da classificação vive na linha do Football-Data. Esta
 * função é a ponte entre os dois espaço de nomes e é o único lugar que sabe
 * disso — o chamador nunca precisa montar slug na mão.
 */
export async function resolverLigaId(entrada: string): Promise<number | null> {
  const bruto = entrada.trim();
  if (!bruto) return null;

  // 1. id numérico interno
  if (/^\d+$/.test(bruto)) {
    const [porId] = await db.select({ id: hubLeague.id }).from(hubLeague).where(eq(hubLeague.id, Number(bruto))).limit(1);
    if (porId) return porId.id;
  }

  // 2. código ESPN -> código FD
  const codigoFd = fdCompetitionCode(bruto) ?? bruto.toUpperCase();
  const [porFd] = await db
    .select({ id: hubLeague.id })
    .from(hubLeague)
    .where(and(eq(hubLeague.source, "footballdata"), eq(hubLeague.externalRef, codigoFd)))
    .limit(1);
  if (porFd) return porFd.id;

  // 3. slug exato
  const [porSlug] = await db.select({ id: hubLeague.id }).from(hubLeague).where(eq(hubLeague.slug, bruto)).limit(1);
  return porSlug?.id ?? null;
}

/* ===== ponte de identidade entre fornecedores ===== */

export type LigaIrma = {
  id: number;
  name: string;
  slug: string;
  source: string;
  externalRef: string | null;
};

/**
 * Todos os códigos que apontam para a MESMA competição, em minúsculas.
 *
 * Ponto de partida: `fdCompetitionCode` (ESPN -> Football-Data) e o seu
 * inverso. O código cru entra no conjunto porque nem toda liga está no mapa.
 */
function codigosDaCompeticao(entrada: string): Set<string> {
  const bruto = entrada.trim();
  const out = new Set<string>();
  if (!bruto) return out;

  out.add(bruto.toLowerCase());
  const fd = fdCompetitionCode(bruto) ?? bruto.toUpperCase();
  out.add(fd.toLowerCase());
  for (const espn of espnCodesForFd(fd)) out.add(espn.toLowerCase());
  return out;
}

/** Slug sem o prefixo de origem ("footballdata-", "espn-"). */
function slugBase(slug: string, source: string): string {
  const prefixo = source.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug
    .toLowerCase()
    .replace(new RegExp(`^${prefixo}-`), "")
    .trim();
}

/**
 * Linhas de `hub_league` que representam a mesma competição, com a âncora 1º.
 *
 * Por que isto existe: a chave única de `hub_league` é `(source, external_ref)`,
 * então a MESMA competição pode ter DUAS linhas — `espn/bra.1` e
 * `footballdata/BSA` — com ids diferentes. Sem unir os ids, entrar na página
 * por um dos caminhos mostra a classificação e esconde os jogos (ou o
 * contrário), e o usuário lê isso como “a liga está vazia”.
 *
 * Regras, da mais forte para a mais fraca:
 *   1. é a própria âncora;
 *   2. `external_ref` bate com qualquer código equivalente (mapa FD <-> ESPN);
 *   3. slug base idêntico (ex.: "premier-league" nos dois fornecedores).
 *
 * Regra de ouro: **sem certeza, não une**. Toda união exige país compatível
 * quando os dois lados têm `country_iso2` — “Serie A” da Itália e
 * “Campeonato Brasileiro Série A” compartilham a palavra "série" e NUNCA podem
 * virar a mesma competição. Sem mapa e sem slug igual, volta só a âncora.
 */
export async function ligasDaCompeticao(entrada: string): Promise<LigaIrma[]> {
  const ancoraId = await resolverLigaId(entrada);
  if (!ancoraId) return [];

  const todas = await db
    .select({
      id: hubLeague.id,
      name: hubLeague.name,
      slug: hubLeague.slug,
      source: hubLeague.source,
      externalRef: hubLeague.externalRef,
      countryIso2: hubLeague.countryIso2,
    })
    .from(hubLeague);

  const ancora = todas.find((l) => l.id === ancoraId);
  if (!ancora) return [];

  const codigos = codigosDaCompeticao(entrada);
  for (const c of codigosDaCompeticao(ancora.externalRef ?? "")) codigos.add(c);
  const baseAncora = slugBase(ancora.slug, ancora.source);

  const paisConflita = (a: typeof ancora, b: typeof ancora) =>
    Boolean(a.countryIso2 && b.countryIso2 && a.countryIso2 !== b.countryIso2);

  const irmas: LigaIrma[] = [];
  for (const l of todas) {
    if (l.id === ancoraId) continue;
    if (paisConflita(ancora, l)) continue;

    const ref = (l.externalRef ?? "").toLowerCase();
    const porCodigo = ref !== "" && codigos.has(ref);
    // Slug base só vale com fonte diferente; igualdade de slug na mesma fonte
    // seria a mesma linha com outro id, o que não existe.
    const porSlug = l.source !== ancora.source && slugBase(l.slug, l.source) === baseAncora && baseAncora !== "";

    if (porCodigo || porSlug) {
      irmas.push({ id: l.id, name: l.name, slug: l.slug, source: l.source, externalRef: l.externalRef });
    }
  }

  // Ordem: âncora primeiro (é a preferida para ler), depois as outras fontes.
  irmas.sort((a, b) => a.source.localeCompare(b.source));
  return [{ id: ancora.id, name: ancora.name, slug: ancora.slug, source: ancora.source, externalRef: ancora.externalRef }, ...irmas];
}

/** Só os ids da ponte — atalho para `inArray` nas consultas de fixture. */
export async function idsDaCompeticao(entrada: string): Promise<number[]> {
  return (await ligasDaCompeticao(entrada)).map((l) => l.id);
}

/** Lê o retrato de classificação do banco. Nenhuma chamada de rede. */
export async function lerClassificacao(
  leagueId: number,
  opts: { stage?: string; seasonKey?: string } = {},
): Promise<Classificacao | null> {
  const [liga] = await db
    .select({
      id: hubLeague.id,
      name: hubLeague.name,
      slug: hubLeague.slug,
      tiebreakRules: hubLeague.tiebreakRules,
      hasKnockout: hubLeague.hasKnockout,
    })
    .from(hubLeague)
    .where(eq(hubLeague.id, leagueId))
    .limit(1);
  if (!liga) return null;

  const temporadas = await db
    .select({ id: hubSeason.id, seasonKey: hubSeason.seasonKey })
    .from(hubSeason)
    .where(eq(hubSeason.leagueId, leagueId))
    .orderBy(desc(hubSeason.seasonKey));

  const temporada = opts.seasonKey
    ? temporadas.find((t) => t.seasonKey === opts.seasonKey)
    : temporadas[0];
  if (!temporada) return null;

  const fases = await db
    .selectDistinct({ stageName: hubStanding.stageName })
    .from(hubStanding)
    .where(and(eq(hubStanding.leagueId, leagueId), eq(hubStanding.seasonId, temporada.id)))
    .orderBy(asc(hubStanding.stageName));

  const stageName = opts.stage ?? fases[0]?.stageName ?? "";
  if (!fases.some((f) => f.stageName === stageName)) return null;

  const rows = await db
    .select({
      position: hubStanding.position,
      teamId: hubTeam.id,
      teamName: hubTeam.name,
      teamSlug: hubTeam.slug,
      teamLogo: hubTeam.logoUrl,
      played: hubStanding.played,
      wins: hubStanding.wins,
      draws: hubStanding.draws,
      losses: hubStanding.losses,
      goalsFor: hubStanding.goalsFor,
      goalsAgainst: hubStanding.goalsAgainst,
      goalDiff: hubStanding.goalDiff,
      points: hubStanding.points,
      form: hubStanding.form,
    })
    .from(hubStanding)
    .innerJoin(hubTeam, eq(hubTeam.id, hubStanding.teamId))
    .where(
      and(
        eq(hubStanding.leagueId, leagueId),
        eq(hubStanding.seasonId, temporada.id),
        eq(hubStanding.stageName, stageName),
      ),
    )
    .orderBy(asc(hubStanding.position));

  const [maisRecente] = await db
    .select({ updatedAt: hubStanding.updatedAt })
    .from(hubStanding)
    .where(and(eq(hubStanding.leagueId, leagueId), eq(hubStanding.seasonId, temporada.id)))
    .orderBy(desc(hubStanding.updatedAt))
    .limit(1);

  const tiebreak = (Array.isArray(liga.tiebreakRules) ? liga.tiebreakRules : DESEMPATE_PADRAO) as CampoDesempate[];

  return {
    leagueId: liga.id,
    leagueName: liga.name,
    leagueSlug: liga.slug,
    seasonId: temporada.id,
    seasonKey: temporada.seasonKey,
    stageName,
    stages: fases.map((f) => f.stageName),
    tiebreak,
    regraTexto: explicaPosicao(tiebreak),
    hasKnockout: liga.hasKnockout,
    updatedAt: maisRecente?.updatedAt ?? null,
    rows,
  };
}

/** Posição de um time na tabela — usado pela página de time (S12). */
export async function posicaoDoTime(
  leagueId: number,
  teamId: number,
): Promise<{ position: number; points: number; played: number } | null> {
  const [linha] = await db
    .select({ position: hubStanding.position, points: hubStanding.points, played: hubStanding.played })
    .from(hubStanding)
    .innerJoin(hubSeason, eq(hubSeason.id, hubStanding.seasonId))
    .where(
      and(
        eq(hubStanding.leagueId, leagueId),
        eq(hubStanding.teamId, teamId),
        eq(hubSeason.isCurrent, true),
      ),
    )
    .orderBy(asc(hubStanding.position))
    .limit(1);
  return linha ?? null;
}

export type LigaComRetrato = {
  id: number;
  name: string;
  slug: string;
  externalRef: string | null;
  countryName: string | null;
  isCup: boolean;
};

/**
 * Competições que já têm retrato gravado — é a lista do seletor da tela.
 *
 * Só entram ligas com pelo menos uma linha em `hub_standing`: mostrar no seletor
 * uma liga que não tem tabela seria oferecer uma tela vazia.
 */
export async function ligasComRetrato(): Promise<LigaComRetrato[]> {
  const rows = await db
    .selectDistinct({
      id: hubLeague.id,
      name: hubLeague.name,
      slug: hubLeague.slug,
      externalRef: hubLeague.externalRef,
      countryName: hubLeague.countryName,
      isCup: hubLeague.hasKnockout,
    })
    .from(hubLeague)
    .innerJoin(hubStanding, eq(hubStanding.leagueId, hubLeague.id))
    .orderBy(asc(hubLeague.name));
  return rows;
}

/** Competições que o job deve varrer por padrão (as tier-one mapeadas). */
export const COMPETICOES_PADRAO = ["BSA", "SA", "PL", "PD", "BL1", "FL1", "PPL", "DED", "ELC"] as const;

export type TimeComTabela = { teamId: number; teamName: string; position: number };

/** Times que aparecem em mais de uma fase — usado para validar o sync. */
export async function timesDuplicadosNaFase(leagueId: number, seasonId: number): Promise<TimeComTabela[]> {
  const rows = await db
    .select({ teamId: hubStanding.teamId, teamName: hubTeam.name, position: hubStanding.position })
    .from(hubStanding)
    .innerJoin(hubTeam, eq(hubTeam.id, hubStanding.teamId))
    .where(and(eq(hubStanding.leagueId, leagueId), eq(hubStanding.seasonId, seasonId)));
  const vistos = new Set<number>();
  const dup: TimeComTabela[] = [];
  for (const r of rows) {
    if (vistos.has(r.teamId)) dup.push(r);
    vistos.add(r.teamId);
  }
  return dup;
}

// Reexport para quem só importa daqui.
export { explicaPosicao, regraPara };
export type { CampoDesempate, RegraDesempate };
