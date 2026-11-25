/**
 * TRACK RECORD — histórico de resultados das oportunidades de valor.
 *
 * 1) `registrarOportunidadesDoDia` grava os palpites gerados hoje (EV > 0).
 * 2) `liquidarPendentes` consulta a fonte (ESPN) dos jogos já encerrados e
 *    marca cada palpite como GREEN ou RED comparando com o placar real.
 * 3) `estatisticas` consolida total, hit rate, unidades (Half-Kelly) e ROI.
 *
 * Unidade = % da banca (stake × 100). Green lucra stake·(odd−1) em unidades;
 * Red perde a stake. ROI = lucro / valor apostado total.
 */
import { db } from "@/db";
import { valueBetHistory } from "@/db/schema";
import { eq, and, inArray, desc, isNull } from "drizzle-orm";
import { getAllMatches, getSummaryRaw, normStats, type Match } from "./espn";
import { analisarOportunidades } from "./opportunitiesEngine";
import { calcularStats, type TrackStats } from "./trackStats";
import { diasCandidatos } from "./semana";
import { montarSeries, serieDoPalpite, rotuloSerie, type SerieAcertos } from "./acertosRecentes";
import { ancorasPinnaclePorEspnId } from "./oddsPinnacle";
import { chaveAncora } from "./comboBuilder";
import { clvPct as calcularClv, agruparPorFaixa, type ResumoFaixas } from "./clv";

export type { TrackStats, SerieAcertos };
export { calcularStats, montarSeries, serieDoPalpite, rotuloSerie };

type Status = "pendente" | "green" | "red";
type Row = {
  id: number; matchId: string; mercado: string; rotulo: string; linha: number | null;
  odd: number; evPct: number; stake: number; probModelo: number; matchDate: string;
  homeName: string; awayName: string; leagueName: string; status: string;
  homeScore: number | null; awayScore: number | null;
  oddAbertura: number | null; oddFechamento: number | null; clvPct: number | null;
};

/* ------------------------------------------------------------------ */
/* 0. CLV — odd da Pinnacle (abertura e fechamento)                     */
/* ------------------------------------------------------------------ */

/**
 * Mercado nosso → chave (market|selection) da odd da Pinnacle no Hub.
 *
 * Só entra o que a Pinnacle realmente cota (`hub_bookmaker_odd`). Cartões e
 * escanteios ficam de fora de propósito: sem par Pinnacle não existe CLV, e
 * estimar com outra casa contradiz a regra do projeto.
 */
const MERCADO_PINNACLE: Record<string, { market: string; selection: string }> = {
  home: { market: "1X2", selection: "Home" },
  draw: { market: "1X2", selection: "Draw" },
  away: { market: "1X2", selection: "Away" },
  btts: { market: "BTTS", selection: "Yes" },
  over25: { market: "Over/Under", selection: "Over 2.5" },
  under25: { market: "Over/Under", selection: "Under 2.5" },
};

/**
 * Odd da Pinnacle para um pick, lida só do banco (nenhum fornecedor é chamado).
 * `null` quando o jogo não está no Hub, quando a Pinnacle não cotou o mercado
 * ou quando o mercado não tem par Pinnacle.
 */
async function oddPinnacleDoPick(espnId: string, mercado: string): Promise<number | null> {
  const alvo = MERCADO_PINNACLE[mercado];
  if (!alvo || !espnId) return null;
  const mapa = await ancorasPinnaclePorEspnId(espnId);
  const odd = mapa[chaveAncora(alvo.market, alvo.selection)];
  return Number.isFinite(odd) && odd > 1.01 ? odd : null;
}

/** Teto de leituras de âncora por execução (protege a lambda e o banco). */
const MAX_ANCORAS = 60;

const dataSP = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

/* ------------------------------------------------------------------ */
/* 1. Registro                                                          */
/* ------------------------------------------------------------------ */

export async function registrarOportunidadesDoDia(opts: {
  date?: string; maxMatches?: number; maxXgApi?: number; limite?: number;
} = {}) {
  const r = await analisarOportunidades({
    date: opts.date,
    maxMatches: opts.maxMatches ?? 8,
    maxXgApi: opts.maxXgApi ?? 6,
  });
  const rows: (typeof valueBetHistory.$inferInsert)[] = r.oportunidades.map((o) => ({
    matchId: o.matchId,
    mercado: o.mercado,
    rotulo: o.rotulo,
    linha: o.linha,
    odd: o.odd,
    evPct: o.evPct,
    stake: o.stake,
    probModelo: o.probModelo,
    matchDate: dataSP(o.kickoff),
    homeName: o.home.name,
    awayName: o.away.name,
    leagueName: o.leagueName,
    status: "pendente" as Status,
  }));
  let novos = 0;
  /** Motivos visíveis para o `registrados: 0` — antes todos viravam silêncio. */
  const avisos: string[] = [];

  /**
   * Opening line: a odd da Pinnacle no instante em que o pick nasce.
   * É a metade que ninguém pode recuperar depois — o Hub sobrescreve a cotação.
   * Sem âncora Pinnacle a coluna fica nula e o pick simplesmente não terá CLV.
   */
  let comAncora = 0;
  for (const row of rows.slice(0, MAX_ANCORAS)) {
    const odd = await oddPinnacleDoPick(String(row.matchId ?? ""), String(row.mercado ?? ""));
    if (odd != null) {
      row.oddAbertura = odd;
      comAncora++;
    }
  }

  if (rows.length) {
    try {
      const ins = await db.insert(valueBetHistory).values(rows).onConflictDoNothing();
      novos = ins?.rowCount ?? 0;
    } catch (e) {
      // Aqui havia um `catch {}`. Com ele, `registrados: 0` podia significar
      // três problemas diferentes: schema faltando, DB fora do ar, ou a
      // constraint nova do M4 recusando um status inesperado. Silêncio em
      // pipeline de dinheiro é o pior diagnóstico possível.
      const msg = e instanceof Error ? e.message : String(e);
      avisos.push(`insert em value_bet_history falhou: ${msg}`);
      console.error("[track-record] insert falhou:", msg);
    }
  }
  return {
    geradoEm: new Date().toISOString(),
    oportunidades: r.oportunidades.length,
    registrados: novos,
    /** Quantos picks nasceram com odd de abertura da Pinnacle (base do CLV). */
    comOddAbertura: comAncora,
    semOddAbertura: rows.length - comAncora,
    avisos,
  };
}

/* ------------------------------------------------------------------ */
/* 2. Liquidação                                                        */
/* ------------------------------------------------------------------ */

function resultadoDoMercado(mercado: string, linha: number | null, dados: {
  gols: number; golsCasa: number; golsFora: number; cartoes: number | null; escanteios: number | null;
}): "green" | "red" | null {
  const { gols, golsCasa, golsFora, cartoes, escanteios } = dados;
  const win = (ok: boolean): "green" | "red" => (ok ? "green" : "red");
  switch (mercado) {
    case "home": return win(golsCasa > golsFora);
    case "draw": return win(golsCasa === golsFora);
    case "away": return win(golsFora > golsCasa);
    case "over25": return win(gols > 2.5);
    case "under25": return win(gols < 2.5);
    case "btts": return win(golsCasa > 0 && golsFora > 0);
    case "cards_over": return cartoes == null ? null : win(cartoes > (linha ?? 3.5));
    case "cards_under": return cartoes == null ? null : win(cartoes < (linha ?? 3.5));
    case "corners_over": return escanteios == null ? null : win(escanteios > (linha ?? 9.5));
    case "corners_under": return escanteios == null ? null : win(escanteios < (linha ?? 9.5));
    default: return null;
  }
}

export async function liquidarPendentes(opts: { dias?: number } = {}) {
  const dias = opts.dias ?? 10;
  const pendentes = await db
    .select()
    .from(valueBetHistory)
    .where(eq(valueBetHistory.status, "pendente"))
    .then((rows) => rows as Row[]);

  const porData = new Map<string, Row[]>();
  for (const p of pendentes) {
    const arr = porData.get(p.matchDate) || [];
    arr.push(p);
    porData.set(p.matchDate, arr);
  }

  let liquidados = 0;
  const falhas: string[] = [];
  const avisos: string[] = [];
  const resumo = { green: 0, red: 0 };
  /** Quantas closing lines (CLV) foram gravadas nesta passagem. */
  let capturados = 0;
  let semFonte = 0;
  let leituras = 0;

  // Jogos por dia, buscados no máximo uma vez cada. `null` = a fonte falhou.
  const jogosCache = new Map<string, Match[] | null>();
  async function jogosDoDia(ymd: string): Promise<Match[] | null> {
    if (!jogosCache.has(ymd)) {
      try {
        jogosCache.set(ymd, await getAllMatches(ymd));
      } catch (e) {
        // Antes: `continue` calado. Uma fonte fora do ar fazia o dia inteiro
        // parecer "nada a liquidar", e os palpites ficavam pendentes para sempre.
        const msg = e instanceof Error ? e.message : String(e);
        avisos.push(`fonte falhou em ${ymd}: ${msg}`);
        console.error(`[track-record] getAllMatches(${ymd}) falhou:`, msg);
        jogosCache.set(ymd, null);
      }
    }
    return jogosCache.get(ymd) ?? null;
  }

  /**
   * O `match_date` gravado no registro nem sempre é o dia em que a fonte lista
   * o jogo: o horário local (America/Sao_Paulo) e o fuso do provedor discordam,
   * e um jogo que começa 21h de sábado aparece no feed de domingo (ou vice-versa).
   * Sem o fallback nos dias vizinhos, a pick ficava "pendente" para sempre —
   * justamente o caso do Tigres UANL x América (match_date 11-22, feed 11-21).
   */
  async function acharJogo(matchId: string, data: string): Promise<Match | undefined> {
    for (const ymd of diasCandidatos(data)) {
      const jogos = await jogosDoDia(ymd);
      if (!jogos) continue;
      const m = jogos.find((j) => j.id === matchId);
      if (m) return m;
    }
    return undefined;
  }

  for (const [data, rows] of porData) {
    // cache de estatísticas por matchId (cartões/escanteios exigem summary)
    const statsCache = new Map<string, { cartoes: number; escanteios: number } | null>();

    for (const row of rows) {
      const m = row.matchId ? await acharJogo(row.matchId, data) : undefined;
      if (!m) continue;

      /**
       * CLOSING LINE. Assim que o jogo saiu do "pré", a cotação que está no Hub
       * é a última leitura da Pinnacle que existe — é o fechamento possível sem
       * histórico de odds. Gravamos na primeira passagem do cron e nunca
       * sobrescrevemos (o primeiro valor é o mais próximo do apito inicial).
       */
      let fechamento: { oddFechamento: number; clvPct: number | null; fechamentoEm: Date } | null = null;
      if (m.state !== "pre" && row.oddFechamento == null && leituras < MAX_ANCORAS) {
        leituras++;
        const odd = await oddPinnacleDoPick(row.matchId, row.mercado);
        if (odd != null) {
          fechamento = {
            oddFechamento: odd,
            clvPct: calcularClv(row.oddAbertura, odd),
            fechamentoEm: new Date(),
          };
        } else {
          semFonte++;
        }
      }

      if (m.state !== "post" || m.home.score == null || m.away.score == null) {
        // Jogo em andamento: a closing line já pode ser registrada mesmo sem
        // resultado. `isNull` na condição garante que ninguém regrava.
        if (fechamento) {
          try {
            await db.update(valueBetHistory).set(fechamento)
              .where(and(eq(valueBetHistory.id, row.id), isNull(valueBetHistory.oddFechamento)));
            capturados++;
          } catch (e) {
            avisos.push(`fechamento ${row.id} falhou: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        continue;
      }

      const golsCasa = m.home.score, golsFora = m.away.score;
      let cartoes: number | null = null, escanteios: number | null = null;

      if (row.mercado.startsWith("cards") || row.mercado.startsWith("corners")) {
        if (!statsCache.has(row.matchId)) {
          try {
            const sm = await getSummaryRaw(m.league, m.id, "post");
            const s = sm ? normStats(sm, m.home.id) : null;
            const v = (k: string, side: "home" | "away") => {
              const rowS = s?.find((x: any) => x.key === k);
              return rowS ? Number(String(side === "home" ? rowS.home : rowS.away)) : null;
            };
            const yh = v("yellowCards", "home") ?? 0, ya = v("yellowCards", "away") ?? 0;
            const rh = v("redCards", "home") ?? 0, ra = v("redCards", "away") ?? 0;
            const ch = v("wonCorners", "home") ?? 0, ca = v("wonCorners", "away") ?? 0;
            statsCache.set(row.matchId, { cartoes: yh + ya + rh + ra, escanteios: ch + ca });
          } catch {
            statsCache.set(row.matchId, null);
          }
        }
        const st = statsCache.get(row.matchId);
        cartoes = st?.cartoes ?? null;
        escanteios = st?.escanteios ?? null;
      }

      const status = resultadoDoMercado(row.mercado, row.linha, {
        gols: golsCasa + golsFora, golsCasa, golsFora, cartoes, escanteios,
      });      if (!status) continue;

      try {
        await db.update(valueBetHistory).set({
          status,
          homeScore: golsCasa,
          awayScore: golsFora,
          settledAt: new Date(),
          // Uma única UPDATE leva o resultado e o fechamento quando os dois
          // chegam na mesma passagem do cron.
          ...(fechamento ?? {}),
        }).where(and(eq(valueBetHistory.id, row.id), eq(valueBetHistory.status, "pendente")));
        if (fechamento) capturados++;
        liquidados++;
        resumo[status]++;
      } catch {
        falhas.push(String(row.id));
      }
    }
  }

  return {
    liquidados,
    resumo,
    falhas,
    avisos,
    /** CLV: fechamentos gravados nesta passagem / jogos sem cotação Pinnacle. */
    clv: { fechamentos: capturados, semOddPinnacle: semFonte },
  };
}

/* ------------------------------------------------------------------ */
/* 3. Estatísticas                                                      */
/* ------------------------------------------------------------------ */

export async function estatisticas(): Promise<TrackStats> {
  const rows = (await db.select().from(valueBetHistory)) as Row[];
  return calcularStats(rows);
}

/**
 * Track record por FAIXA DE ODD, com CLV médio por faixa.
 *
 * Só leitura: a conta toda está em `clv.ts` (puro, testado). Falha de banco
 * devolve o resumo vazio — a tela mostra o estado vazio, nunca número fake.
 */
export async function faixasDeOdd(): Promise<ResumoFaixas> {
  try {
    const rows = await db
      .select({
        odd: valueBetHistory.odd,
        status: valueBetHistory.status,
        clvPct: valueBetHistory.clvPct,
      })
      .from(valueBetHistory);
    return agruparPorFaixa(rows);
  } catch (e) {
    console.error("[track-record] faixasDeOdd falhou:", e instanceof Error ? e.message : String(e));
    return agruparPorFaixa([]);
  }
}

/* ------------------------------------------------------------------ */
/* 4. Acertos recentes (selo "IA Acertou os 3 últimos")                 */
/* ------------------------------------------------------------------ */

/**
 * Carrega o histórico liquidado (mais recente primeiro) e monta o mapa
 * `time|mercado → série` usado pelo selo. Erro de banco → mapa vazio (nenhum
 * selo é mostrado: nunca inventamos acerto).
 */
export async function seriesAcertosRecentes(
  opts: { janela?: number; minimo?: number; limite?: number } = {},
): Promise<Map<string, SerieAcertos>> {
  const limite = opts.limite ?? 400;
  let rows: Row[] = [];
  try {
    rows = (await db
      .select()
      .from(valueBetHistory)
      .where(inArray(valueBetHistory.status, ["green", "red"]))
      .orderBy(desc(valueBetHistory.id))
      .limit(limite)) as Row[];
  } catch (e) {
    // Falha de banco continua virando mapa vazio (nenhum selo é mostrado:
    // nunca inventamos acerto), mas agora deixa rastro no log.
    console.error("[track-record] seriesAcertosRecentes falhou:", e instanceof Error ? e.message : String(e));
    return new Map();
  }
  return montarSeries(rows, opts);
}

/**
 * Anota nas oportunidades o campo `acertosRecentes` + `serieRecente`
 * ("3/3"), consultando o Track Record UMA vez para a lista inteira.
 *
 * Muta o array recebido (os objetos já vão ser serializados na página) e
 * devolve a mesma lista para facilitar o uso em cadeia.
 */
export async function anotarAcertosRecentes<T extends { home: { name: string }; away: { name: string }; mercado: string }>(
  oportunidades: T[],
  opts: { janela?: number; minimo?: number } = {},
): Promise<T[]> {
  if (!oportunidades.length) return oportunidades;
  const mapa = await seriesAcertosRecentes(opts);
  if (!mapa.size) return oportunidades;

  for (const o of oportunidades) {
    const hit = serieDoPalpite(mapa, o.home.name, o.away.name, o.mercado);
    if (!hit) continue;
    const alvo = o as T & { acertosRecentes?: boolean; serieRecente?: string | null };
    alvo.acertosRecentes = hit.serie.acertosRecentes;
    alvo.serieRecente = rotuloSerie(hit.serie);
  }
  return oportunidades;
}