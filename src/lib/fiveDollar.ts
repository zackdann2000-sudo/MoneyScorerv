/* =======================================================================
   5DOLLARFOOTBALLAPI — odds e mercados de apostas
   -----------------------------------------------------------------------
   Docs: https://5dollarfootballapi.com/docs

   Base URL: https://api.5dollarfootballapi.com/v1
   Auth: `Authorization: Bearer <key>` (ou header X-API-Key).
   Formato: top-level { "success": 1, "data": ... } — timestamps em UTC ISO-8601.
   Compatível com API-Football (troca base + key, mas os ids são próprios).

   Atenção: não é possível listar odds por DATA como na API-Football;
   as odds se buscam por fixture id: GET /fixtures/{id}/odds.

   Este cliente está ISOLADO. Não está ligado à cascata de providers.ts.
   ======================================================================= */

const BASE_URL = "https://api.5dollarfootballapi.com/v1";

export type FiveDollarError = { type?: string; code?: string; message?: string; doc_url?: string };

/** Resposta-padrão: success 0/1, data conforme o endpoint. */
export type FiveDollarEnvelope<T> = {
  success: 0 | 1;
  data: T | null;
  error?: FiveDollarError;
  request_id?: string;
};

/* ---------------- Fixture compacta (listas) ---------------- */

export type FiveDollarTeamRef = { id?: string | number; name?: string; logo?: string | null };

export type FiveDollarFixtureListItem = {
  id: string | number;
  league?: { id?: string | number; name?: string; country?: string; logo?: string | null };
  teams?: { home?: FiveDollarTeamRef; away?: FiveDollarTeamRef };
  status?: string; // ex.: "in_play" | "finished" | "not_started"
  goals?: { home?: number | null; away?: number | null };
  corners?: { home?: number | null; away?: number | null };
  kickoff_utc?: string;
};

/* ---------------- Odds (1X2, handicap, gols) ---------------- */

export type FiveDollarPriceSet = {
  home?: number | string | null;
  draw?: number | string | null;
  away?: number | string | null;
  over?: number | string | null;
  under?: number | string | null;
  line?: number | string | null;
  opened_at?: string | null;
};

export type FiveDollarMarketOdds = {
  opening?: FiveDollarPriceSet | null;
  closing?: FiveDollarPriceSet | null;
  inplay?: FiveDollarPriceSet | null;
};

export type FiveDollarBookmaker = {
  name?: string;
  slug?: string;
  odds?: {
    "1x2"?: FiveDollarMarketOdds | null;
    asian_handicap?: FiveDollarMarketOdds | null;
    goal_line?: FiveDollarMarketOdds | null;
    goal_line_fixed?: FiveDollarMarketOdds | null;
    corner_line?: FiveDollarMarketOdds | null;
    corner_asian?: FiveDollarMarketOdds | null;
    card_line?: FiveDollarMarketOdds | null;
    card_asian?: FiveDollarMarketOdds | null;
    btts?: FiveDollarMarketOdds | null;
    [k: string]: unknown;
  };
};

export type FiveDollarFixtureOdds = {
  fixture_id: string | number;
  bookmakers: FiveDollarBookmaker[];
};

export type FiveDollarFetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  requestId?: string;
};

/**
 * Fetch base do 5DollarFootballAPI.
 * @param path ex.: "/fixtures?status=live" ou "/fixtures/123/odds"
 */
export async function fiveDollarFetch<T = unknown>(path: string, opts: { signal?: AbortSignal } = {}): Promise<FiveDollarFetchResult<T>> {
  const key = (process.env.FIVE_DOLLAR_API_KEY || "").trim();
  if (!key) {
    return { ok: false, status: 0, data: null, error: "FIVE_DOLLAR_API_KEY não configurada." };
  }

  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: opts.signal });
    const raw = (await res.json().catch(() => null)) as FiveDollarEnvelope<T> | null;

    if (!res.ok || !raw || raw.success !== 1) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: raw?.error?.message || `HTTP ${res.status}`,
        requestId: raw?.request_id,
      };
    }
    return { ok: true, status: res.status, data: raw.data, requestId: raw.request_id };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: String(e?.message || e).slice(0, 160) };
  }
}

/* ---------------- Atalhos tipados (somente leitura) ---------------- */

/** Fixtures com status (live / scheduled / finished, etc.). */
export const fiveDollarFixtures = (params: { status?: string; date?: string; league?: string | number } = {}, opts?: { signal?: AbortSignal }) => {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.date) q.set("date", params.date);
  if (params.league) q.set("league", String(params.league));
  const qs = q.toString();
  return fiveDollarFetch<FiveDollarFixtureListItem[]>(`/fixtures${qs ? `?${qs}` : ""}`, opts);
};

/** Detalhe com estatísticas (inclui 1º tempo, escanteios, cartões). */
export const fiveDollarFixture = (id: string | number, opts?: { signal?: AbortSignal }) =>
  fiveDollarFetch<FiveDollarFixtureListItem & { statistics?: Record<string, unknown>; events?: unknown[] }>(`/fixtures/${id}?include=events,stats`, opts);

/** Odds completas de um fixture (mercados 1x2, asian, gols, cantos, cartões). */
export const fiveDollarOdds = (id: string | number, market?: "1x2" | "asian" | "goalline" | "goalline_fixed" | "corner" | "corner_asian" | "cards" | "cards_asian" | "asian_half" | "goalline_half" | "corner_half" | "btts", opts?: { signal?: AbortSignal }) =>
  fiveDollarFetch<FiveDollarFixtureOdds>(`/fixtures/${id}/odds${market ? `?market=${market}` : ""}`, opts);
/* =======================================================================
   MAPEAMENTO E ESTATÍSTICAS COMPARATIVAS (integração na tela de Estatísticas)
   -----------------------------------------------------------------------
   O id do 5Dollar é diferente do id da API-Football e do id da ESPN.
   A chave canônica do nosso cache continua sendo o match_id da ESPN; o id
   do 5Dollar é resolvido a cada consulta por NOME DOS TIMES + DATA e depois
   guardado em fixture_id.

   LIMITAÇÃO CONHECIDA (plano Free): só as 5 grandes ligas europeias são
   listadas — Premier League, La Liga, Serie A, Bundesliga, Ligue 1.
   Fora disso a listagem volta vazia e a cascata simplesmente segue adiante.
   ======================================================================= */

import type { TeamStatMetric } from "./providers";

/** Liga ESPN → nome da liga no 5Dollar (comparação sem acento/caixa). */
export const MAPEAMENTO_LIGAS: Record<string, string[]> = {
  "eng.1": ["england premier league", "premier league"],
  "esp.1": ["spain la liga", "la liga"],
  "ita.1": ["italy serie a", "serie a"],
  "ger.1": ["germany bundesliga", "bundesliga"],
  "fra.1": ["france ligue 1", "ligue 1"],
};

/**
 * Apelidos conhecidos entre a ESPN e o 5Dollar. Os nomes das duas casas
 * divergem bastante ("Man Utd" x "Manchester United", "Inter Milan" x
 * "Internazionale"), e comparar só por prefixo erra o par.
 * Chave e valor já normalizados por `chaveNome`.
 */
const APELIDOS: Record<string, string> = {
  "man utd": "manchester united",
  "man united": "manchester united",
  "man city": "manchester city",
  "inter": "internazionale",
  "inter milan": "internazionale",
  "internazionale milano": "internazionale",
  "ac milan": "milan",
  "milan": "milan",
  "psg": "paris saint germain",
  "paris sg": "paris saint germain",
  "atletico": "atletico madrid",
  "atletico de madrid": "atletico madrid",
  "athletic": "athletic bilbao",
  "athletic club": "athletic bilbao",
  "real betis": "betis",
  "betis": "betis",
  "saint etienne": "st etienne",
  "bayern": "bayern munich",
  "bayern munchen": "bayern munich",
  "dortmund": "borussia dortmund",
  "gladbach": "monchengladbach",
  "leverkusen": "bayer leverkusen",
  "west ham": "west ham united",
  "newcastle": "newcastle united",
  "tottenham": "tottenham hotspur",
  "wolves": "wolverhampton",
  "wolverhampton wanderers": "wolverhampton",
  "brighton": "brighton",
  "brighton & hove albion": "brighton",
  "le havre": "le havre",
  "marseille": "marseille",
  "olympique marseille": "marseille",
  "lyon": "lyon",
  "olympique lyonnais": "lyon",
};

/** Aplica o apelido, se houver. */
function canonico(s: string): string {
  const k = chaveNome(s);
  return APELIDOS[k] || k;
}

/** Remove acentos, pontuação e caixa para comparar nomes de time. */
function chaveNome(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compara nomes aceitando apelidos ("Brighton" vs "Brighton & Hove Albion"). */
function nomesParecidos(a: string, b: string): boolean {
  const x = canonico(a);
  const y = canonico(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [curto, longo] = x.length <= y.length ? [x, y] : [y, x];
  if (curto.length >= 4 && longo.includes(curto)) return true;
  /* primeiro token distintivo, ex.: "man utd" ⊄ "manchester united" */
  const tx = x.split(" ")[0];
  const ty = y.split(" ")[0];
  return tx.length >= 4 && tx === ty;
}

/**
 * Localiza o fixture do 5Dollar por nomes + data (YYYY-MM-DD).
 * A API aceita no máximo 24h por consulta, por isso a janela é o dia inteiro.
 * Devolve `{ id, invertido }` — `invertido` é true quando o 5Dollar traz o
 * mando trocado em relação à ESPN (acontece com as duas APIs).
 */
export async function fiveDollarFindFixture(
  homeName: string,
  awayName: string,
  isoDate: string,
  leagueId?: string
): Promise<{ id: number; invertido: boolean } | null> {
  const dia = String(isoDate || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;

  const start = Math.floor(new Date(`${dia}T00:00:00Z`).getTime() / 1000);
  if (!Number.isFinite(start)) return null;
  const end = start + 86399; /* 24h - 1s, o máximo permitido */

  const r = await fiveDollarFetch<FiveDollarFixtureListItem[]>(`/fixtures?start_time=${start}&end_time=${end}`);
  if (!r.ok || !Array.isArray(r.data) || !r.data.length) return null;

  /* Se a liga é conhecida, restringe antes de comparar os nomes. */
  const alvos = leagueId ? MAPEAMENTO_LIGAS[leagueId] : null;
  const candidatos = alvos
    ? r.data.filter((f) => {
        const nome = chaveNome((f.league as any)?.name || "");
        return alvos.some((a) => nome.includes(chaveNome(a)));
      })
    : r.data;
  const lista = candidatos.length ? candidatos : r.data;

  for (const f of lista) {
    const h = f.teams?.home?.name || "";
    const a = f.teams?.away?.name || "";
    if (nomesParecidos(homeName, h) && nomesParecidos(awayName, a)) {
      return { id: Number(f.id), invertido: false };
    }
    if (nomesParecidos(homeName, a) && nomesParecidos(awayName, h)) {
      return { id: Number(f.id), invertido: true };
    }
  }
  return null;
}

type ParValor = { home?: number | null; away?: number | null } | null | undefined;

/** Converte um par { home, away } do 5Dollar em duas métricas normalizadas. */
function par(def: { key: string; label: string; percent?: boolean }, v: ParValor): TeamStatMetric | null {
  if (!v || (v.home == null && v.away == null)) return null;
  return {
    key: def.key,
    label: def.label,
    home: Number(v.home ?? 0) || 0,
    away: Number(v.away ?? 0) || 0,
    percent: def.percent,
  };
}

/**
 * Busca o fixture com `include=stats` e devolve TOTAL e 1º TEMPO.
 * O 2º tempo não existe na fonte: derivamos por (total − 1º tempo), que é
 * exato porque as duas medições vêm do mesmo acumulador da partida.
 */
export async function fiveDollarTeamStats(fixtureId: string | number): Promise<{
  metrics: TeamStatMetric[];
  primeiroTempo: TeamStatMetric[];
  segundoTempo: TeamStatMetric[];
  finalizada: boolean;
}> {
  const r = await fiveDollarFetch<any>(`/fixtures/${fixtureId}?include=stats`);
  if (!r.ok || !r.data) return { metrics: [], primeiroTempo: [], segundoTempo: [], finalizada: false };

  const f = r.data;
  const st = f.statistics || {};
  const primeiro = st.first_half || null;

  const DEFS: { key: string; label: string; campo: string; percent?: boolean }[] = [
    { key: "ball_possession", label: "Posse de bola", campo: "possession", percent: true },
    { key: "total_shots", label: "Finalizações", campo: "__shots" },
    { key: "shots_on_goal", label: "Finalizações no gol", campo: "shots_on_target" },
    { key: "shots_off_goal", label: "Finalizações para fora", campo: "shots_off_target" },
    { key: "attacks", label: "Ataques", campo: "attacks" },
    { key: "dangerous_attacks", label: "Ataques perigosos", campo: "dangerous_attacks" },
  ];

  /* "Finalizações" = no gol + para fora (o 5Dollar separa justamente assim). */
  const somaChutes = (bloco: any): ParValor => {
    if (!bloco) return null;
    const on = bloco.shots_on_target || {};
    const off = bloco.shots_off_target || {};
    if (on.home == null && on.away == null && off.home == null && off.away == null) return null;
    return {
      home: (Number(on.home ?? 0) || 0) + (Number(off.home ?? 0) || 0),
      away: (Number(on.away ?? 0) || 0) + (Number(off.away ?? 0) || 0),
    };
  };

  const extrair = (bloco: any): TeamStatMetric[] => {
    if (!bloco) return [];
    const out: TeamStatMetric[] = [];
    for (const d of DEFS) {
      const v = d.campo === "__shots" ? somaChutes(bloco) : bloco[d.campo];
      const m = par({ key: d.key, label: d.label, percent: d.percent }, v);
      if (m) out.push(m);
    }
    /* Escanteios e cartões vêm fora de `statistics`. */
    const cantos = par({ key: "corner_kicks", label: "Escanteios" }, f.corners);
    if (cantos) out.push(cantos);
    const amarelo: ParValor = f.cards
      ? { home: f.cards.home?.yellow, away: f.cards.away?.yellow }
      : null;
    const ca = par({ key: "yellow_cards", label: "Cartões amarelos" }, amarelo);
    if (ca) out.push(ca);
    const vermelho: ParValor = f.cards
      ? { home: f.cards.home?.red, away: f.cards.away?.red }
      : null;
    const cv = par({ key: "red_cards", label: "Cartões vermelhos" }, vermelho);
    if (cv) out.push(cv);
    return out;
  };

  const metrics = extrair(st);
  const primeiroTempo = extrair(primeiro);

  /* 2º tempo = total − 1º tempo, métrica a métrica. */
  const segundoTempo: TeamStatMetric[] = [];
  if (primeiroTempo.length) {
    for (const tot of metrics) {
      const p = primeiroTempo.find((x) => x.key === tot.key);
      if (!p) continue;
      segundoTempo.push({
        key: tot.key,
        label: tot.label,
        home: Math.max(0, tot.home - p.home),
        away: Math.max(0, tot.away - p.away),
        percent: tot.percent,
      });
    }
  }

  return { metrics, primeiroTempo, segundoTempo, finalizada: String(f.status || "") === "finished" };
}
