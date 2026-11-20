/* Camada de dados dos RANKINGS: ESPN → jogos por equipe → total de escanteios e cartões.
   Tudo read-only e cacheado. Nenhuma API paga é chamada aqui. */

import { cached, fetchJson } from "./cache";
import { espnGet, getSchedule, leagueInfo, ymd, type Match } from "./espn";
import {
  extrairEstatisticasScoreboard,
  type EntradaTime,
  type EstatJogo,
  type JogoEquipe,
} from "./rankingsEngine";

/** Ligas oferecidas no seletor da tela de rankings. */
export const LIGAS_RANKING = ["eng.1", "esp.1", "ita.1", "ger.1", "fra.1", "bra.1"] as const;

const MAX_TIMES = 20; // times por liga (a classificação inteira cabe em 20)
const MAX_JOGOS_POR_TIME = 30; // teto de histórico por equipe
const MAX_DATAS_ESTAT = 26; // datas que gastam uma chamada de scoreboard cada
const TTL_ESTAT = 30 * 60 * 1000; // 30 min
const TTL_LIGA = 60 * 60 * 1000; // 1 hora para a liga inteira já montada
const CONCORRENCIA = 4; // chamadas simultâneas na ESPN

/** Executa `fn` para cada item com concorrência limitada (evita 403 em rajada). */async function mapLimit<T, R>(itens: T[], limite: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(itens.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limite, itens.length) }, async () => {
    while (i < itens.length) {
      const idx = i++;
      res[idx] = await fn(itens[idx]);
    }
  });
  await Promise.all(workers);
  return res;
}

/** Converte os eventos da agenda de um time em jogos na ótica daquele time. */
function jogosDoTime(eventos: Match[], teamId: string): JogoEquipe[] {
  const jogos: JogoEquipe[] = [];
  for (const m of eventos) {
    if (!m.finished) continue;
    if (m.home.score == null || m.away.score == null) continue;
    const emCasa = m.home.id === teamId;
    jogos.push({
      id: m.id,
      date: m.date,
      home: emCasa,
      gf: emCasa ? m.home.score : m.away.score,
      ga: emCasa ? m.away.score : m.home.score,
      corners: null,
      cards: null,
    });
  }
  return jogos;
}

/**
 * Times da classificação direto da ESPN (sem passar pela cascata que depende do banco).
 * O ranking só precisa de id, nome e escudo — não precisa da tabela conciliada.
 */
async function timesDaTabela(code: string): Promise<{ teamId: string; name: string; short?: string; logo: string }[]> {
  const data = await fetchJson(
    `https://site.api.espn.com/apis/v2/sports/soccer/${code}/standings`,
    {},
    30 * 60 * 1000,
    `rankings-tabela-${code}`,
  ).catch(() => null);
  const grupos: any[] = data?.children || [];
  const rows: any[] = grupos.flatMap((g) => g?.standings?.entries || []);
  return rows
    .map((en) => ({
      teamId: String(en?.team?.id ?? ""),
      name: en?.team?.displayName || en?.team?.name || "",
      short: en?.team?.shortDisplayName,
      logo: en?.team?.logos?.[0]?.href || "",
    }))
    .filter((r) => r.teamId && r.name);
}

async function estatisticasDaData(liga: string, data: Date): Promise<Map<string, EstatJogo>> {
  const raw = await espnGet(`/${liga}/scoreboard?dates=${ymd(data)}`, TTL_ESTAT, `rank-esc-${liga}-${ymd(data)}`).catch(() => null);
  return raw ? extrairEstatisticasScoreboard(raw) : new Map();
}

/** Monta a base de uma liga: todos os times da classificação + histórico + estatística. */
async function ligaParaRanking(code: string): Promise<EntradaTime[]> {
  return cached(`rankings-liga-${code}`, TTL_LIGA, async () => {
    const info = leagueInfo(code);
    const linhas = (await timesDaTabela(code)).slice(0, MAX_TIMES);
    if (!linhas.length) return [];

    /* 1) Agenda de cada time: é a fonte do placar (exata e completa por equipe). */
    const base = await mapLimit(linhas, CONCORRENCIA, async (row: any) => {
      const teamId = String(row.teamId);
      const { events } = await getSchedule(code, teamId).catch(() => ({ season: null, events: [] as Match[] }));
      const jogos = jogosDoTime(events, teamId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, MAX_JOGOS_POR_TIME);
      return { row, teamId, jogos };
    });

    /* 2) Datas que faltam estatística: escolhidas por VOLUME (a data que cobre mais
          jogos entra primeiro), até o teto. Assim o pouco orçamento disponível rende
          a maior cobertura possível — e quem não foi coberto fica null, não zero. */
    const jogosPorData = new Map<string, Date>();
    for (const b of base) {
      for (const j of b.jogos) {
        const d = new Date(j.date);
        if (!Number.isNaN(d.getTime())) jogosPorData.set(ymd(d), d);
      }
    }
    const alvo = [...jogosPorData.values()]
      .sort((a, b) => b.getTime() - a.getTime())
      .slice(0, MAX_DATAS_ESTAT);

    const stats = new Map<string, EstatJogo>();
    const porData = await mapLimit(alvo, 3, (d) => estatisticasDaData(code, d));
    for (const m of porData) for (const [id, v] of m) stats.set(id, v);

    /* 3) Junta tudo: o jogo herda corners/cards quando a data foi observada. */
    return base.map((b) => ({
      id: b.teamId,
      nome: b.row.name || b.row.short || "—",
      escudo: b.row.logo || "",
      liga: info.name,
      ligaCodigo: code,
      jogos: b.jogos.map((j) => {
        const st = stats.get(j.id);
        return { ...j, corners: st?.corners ?? null, cards: st?.cards ?? null };
      }),
    }));
  });
}

/**
 * Base de uma ou mais ligas. `codigos` é sempre explícito (a UI decide), e cada
 * liga é buscada em sequência para não disparar rajada na ESPN.
 */
export async function dadosRankings(codigos: string[]): Promise<EntradaTime[]> {
  const validos = codigos.filter((c) => (LIGAS_RANKING as readonly string[]).includes(c));
  const out: EntradaTime[] = [];
  for (const code of validos) {
    try {
      out.push(...(await ligaParaRanking(code)));
    } catch {
      /* Liga que falhou não inventa dado: fica de fora e a UI mostra o aviso. */
    }
  }
  return out;
}
