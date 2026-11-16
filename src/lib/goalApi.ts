/* =======================================================================
   GOAL API — xG e estatísticas de partidas
   -----------------------------------------------------------------------
   Docs: https://goal-api.com/documentation  (OpenAPI: api.goal-api.com)

   Base URL: https://api.goal-api.com/v1
   Auth: `Authorization: Bearer <key>` — ÚNICA forma aceita (sem X-API-Key).
   Envelope: { "success": true, "data": ..., "pagination"?, "count"? }
   Erros têm DOIS formatos: gateway { message, code, category } e
   serviço { error, code } — leia `message ?? error`.

   Este cliente está ISOLADO. Não está ligado à cascata de providers.ts.
   ======================================================================= */

const BASE_URL = "https://api.goal-api.com/v1";

/** Erro no formato gateway OU serviço (leia message ?? error). */
export type GoalApiError = {
  message?: string;
  error?: string;
  code?: string;
  category?: string;
  details?: unknown;
  correlationId?: string;
};

/** Envelope padrão: { success, data, pagination?, count?, fixtureId? }. */
export type GoalApiEnvelope<T> = {
  success: boolean;
  data: T | null;
  pagination?: { total?: number; limit?: number; offset?: number; hasMore?: boolean };
  count?: number;
  fixtureId?: string;
  matchApiId?: string;
  error?: GoalApiError;
  code?: string;
  message?: string;
};

/* ---------------- Tipos dos dados ---------------- */

/** Uma partida (GET /fixtures/live e /fixtures). */
export type GoalApiMatchLite = {
  id: string;
  matchStatus?: string; // "LIVE" | "FINISHED" | "SCHEDULED" | ...
  matchPeriod?: string;
  matchElapsed?: number | null;
  kickoffUtc?: string;
  homeTeamName?: string;
  homeTeamScore?: string | number | null;
  awayTeamName?: string;
  awayTeamScore?: string | number | null;
  leagueName?: string;
  countryName?: string;
  homeTeam?: { id?: string; name?: string };
  awayTeam?: { id?: string; name?: string };
  league?: { id?: string; name?: string; country?: string };
};

/** Medida única de uma estatística em GET /fixtures/{id}/statistics. */
export type GoalApiStatPair = {
  type?: string;
  home?: string | number | null;
  away?: string | number | null;
  // alguns endpoints usam { home, away } dentro de "value"
  value?: { home?: string | number | null; away?: string | number | null };
};

/** Bloco de estatísticas de uma partida (xG, posse, chutes etc). */
export type GoalApiFixtureStats = {
  fixtureId?: string;
  statistics: GoalApiStatPair[];
};

/** Linha de jogador em GET /players/search ou /teams/{id}/players. */
export type GoalApiPlayer = {
  id?: string;
  name?: string;
  position?: string;
  jersey?: string | number | null;
  teamId?: string;
  teamName?: string;
  goals?: number;
  assists?: number;
  appearances?: number;
};

export type GoalApiFetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  code?: string;
  correlationId?: string | null;
};

/**
 * Fetch base da GOAL API.
 * @param path ex.: "/fixtures/live" ou "/fixtures/{id}/statistics"
 * @param params query params (limit, offset, from, to, season...)
 */
export async function goalApiFetch<T = unknown>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  opts: { signal?: AbortSignal } = {}
): Promise<GoalApiFetchResult<T>> {
  const key = (process.env.GOAL_API_KEY || "").trim();
  if (!key) {
    return { ok: false, status: 0, data: null, error: "GOAL_API_KEY não configurada." };
  }

  const url = new URL(`${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: opts.signal });
    const raw = (await res.json().catch(() => null)) as GoalApiEnvelope<T> | null;

    if (!res.ok || !raw || raw.success === false) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error: raw?.error?.message || raw?.error?.error || raw?.message || `HTTP ${res.status}`,
        code: raw?.error?.code || raw?.code,
        correlationId: raw?.error?.correlationId ?? null,
      };
    }
    return { ok: true, status: res.status, data: raw.data ?? null, correlationId: raw?.error?.correlationId ?? null };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: String(e?.message || e).slice(0, 160) };
  }
}

/* ---------------- Atalhos tipados (somente leitura) ---------------- */

/** Partidas ao vivo. */
export const goalLiveMatches = (opts?: { signal?: AbortSignal }) => goalApiFetch<GoalApiMatchLite[]>("/fixtures/live", {}, opts);

/** Partidas de uma data (YYYY-MM-DD). */
export const goalFixturesByDate = (date: string, params: { leagueId?: string | number; limit?: number; offset?: number } = {}, opts?: { signal?: AbortSignal }) =>
  goalApiFetch<GoalApiMatchLite[]>(`/fixtures/date/${date}`, params as Record<string, string | number>, opts);

/** Estatísticas de uma partida (xG, posse, chutes — com half="1half" no 1º tempo). */
export const goalFixtureStats = (fixtureId: string, params: { half?: "1half" | "2half" | "full" } = {}, opts?: { signal?: AbortSignal }) =>
  goalApiFetch<GoalApiFixtureStats>(`/fixtures/${fixtureId}/statistics`, params as Record<string, string>, opts);

/** Busca de jogador por nome. */
export const goalSearchPlayers = (name: string, params: { limit?: number } = {}, opts?: { signal?: AbortSignal }) =>
  goalApiFetch<GoalApiPlayer[]>(`/players/search`, { q: name, ...params }, opts);