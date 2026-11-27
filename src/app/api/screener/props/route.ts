import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { playerPropsCache } from "@/db/schema";
import {
  getAllMatches,
  getTeamHistory,
  getTeamHistoryElenco,
  getTeamScheduleGames,
  leagueInfo,
  todayYmd,
  type HistGame,
  type JogadorHist,
  type Match,
} from "@/lib/espn";
import { cached } from "@/lib/cache";
import { getPropsDoTime, PROPS_DISABLED, type PayloadTime } from "@/lib/playerProps";
import type { JogoValores } from "@/lib/playerPropsEngine";
import { getUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import {
  avaliarSerie,
  descreverConsulta,
  filtrarOrdenar,
  metricaPorId,
  metricasDe,
  normalizarConsulta,
  JANELAS,
  MIN_AMOSTRA,
  TAXA_MAX,
  TAXA_MIN,
  TAXA_PADRAO,
  type Candidato,
} from "@/lib/screenerProps";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/* =============================================================================
   SCREENER AVANÇADO — "quem bate este filtro no histórico".

   Filtros: entidade (jogador/time) · métrica · condição · linha · janela (3/5/10)
   · taxa mínima. A resposta é frequência observada, nunca probabilidade.

   De onde vem o dado (nesta ordem):
   1. BANCO  — `player_props_cache` (jogadores) já coletado por outra tela.
   2. ESPN   — histórico do time (calendário grátis / resumo para cantos e cartões).
   3. FONTE PAGA — API-Football via `getPropsDoTime`, SÓ para conta ativa e com
      orçamento por requisição. O cache vale 24 h, então cada rodada esquenta mais
      times de graça para a próxima.
   ========================================================================== */

/** Times varridos por consulta, por custo da coleta. */
const TETO_TIME_A = 16;
const TETO_TIME_B = 8;
const TETO_JOGADOR = 12;

/** Times que o fallback gratuito (ESPN) varre por consulta — 1 resumo por jogo. */
const TETO_JOGADOR_ESPN = 4;

const TTL_JOGADOR_ESPN = 20 * 60_000;

/** Times que a consulta pode buscar na fonte paga (por janela escolhida). */
const orcamentoApi = (janela: number): number => (janela >= 10 ? 2 : janela >= 5 ? 3 : 4);

type Equipe = { id: string; nome: string; league: string; leagueName: string; flag: string };

const TTL_TIME_A = 30 * 60_000;
const TTL_TIME_B = 20 * 60_000;

/** Nome normalizado — mesma chave usada por `player_props_cache`. */
const norm = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

/** Concorrência baixa: o Akamai do ESPN devolve 403 em rajada. */
async function emLotes<T, R>(itens: T[], tamanho: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = [];
  for (let i = 0; i < itens.length; i += tamanho) {
    saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))));
    if (i + tamanho < itens.length) await new Promise((r) => setTimeout(r, 120));
  }
  return saida;
}

/** Times dos jogos do dia (mesma base gratuita do Screener de mercados). */
async function equipesDoDia(liga: string): Promise<{ equipes: Equipe[]; jogos: number; truncado: boolean }> {
  const chave = `screenerProps:equipes:${todayYmd()}:${liga}`;
  const bruto = await cached<{ equipes: Equipe[]; jogos: number; truncado: boolean }>(chave, 20 * 60_000, async () => {
    let jogos = await getAllMatches(todayYmd(), liga === "all" ? undefined : [liga]);
    jogos = jogos.filter((m: Match) => m.state !== "post");
    if (liga === "all") jogos = jogos.filter((m) => leagueInfo(m.league).priority <= 9);

    const porChave = new Map<string, Equipe>();
    for (const m of jogos) {
      for (const lado of [m.home, m.away] as const) {
        const k = `${m.league}:${lado.id}`;
        if (porChave.has(k)) continue;
        porChave.set(k, { id: lado.id, nome: lado.name, league: m.league, leagueName: m.leagueName, flag: m.flag });
      }
    }
    return { equipes: [...porChave.values()], jogos: jogos.length, truncado: false };
  }).catch(() => ({ equipes: [] as Equipe[], jogos: 0, truncado: false }));

  const teto = liga === "all" ? 60 : 30;
  const truncado = bruto.equipes.length > teto;
  return { equipes: bruto.equipes.slice(0, teto), jogos: bruto.jogos, truncado };
}

/** Histórico do time conforme o custo da métrica (schedule vs resumo de cada jogo). */
async function historicoDoTime(eq: Equipe, etapa: "A" | "B", janela: number) {
  const chave = `screenerProps:hist:${etapa}:${eq.league}:${eq.id}:${janela}`;
  const ttl = etapa === "B" ? TTL_TIME_B : TTL_TIME_A;
  const vazio = { games: [] as HistGame[], source: "ESPN" };
  return cached(chave, ttl, () =>
    etapa === "B" ? getTeamHistory(eq.league, eq.id, janela) : getTeamScheduleGames(eq.league, eq.id, janela),
  ).catch(() => vazio);
}

/**
 * Elenco com estatística individual jogo a jogo, direto do ESPN (grátis).
 *
 * O resumo de cada partida já traz `rosters[].roster[].stats`; é o mesmo
 * caminho de custo da Etapa B, então só varremos TETO_JOGADOR_ESPN times por
 * consulta e guardamos 20 min por time+janela.
 */
async function elencoDoTime(eq: Equipe, janela: number): Promise<JogadorHist[]> {
  const chave = `screenerProps:elenco:${eq.league}:${eq.id}:${janela}`;
  return cached(chave, TTL_JOGADOR_ESPN, () => getTeamHistoryElenco(eq.league, eq.id, janela))
    .then((r) => r.players)
    .catch(() => [] as JogadorHist[]);
}

/** Cache de props por time, lido do banco (uma consulta só, tabela pequena). */
async function propsEmCache(): Promise<Map<string, PayloadTime & { fetchedAt: Date }>> {
  const out = new Map<string, PayloadTime & { fetchedAt: Date }>();
  try {
    const rows = await db.select().from(playerPropsCache);
    for (const r of rows) {
      out.set(r.teamKey, {
        ...(r.payload as PayloadTime),
        teamId: r.teamId,
        teamName: r.teamName,
        sample: r.sample,
        fetchedAt: new Date(r.fetchedAt),
      });
    }
  } catch {
    /* banco fora: segue só com a fonte */
  }
  return out;
}

export async function POST(req: NextRequest) {
  const gate = await rateLimit("screener:props", clientIp(req), { limit: 40, windowSec: 3600 });
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Muitas consultas seguidas. Tente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(gate.retryAfterSec ?? 60) } },
    );
  }

  const body = await req.json().catch(() => null);
  const validada = normalizarConsulta(body);
  if (!validada.ok) return NextResponse.json({ error: validada.erro }, { status: 400 });
  const consulta = validada.consulta;
  const { def } = consulta;

  try {
    const { equipes, jogos } = await equipesDoDia(consulta.liga);

    /* ---------------- TIME ---------------- */
    if (consulta.entidade === "time") {
      const etapa = def.etapa ?? "A";
      const teto = etapa === "B" ? TETO_TIME_B : TETO_TIME_A;
      const alvo = equipes.slice(0, teto);
      const semDados: { nome: string; motivo: string }[] = [];

      const candidatos: Candidato[] = [];
      const avaliados = await emLotes(alvo, 3, async (eq) => {
        const h = await historicoDoTime(eq, etapa, consulta.janela);
        if (!h.games.length) return null;
        const valores = h.games
          .slice()
          .sort((a, b) => String(a.date).localeCompare(String(b.date))) // antigo → recente
          .slice(-consulta.janela)
          .map((g) => def.valorTime?.(g) ?? null);
        const av = avaliarSerie(valores, consulta);
        if (!av) return null;
        return {
          id: eq.id,
          nome: eq.nome,
          contexto: `${eq.flag} ${eq.leagueName}`,
          avaliacao: av,
        } satisfies Candidato;
      });

      for (let i = 0; i < alvo.length; i++) {
        const c = avaliados[i];
        if (c) candidatos.push(c);
        else semDados.push({ nome: alvo[i].nome, motivo: "sem histórico com dado na janela" });
      }

      const resultados = filtrarOrdenar(candidatos, consulta.taxaMinima);
      return NextResponse.json({
        entidade: consulta.entidade,
        metrica: { id: def.id, label: def.label, criterio: def.criterio, linha: consulta.linha },
        consulta: { ...consulta, def: undefined, descricao: descreverConsulta(consulta) },
        resultados,
        avaliados: alvo.length,
        total: resultados.length,
        jogosNaRodada: jogos,
        trilha: { banco: 0, espn: alvo.length, api: 0 },
        semDados: semDados.slice(0, 8),
        aviso:
          "Frequência observada nos jogos com dado. Não é probabilidade nem garantia do próximo jogo." +
          (etapa === "B" ? " Cantos, cartões e finalizações exigem o resumo de cada jogo: varremos menos times por vez." : ""),
        fonte: "ESPN",
        atualizadoEm: new Date().toISOString(),
      });
    }

    /* ---------------- JOGADOR ---------------- */
    const user = await getUser().catch(() => null);
    const vip = !!user && (user.isAdmin || user.access.active);
    const cache = await propsEmCache();

    const alvo = equipes.slice(0, TETO_JOGADOR);
    let orcamento = vip && !PROPS_DISABLED ? orcamentoApi(consulta.janela) : 0;
    /* `espn` = orçamento restante do fallback grátis; `espnUsado` = times servidos por ele. */
    const trilha = { banco: 0, espn: TETO_JOGADOR_ESPN, espnUsado: 0, api: 0 };
    const semDados: { nome: string; motivo: string }[] = [];
    const candidatos: Candidato[] = [];

    for (const eq of alvo) {
      const chave = norm(eq.nome);
      let time: PayloadTime | null = null;
      /* Quem respondeu por este time: banco, ESPN ou fonte paga. */
      let deOnde: "banco" | "espn" | "api" | null = null;

      const emCache = cache.get(chave);
      if (emCache && (emCache.sample >= consulta.janela || (emCache.janela ?? 0) >= consulta.janela)) {
        time = emCache;
        deOnde = "banco";
      }

      /* ESPN: grátis e sem login. Serve as métricas que o resumo publica por
         atleta (finalizações, chutes no gol, gols, assistências, faltas,
         cartões, defesas). Sem isso, a aba Jogadores ficava 100% dependente da
         cota paga — e vazia sempre que a fonte paga caía. */
      if (!time && def.statEspn && trilha.espn > 0) {
        const elenco = await elencoDoTime(eq, consulta.janela);
        trilha.espn--;
        if (elenco.length) {
          const jogadores: PayloadTime["jogadores"] = elenco.map((j) => ({
            id: j.id, nome: j.nome, posicao: j.posicao, foto: j.foto || null,
            /* A chave é `def.stat` (a que o motor lê), o valor vem do ESPN. */
            jogos: j.jogos.map((jg) => (jg && def.stat ? ({ [def.stat]: jg[def.statEspn!] } as JogoValores) : ({} as JogoValores))),
          }));
          if (jogadores.length) {
            time = { teamId: eq.id, teamName: eq.nome, sample: consulta.janela, janela: consulta.janela, jogadores };
            deOnde = "espn";
          }
        }
      }

      /* Fonte paga: só para conta ativa e só se o ESPN não resolveu. */
      if (!time && orcamento > 0) {
        const buscado = await getPropsDoTime(eq.nome, { jogos: consulta.janela }).catch(() => null);
        orcamento--;
        if (buscado?.jogadores?.length) {
          time = buscado;
          deOnde = "api";
        }
      }

      /* Cache mais curto que a janela pedida: publica a amostra que existe
         (o `avaliarSerie` recusa abaixo de MIN_AMOSTRA, nunca inventa). */
      if (!time && emCache) {
        time = emCache;
        deOnde = "banco";
      }

      if (deOnde === "banco") trilha.banco++;
      else if (deOnde === "espn") trilha.espnUsado++;
      else if (deOnde === "api") trilha.api++;

      if (!time?.jogadores?.length) {
        semDados.push({
          nome: eq.nome,
          motivo:
            !def.statEspn && !vip
              ? "essa métrica (passes) só existe na fonte paga — sem conta ativa não há de onde tirar"
              : vip
                ? "sem estatística de jogador na fonte"
                : "sem histórico individual com dado na janela",
        });
        continue;
      }

      for (const j of time.jogadores) {
        const valores = (j.jogos || []).map((jg) => (def.stat ? (jg[def.stat] ?? null) : null));
        const av = avaliarSerie(valores, consulta);
        if (!av) continue;
        candidatos.push({
          id: `${time.teamId || chave}:${j.id}`,
          nome: j.nome,
          contexto: time.teamName || eq.nome,
          posicao: j.posicao,
          foto: j.foto ?? null,
          avaliacao: av,
        });
      }
    }

    const resultados = filtrarOrdenar(candidatos, consulta.taxaMinima);

    return NextResponse.json({
      entidade: consulta.entidade,
      metrica: { id: def.id, label: def.label, criterio: def.criterio, linha: consulta.linha },
      consulta: { ...consulta, def: undefined, descricao: descreverConsulta(consulta) },
      resultados,
      avaliados: alvo.length,
      total: resultados.length,
      jogosNaRodada: jogos,
      trilha: { banco: trilha.banco, espn: trilha.espnUsado, api: trilha.api },
      semDados: semDados.slice(0, 10),
      cobertura: {
        jogadoresAvaliados: candidatos.length,
        contaAtiva: vip,
        orcamentoRestante: orcamento,
      },
      aviso:
        "Frequência observada nos jogos com dado. Não é probabilidade nem garantia do próximo jogo." +
        (trilha.espnUsado > 0
          ? " Estatística individual do ESPN (mesmo resumo das outras abas)."
          : !def.statEspn
            ? " O ESPN não publica esta estatística por atleta: sem conta ativa com fonte paga, ela fica sem dado."
            : ""),
      fonte:
        trilha.api > 0 && trilha.espnUsado > 0
          ? "cache + ESPN + API-Football"
          : trilha.api > 0
            ? "cache + API-Football"
            : trilha.espnUsado > 0
              ? "ESPN"
              : "cache",
      atualizadoEm: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao filtrar." }, { status: 502 });
  }
}

/** Metadados do painel: entidades, métricas, janelas e limites publicados. */
export async function GET() {
  return NextResponse.json({
    entidades: ["jogador", "time"],
    metricas: metricasDe("jogador")
      .concat(metricasDe("time"))
      .map((m) => ({
        id: m.id,
        entidade: m.entidade,
        label: m.label,
        criterio: m.criterio,
        linhaPadrao: m.linhaPadrao,
        passo: m.passo,
        etapa: m.etapa ?? null,
      })),
    janelas: JANELAS,
    taxa: { padrao: TAXA_PADRAO, min: TAXA_MIN, max: TAXA_MAX },
    minAmostra: MIN_AMOSTRA,
    tetos: { timeA: TETO_TIME_A, timeB: TETO_TIME_B, jogador: TETO_JOGADOR },
    /* `null` quando o id não existe — a UI nunca recebe métrica inventada. */
    exemplo: metricaPorId("j_passes_certos")?.label ?? null,
  });
}
