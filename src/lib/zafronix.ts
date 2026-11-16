/* =======================================================================
   ZAFRONIX — dados históricos e placares
   -----------------------------------------------------------------------
   Docs: https://api.zafronix.com/docs

   IMPORTANTE — a base URL é POR COMPETIÇÃO, não um domínio único:
     · futebol de seleções / Copa: https://api.zafronix.com/fifa/worldcup/v1
     · Champions League:           .../uefa/championsleague/v1 (ver docs)
   Confirme o caminho no /docs antes de apontar para outra competição.

   Autenticação: header `X-API-Key` (não Bearer).
   Rate limit: headers X-RateLimit-Limit / -Remaining / -Reset.
   ETag: envie `If-None-Match` — 304 não consome cota.

   Este cliente está ISOLADO. Não está ligado à cascata de providers.ts.
   ======================================================================= */

const BASE_SELECOES = "https://api.zafronix.com/fifa/worldcup/v1";

/** Resposta de erro no formato do Zafronix (quando aplicável). */
export type ZafronixError = { error?: string; message?: string; detail?: string };

/** Item de `GET /tournaments`. */
export type ZafronixTournament = {
  year: number;
  host?: string;
  champion?: string;
  runner_up?: string;
  teams?: number;
  matches?: number;
};

/** Time dentro de um torneio. */
export type ZafronixTeam = {
  name: string;
  code?: string;
  group?: string;
  final_position?: string;
};

/** Jogador de `GET /teams/{name}/roster?year=YYYY`. */
export type ZafronixPlayer = {
  name: string;
  jersey?: string | number;
  position?: string;
  club?: string;
  goals?: number;
  assists?: number;
  captain?: boolean;
  date_of_birth?: string;
};

/** Partida em `GET /matches?year=YYYY`. */
export type ZafronixMatch = {
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  round?: string;
  date?: string;
  stadium?: string;
};

export type ZafronixFetchResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  /** Cota restante, quando o servidor informa. */
  rateLimitRemaining: number | null;
  /** ETag para revalidação condicional (economiza cota). */
  etag: string | null;
};

/**
 * Fetch base do Zafronix.
 * @param path caminho relativo, ex.: "/tournaments/2022"
 * @param opts.etag ETag anterior; se o servidor devolver 304, `data` vem null
 */
export async function zafronixFetch<T = unknown>(
  path: string,
  opts: { etag?: string; base?: string; signal?: AbortSignal } = {}
): Promise<ZafronixFetchResult<T>> {
  const key = (process.env.ZAFRONIX_API_KEY || "").trim();
  if (!key) {
    return { ok: false, status: 0, data: null, error: "ZAFRONIX_API_KEY não configurada.", rateLimitRemaining: null, etag: null };
  }

  const base = (opts.base || BASE_SELECOES).replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = { "X-API-Key": key, Accept: "application/json" };
  if (opts.etag) headers["If-None-Match"] = opts.etag;

  try {
    const res = await fetch(url, { headers, signal: opts.signal });
    const remaining = Number(res.headers.get("x-ratelimit-remaining"));
    const etag = res.headers.get("etag");

    if (res.status === 304) {
      /* Não modificado: não consome cota. Reaproveite o cache local. */
      return { ok: true, status: 304, data: null, rateLimitRemaining: Number.isFinite(remaining) ? remaining : null, etag };
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        data: null,
        error: `HTTP ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ""}`,
        rateLimitRemaining: Number.isFinite(remaining) ? remaining : null,
        etag: null,
      };
    }
    const json = (await res.json()) as T;
    return { ok: true, status: res.status, data: json, rateLimitRemaining: Number.isFinite(remaining) ? remaining : null, etag };
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: String(e?.message || e).slice(0, 160), rateLimitRemaining: null, etag: null };
  }
}

/* ---------------- Atalhos tipados (somente leitura) ---------------- */

export const zafronixTournaments = () => zafronixFetch<{ tournaments: ZafronixTournament[] }>("/tournaments");

export const zafronixTournament = (year: number | string) =>
  zafronixFetch<{ year: number; teams: ZafronixTeam[]; matches?: ZafronixMatch[] }>(`/tournaments/${year}`);

export const zafronixRoster = (teamName: string, year: number | string) =>
  zafronixFetch<{ roster: ZafronixPlayer[] }>(`/teams/${encodeURIComponent(teamName)}/roster?year=${year}`);

export const zafronixMatches = (year: number | string) => zafronixFetch<ZafronixMatch[]>(`/matches?year=${year}`);
