/* =======================================================================
   FONTE DO MÓDULO ÁRBITROS — leitura (banco + feed) e gravação idempotente.
   -----------------------------------------------------------------------
   De onde o dado vem, em ordem:

   1. `hub_referee_appearance` (histórico que NÓS acumulamos) + o agregado
      publicado em `hub_referee`.
   2. Feed do apitou (`lerResumo()`), que já entrega, por jogo, o árbitro com
      os totais da temporada (`{ nome, jogos, amarelos, vermelhos, faltas,
      penaltis }`). É o que impede a tela de abrir vazia no dia 1.

   O que este módulo NÃO faz: chamar API paga, inventar cartão por jogo ou
   estimar média. Aparência sem cartão fica `null` — a média usa o agregado.

   Gravação: `fonte + fonte_ref` = o jogo na origem, então rodar o cron dez
   vezes não cria dez linhas.
   ======================================================================= */

import { sql } from "drizzle-orm";
import {
  agregar,
  distribuicaoCartoes,
  filtrarArbitros,
  historico,
  normNome,
  resumoLista,
  semDuplicatas,
  type Aparencia,
  type ArbitroAgregado,
  type FiltroArbitros,
  type Snapshot,
} from "./arbitros";

export type Origem = "banco" | "apitou" | "banco+apitou" | "vazio";

export type Coleta = {
  snapshots: Snapshot[];
  aparicoes: Aparencia[];
  origem: Origem;
  /** Idade do dado do feed em ms (null quando só veio do banco). */
  idadeFeedMs: number | null;
};

/* ------------------------------ banco -------------------------------- */

async function lerDoBanco(): Promise<{ snapshots: Snapshot[]; aparicoes: (Aparencia & { _ref: number })[] }> {
  try {
    const { db } = await import("@/db");
    const { hubReferee, hubRefereeAppearance } = await import("@/db/hub-schema");

    const refs = await db.select().from(hubReferee);
    const rows = await db.select().from(hubRefereeAppearance);

    const nomePorId = new Map<number, string>();
    const snapshots: Snapshot[] = [];
    for (const r of refs) {
      nomePorId.set(r.id, r.nome);
      /* Só é snapshot quem tem jogos: linha criada pela aparição (sem
         agregado) não pode virar divisor de média. */
      if (!r.jogos || r.jogos <= 0) continue;
      snapshots.push({
        nome: r.nome,
        jogos: r.jogos,
        amarelos: r.amarelos,
        vermelhos: r.vermelhos,
        faltas: r.faltas,
        penaltis: r.penaltis,
        fonte: r.fonte ?? "banco",
        vistoEm: r.vistoEm ? new Date(r.vistoEm).toISOString() : undefined,
      });
    }

    const aparicoes = rows
      .map((r) => {
        const nome = nomePorId.get(r.refereeId);
        if (!nome) return null;
        const ap: Aparencia & { _ref: number } = {
          arbitro: nome,
          data: new Date(r.matchDate).toISOString(),
          liga: r.leagueName ?? "",
          home: r.homeName ?? "",
          away: r.awayName ?? "",
          homeScore: r.homeScore,
          awayScore: r.awayScore,
          amarelos: r.amarelos,
          vermelhos: r.vermelhos,
          faltas: r.faltas,
          penaltis: r.penaltis,
          fonte: r.fonte,
          fonteRef: r.fonteRef,
          _ref: r.refereeId,
        };
        return ap;
      })
      .filter((x): x is Aparencia & { _ref: number } => !!x);

    return { snapshots, aparicoes };
  } catch (e) {
    /* Banco indisponível não derruba a tela: o feed cobre. */
    console.warn("[arbitros] leitura do banco falhou:", e instanceof Error ? e.message : e);
    return { snapshots: [], aparicoes: [] };
  }
}

/* ----------------------------- montagem ------------------------------ */

/**
 * Monta a tabela já agregada, filtrada e ordenada — para a tela e para a API.
 *
 * `Date.now()` fica AQUI e não no componente: regra `react-hooks/purity`
 * proíbe função impura durante o render, e o "próximo jogo" precisa de um
 * relógio real. O servidor chama isto uma vez por request.
 */
export async function montarLista(filtro: FiltroArbitros = {}) {
  const dados = await coletar();
  const todos = agregar(dados.snapshots, dados.aparicoes, Date.now());
  const lista = filtrarArbitros(todos, filtro);
  return { dados, todos, lista, resumo: resumoLista(lista) };
}

export type Dossie = {
  dados: Coleta;
  arbitro: ArbitroAgregado | null;
  historico: Aparencia[];
  distribuicao: { faixa: string; jogos: number }[];
};

/** Dossiê de um árbitro pelo slug da URL ("raphael-claus"). */
export async function montarDossie(slug: string): Promise<Dossie> {
  const dados = await coletar();
  const todos = agregar(dados.snapshots, dados.aparicoes, Date.now());
  const arbitro = todos.find((a) => a.slug === slug) ?? null;
  if (!arbitro) return { dados, arbitro: null, historico: [], distribuicao: [] };
  return {
    dados,
    arbitro,
    historico: historico(dados.aparicoes, slug, 40),
    distribuicao: distribuicaoCartoes(dados.aparicoes, slug),
  };
}

/* ------------------------------ feed -------------------------------- */

export type FeedArbitros = {
  snapshots: Snapshot[];
  aparicoes: Aparencia[];
  geradoEm: string | null;
  idadeMs: number | null;
};

/**
 * Extrai árbitros do resumo do apitou (já cacheado no Postgres).
 *
 * `resumo.jogos[].arbitro` traz os TOTAIS do árbitro (mesmo número repetido em
 * cada jogo dele na semana), então o snapshot é o último visto e a aparência é
 * o jogo. Sem `arbitro.nome`, o jogo é ignorado — nada de "Árbitro não
 * informado" virando uma entidade na tabela.
 */
export async function coletarDoFeed(): Promise<FeedArbitros> {
  const vazio: FeedArbitros = { snapshots: [], aparicoes: [], geradoEm: null, idadeMs: null };
  try {
    const { lerResumo } = await import("./apitou/store");
    const resumo = await lerResumo({ ignorarMemoria: false });
    if (!resumo || !Array.isArray(resumo.jogos)) return vazio;

    const vistoEm = toIso(resumo.geradoEm) ?? new Date().toISOString();
    const snaps = new Map<string, Snapshot>();
    const aps: Aparencia[] = [];

    for (const jogo of resumo.jogos) {
      const arb = jogo?.arbitro;
      if (!arb || !arb.nome) continue;
      const k = normNome(arb.nome);
      snaps.set(k, {
        nome: arb.nome,
        jogos: num(arb.jogos) ?? 0,
        amarelos: num(arb.amarelos),
        vermelhos: num(arb.vermelhos),
        faltas: num(arb.faltas),
        penaltis: num(arb.penaltis),
        fonte: "apitou",
        vistoEm,
      });
      aps.push({
        arbitro: arb.nome,
        data: toIso(jogo.kickoff) ?? vistoEm,
        liga: String(jogo.competicao ?? ""),
        home: String(jogo.home ?? ""),
        away: String(jogo.away ?? ""),
        fonte: "apitou",
        fonteRef: String(jogo.id ?? `${jogo.home}-${jogo.away}-${jogo.kickoff}`),
        /* A fonte não entrega cartão POR JOGO — fica null de propósito. */
        amarelos: null,
        vermelhos: null,
        faltas: null,
        penaltis: null,
      });
    }

    const salvadoEm = Number(resumo.salvadoEm) || 0;
    return {
      snapshots: [...snaps.values()],
      aparicoes: semDuplicatas(aps),
      geradoEm: resumo.geradoEm ?? null,
      idadeMs: salvadoEm ? Math.max(0, Date.now() - salvadoEm) : null,
    };
  } catch (e) {
    console.warn("[arbitros] leitura do feed falhou:", e instanceof Error ? e.message : e);
    return vazio;
  }
}

/* ----------------------------- coletar ------------------------------ */

/** Junta banco + feed (banco primeiro: é o histórico que acumulamos). */
export async function coletar(): Promise<Coleta> {
  const [banco, feed] = await Promise.all([lerDoBanco(), coletarDoFeed()]);

  const snapshots = [...banco.snapshots, ...feed.snapshots];
  const aparicoes = semDuplicatas([...banco.aparicoes.map(semRef), ...feed.aparicoes]);

  const origem: Origem =
    banco.snapshots.length || banco.aparicoes.length
      ? feed.snapshots.length || feed.aparicoes.length
        ? "banco+apitou"
        : "banco"
      : feed.snapshots.length || feed.aparicoes.length
        ? "apitou"
        : "vazio";

  return { snapshots, aparicoes, origem, idadeFeedMs: feed.idadeMs };
}

/* ----------------------------- gravar ------------------------------- */

export type ResultadoSync = {
  ok: boolean;
  arbitros: number;
  aparicoes: number;
  erro?: string;
};

/**
 * Grava o feed do apitou no banco do módulo (upsert idempotente).
 *
 * Chamado no cron diário `?acao=apitou`, depois de `sincronizarEGravar()`:
 * o feed já está fresco, então aqui só há leitura de cache + 2 upserts.
 *
 * Nunca lança: falha de árbitro não pode derrubar o pipeline principal.
 */
export async function sincronizarArbitros(): Promise<ResultadoSync> {
  const feed = await coletarDoFeed();
  if (!feed.snapshots.length && !feed.aparicoes.length) {
    return { ok: true, arbitros: 0, aparicoes: 0 };
  }

  try {
    const { db } = await import("@/db");
    const { hubReferee, hubRefereeAppearance } = await import("@/db/hub-schema");
    const { inArray } = await import("drizzle-orm");

    const vistoEm = feed.geradoEm ? new Date(toIso(feed.geradoEm) ?? Date.now()) : new Date();

    /* 1) agregados (uma linha por árbitro normalizado) */
    const unicos = new Map<string, Snapshot>();
    for (const s of feed.snapshots) unicos.set(normNome(s.nome), s);

    const valores = [...unicos.entries()].map(([k, s]) => ({
      nome: s.nome,
      nomeNorm: k,
      jogos: num(s.jogos),
      amarelos: num(s.amarelos),
      vermelhos: num(s.vermelhos),
      faltas: num(s.faltas),
      penaltis: num(s.penaltis),
      fonte: s.fonte ?? "apitou",
      vistoEm,
      updatedAt: new Date(),
    }));

    if (valores.length) {
      await db
        .insert(hubReferee)
        .values(valores)
        .onConflictDoUpdate({
          target: hubReferee.nomeNorm,
          set: {
            nome: sqlExcluded("nome"),
            jogos: sqlExcluded("jogos"),
            amarelos: sqlExcluded("amarelos"),
            vermelhos: sqlExcluded("vermelhos"),
            faltas: sqlExcluded("faltas"),
            penaltis: sqlExcluded("penaltis"),
            fonte: sqlExcluded("fonte"),
            vistoEm: sqlExcluded("visto_em"),
            updatedAt: new Date(),
          },
        });
    }

    /* Sem árbitro normalizado não há o que gravar: parar aqui evita montar
       um `inArray` com lista vazia para descobrir os ids. */
    if (!unicos.size) return { ok: true, arbitros: 0, aparicoes: 0 };

    /* 2) aparições — precisa do id de cada árbitro */
    const refs = await db
      .select({ id: hubReferee.id, nomeNorm: hubReferee.nomeNorm })
      .from(hubReferee)
      .where(inArray(hubReferee.nomeNorm, [...unicos.keys()]));
    const idPorNorm = new Map(refs.map((r) => [r.nomeNorm, r.id]));

    const linhas = feed.aparicoes
      .map((a) => {
        const refereeId = idPorNorm.get(normNome(a.arbitro));
        if (!refereeId) return null;
        return {
          refereeId,
          matchDate: new Date(toIso(a.data) ?? Date.now()),
          leagueName: a.liga,
          homeName: a.home,
          awayName: a.away,
          homeScore: num(a.homeScore),
          awayScore: num(a.awayScore),
          amarelos: num(a.amarelos),
          vermelhos: num(a.vermelhos),
          faltas: num(a.faltas),
          penaltis: num(a.penaltis),
          fonte: a.fonte,
          fonteRef: String(a.fonteRef ?? `${a.data}|${a.home}|${a.away}`),
          updatedAt: new Date(),
        };
      })
      .filter(Boolean) as {
        refereeId: number;
        matchDate: Date;
        leagueName: string;
        homeName: string;
        awayName: string;
        homeScore: number | null;
        awayScore: number | null;
        amarelos: number | null;
        vermelhos: number | null;
        faltas: number | null;
        penaltis: number | null;
        fonte: string;
        fonteRef: string;
        updatedAt: Date;
      }[];

    /* Lote de 200: o feed semanal passa de 500 jogos em dia cheio. */
    for (let i = 0; i < linhas.length; i += 200) {
      await db
        .insert(hubRefereeAppearance)
        .values(linhas.slice(i, i + 200))
        .onConflictDoUpdate({
          target: [hubRefereeAppearance.fonte, hubRefereeAppearance.fonteRef],
          set: {
            refereeId: sqlExcluded("referee_id"),
            matchDate: sqlExcluded("match_date"),
            leagueName: sqlExcluded("league_name"),
            homeName: sqlExcluded("home_name"),
            awayName: sqlExcluded("away_name"),
            homeScore: sqlExcluded("home_score"),
            awayScore: sqlExcluded("away_score"),
            updatedAt: new Date(),
          },
        });
    }

    return { ok: true, arbitros: refs.length, aparicoes: linhas.length };
  } catch (e) {
    /* O Drizzle embrulha o erro do Postgres: `e.message` traz só o SQL
       ("Failed query: insert into ...") e a causa REAL fica em `e.cause`.
       Antes daqui saía `erro.slice(0, 200)`, que cortava a mensagem no meio do
       VALUES — foi assim que "insert ... values (default, $1, $2, $3)" passou
       por bug de mapeamento quando o problema era "relation does not exist". */
    const erro = descreverErro(e);
    console.warn("[arbitros] gravação falhou:", erro);
    return { ok: false, arbitros: 0, aparicoes: 0, erro: erro.slice(0, 500) };
  }
}

/* ---------------------------- utilidades ---------------------------- */

/**
 * Mensagem útil para diagnóstico: a causa do Postgres primeiro (é ela que diz
 * o que consertar), o SQL do Drizzle depois.
 */
function descreverErro(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const causa = (e as Error & { cause?: unknown }).cause;
  const detalhe =
    causa instanceof Error ? causa.message : typeof causa === "string" ? causa : "";
  return detalhe && !e.message.includes(detalhe) ? `${detalhe} — ${e.message}` : e.message;
}

/** `excluded.coluna` — o valor que o INSERT tentou gravar (padrão do upsert). */
function sqlExcluded(coluna: string) {
  return sql.raw(`excluded.${coluna}`);
}

function semRef(a: Aparencia & { _ref?: number }): Aparencia {
  const { _ref, ...resto } = a;
  void _ref;
  return resto;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Aceita ISO, "YYYY-MM-DD HH:mm:ss" e RFC; devolve ISO ou null. */
export function toIso(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  const s = String(v).trim();
  if (!s) return null;
  const direto = Date.parse(s);
  if (Number.isFinite(direto)) return new Date(direto).toISOString();
  const comT = Date.parse(s.replace(" ", "T"));
  return Number.isFinite(comT) ? new Date(comT).toISOString() : null;
}
