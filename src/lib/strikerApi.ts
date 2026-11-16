/* =======================================================================
   STRIKERAPI — estatísticas de jogadores
   -----------------------------------------------------------------------
   Docs: https://strikerapi.com/docs  ·  llms-full: strikerapi.com/llms-full.txt

   Base URL: https://mcp.strikerapi.com   ← NÃO é strikerapi.com
   Auth: header `x-api-key` (ou `Authorization: Bearer`).
   MÉTODO: **POST** — os parâmetros vão no corpo JSON, não na query string.
   Path: POST /v1/{tool_name}  (ex.: /v1/get_player)
   Custo: cada tool gasta créditos (search_players 1 cr, get_player 5 cr).
   Resposta traz X-Credits-Used / X-Credits-Remaining.
   Season = ano de INÍCIO (2025 = 2025-26); MLS/NWSL/Liga MX/Brasil/Argentina usam ano civil.

   Este cliente está ISOLADO. Não está ligado à cascata de providers.ts.
   ======================================================================= */

const BASE_URL = "https://mcp.strikerapi.com";

/** Ligas aceitas (enum `league`). Default: "soccer". */
export type StrikerLeague =
  | "soccer" | "mls" | "laliga" | "seriea" | "bundesliga" | "ligue1" | "ucl"
  | "championship" | "nwsl" | "ligamx" | "uel" | "uecl" | "eredivisie"
  | "primeira" | "scotland" | "brazil" | "argentina";

/** Resultado de POST /v1/search_players. */
export type StrikerPlayerSearchResult = {
  players: Array<{
    player_id: string;
    name: string;
    short_name?: string;
    position?: string;
    jersey?: string;
    team_id?: string;
    team?: string;
    last_season?: number;
    appearances?: number;
  }>;
  count?: number;
};

/** Totais por temporada em /v1/get_player. */
export type StrikerSeasonRow = {
  season: number;
  team?: string;
  appearances?: number;
  starts?: number;
  minutes?: number;
  goals?: number;
  assists?: number;
  shots?: number;
  shots_on_target?: number;
  xg?: number | null;
  yellow_cards?: number;
  red_cards?: number;
  saves?: number | null;
  goals_conceded?: number | null;
  clean_sheets?: number;
  goals_per90?: number;
  assists_per90?: number;
  shots_per90?: number;
  xg_per90?: number;
};

/** Resultado de POST /v1/get_player. */
export type StrikerPlayerProfile = {
  player: {
    player_id: string;
    name: string;
    short_name?: string;
    position?: string;
    jersey?: string;
    team_id?: string;
    team?: string;
    team_name?: string;
  };
  seasons: StrikerSeasonRow[];
  recent_games?: Array<Record<string, unknown>>;
};

export type StrikerFetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  /** Créditos consumidos / restantes, quando informados. */
  creditsUsed: number | null;
  creditsRemaining: number | null;
};

/**
 * Chamada base da StrikerAPI (sempre POST em /v1/{tool}).
 * @param tool nome exato da ferramenta, ex.: "get_player", "search_players"
 * @param body parâmetros da ferramenta (JSON)
 */
export async function strikerFetch<T = unknown>(
  tool: string,
  body: Record<string, unknown> = {},
  opts: { signal?: AbortSignal } = {}
): Promise<StrikerFetchResult<T>> {
  const key = (process.env.STRIKER_API_KEY || "").trim();
  if (!key) {
    return { ok: false, status: 0, data: null, error: "STRIKER_API_KEY não configurada.", creditsUsed: null, creditsRemaining: null };
  }

  const url = `${BASE_URL}/v1/${tool}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key, Accept: "application/json" },
      body: JSON.stringify(body),
      signal: opts.signal,
    });

    const used = Number(res.headers.get("x-credits-used"));
    const remaining = Number(res.headers.get("x-credits-remaining"));
    const raw = await res.json().catch(() => null);

    if (!res.ok) {
      const msg =
        (raw && (raw.error || raw.message || raw.detail)) ||
        `HTTP ${res.status}`;
      return {
        ok: false,
        status: res.status,
        data: null,
        error: String(msg).slice(0, 200),
        creditsUsed: Number.isFinite(used) ? used : null,
        creditsRemaining: Number.isFinite(remaining) ? remaining : null,
      };
    }
    return {
      ok: true,
      status: res.status,
      data: (raw as T) ?? null,
      creditsUsed: Number.isFinite(used) ? used : null,
      creditsRemaining: Number.isFinite(remaining) ? remaining : null,
    };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: String(e?.message || e).slice(0, 200), creditsUsed: null, creditsRemaining: null };
  }
}

/* ---------------- Atalhos tipados (somente leitura, cada um com custo) ---------------- */

/** Busca jogador por nome — 1 crédito. */
export const strikerSearchPlayers = (name: string, extra: { team?: string; league?: StrikerLeague; limit?: number } = {}, opts?: { signal?: AbortSignal }) =>
  strikerFetch<StrikerPlayerSearchResult>("search_players", { name, ...extra }, opts);

/** Perfil + temporadas + últimas 10 partidas — 5 créditos. */
export const strikerGetPlayer = (playerId: string, league?: StrikerLeague, opts?: { signal?: AbortSignal }) =>
  strikerFetch<StrikerPlayerProfile>("get_player", league ? { player_id: playerId, league } : { player_id: playerId }, opts);