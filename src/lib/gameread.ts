/**
 * Cliente da API pública do GameRead (gameread.app/futebol).
 *
 * MÓDULO ISOLADO — nada aqui é usado pelas rotas existentes. A ideia é que este
 * arquivo possa ser apagado sem quebrar o resto do projeto.
 *
 * ============================ NOTAS DE ENGENHARIA REVERSA ============================
 * A API foi descoberta a partir do bundle da SPA (`/futebol/assets/main-*.js`),
 * que cria um axios com `baseURL: "/futebol/api"`. Endpoints confirmados ao vivo:
 *
 *   GET /v1/leagues                      → array de ligas
 *   GET /v1/fixtures/day?date&tzOffsetMinutes → jogos agrupados por liga
 *   GET /v1/props-radar/compact?date&tzOffsetMinutes → payload COMPACTO (chaves curtas)
 *   GET /v1/fixtures/{id}/lines          → linhas de mercado + hit rates (L5/L10/L20)
 *   GET /v1/fixtures/{id}/comparison     → xG, forma, winChance
 *
 * Esses dados são PÚBLICOS (não exigem token). Só /core/api/v1/* (login/billing)
 * pede JWT — e esse módulo não toca ali.
 *
 * ATENÇÃO (armadilha real, custou tempo no discovery): a origem devolve **HTTP 200
 * com o HTML do SPA** (13.006 bytes) quando falta o header `Next`/`Accept` de dados.
 * Por isso `grFetch` valida o content-type e o tamanho — não basta checar `res.ok`.
 *
 * TERCEIROS SEM CONTRATO: o formato pode mudar sem aviso e o servidor pode
 * bloquear IPs sob excesso de requisições. É por isso que existe o cache em duas
 * camadas (memória + Postgres) com TTL de 15 min e o "stale-while-error".
 */

import { eq } from "drizzle-orm";
import { gamereadCache } from "@/db/schema";

/**
 * O import de `@/db` é LAZY de propósito.
 *
 * `src/db/index.ts` lança `DATABASE_URL is required` no topo do módulo. Um
 * `import { db } from "@/db"` estático executa isso antes de qualquer try/catch
 * e derruba a rota inteira com 500 — mesmo quando o cache do banco é opcional.
 * (Reproduzido aqui: a rota pré-existente /api/health falha exatamente assim.)
 *
 * Carregando sob demanda, a ausência do banco só desativa a camada persistente
 * e o cache de memória segue funcionando.
 */
type DbHandle = typeof import("@/db")["db"];

/** Motivo pelo qual a camada Postgres está desligada (null = disponível). */
let dbDisabledReason: string | null = null;
let dbPromise: Promise<DbHandle | null> | null = null;

function getDb(): Promise<DbHandle | null> {
  if (!dbPromise) {
    dbPromise = import("@/db")
      .then((m) => m.db)
      .catch((e) => {
        dbDisabledReason = e instanceof Error ? e.message : String(e);
        console.warn(`[gameread] Postgres indisponível, usando cache em memória: ${dbDisabledReason}`);
        return null;
      });
  }
  return dbPromise;
}

const BASE = "https://gameread.app/futebol/api/v1";

/** TTL pedido: 15 minutos. O dado é pré-jogo e muda devagar. */
export const CACHE_TTL_MS = 15 * 60 * 1000;

/** Guarda estruturais: o HTML do SPA tem ~13 KB. JSON real é bem maior. */
const MIN_JSON_BYTES = 500;

const g = globalThis as typeof globalThis & {
  __grMem?: Map<string, { at: number; data: unknown }>;
  __grInflight?: Map<string, Promise<unknown>>;
};
const mem = g.__grMem ?? (g.__grMem = new Map());
const inflight = g.__grInflight ?? (g.__grInflight = new Map());

export type CacheSource = "memory" | "db" | "network" | "stale-fallback";

export type CachedResult<T> = {
  data: T;
  source: CacheSource;
  /** Idade do dado servido (ms). 0 quando veio da rede agora. */
  ageMs: number;
};

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

/**
 * `tzOffsetMinutes` segue o sinal do JS (`getTimezoneOffset()`): Brasil = 180.
 * O site envia esse valor; reproduzimos para que "jogos do dia" bata com o fuso.
 */
export function tzOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

/** Data no formato YYYY-MM-DD no fuso local do servidor. */
export function localDateIso(d = new Date()): string {
  const off = tzOffsetMinutes();
  const shifted = new Date(d.getTime() - off * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function isValidDateIso(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

/* ------------------------------------------------------------------ */
/* Fetch bruto                                                         */
/* ------------------------------------------------------------------ */

async function grFetch<T>(path: string, revalidate = false): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(BASE + path, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: {
        // Headers que fizeram a origem devolver JSON em vez do HTML da SPA.
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Origin: "https://gameread.app",
        Referer: "https://gameread.app/futebol/",
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
      },
    });

    if (!res.ok) {
      throw new Error(`GameRead ${res.status} em ${path}${revalidate ? " (revalidate)" : ""}`);
    }

    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("json")) {
      // Sinal claro: caiu no fallback HTML da SPA (proxy/headera ausente).
      throw new Error(`GameRead devolveu ${ctype || "sem content-type"} em ${path} (esperado JSON)`);
    }

    const text = await res.text();
    if (text.length < MIN_JSON_BYTES && !text.trim().startsWith("[")) {
      // Arrays vazios legítimos são curtos; objetos vazios ("{}") também.
      if (text.trim() !== "[]" && text.trim() !== "{}" && text.trim() !== "null") {
        throw new Error(`GameRead devolveu payload suspeito (${text.length} bytes) em ${path}`);
      }
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* Cache em duas camadas                                               */
/* ------------------------------------------------------------------ */

/**
 * Postgres pode estar indisponível (ex.: `DATABASE_URL` ausente em dev). Nesse
 * caso o cache de memória assume e o erro NÃO derruba a rota — só é logado uma
 * vez por chave. Contrato: o banco é otimização, não dependência dura.
 */
function dbUsable(): boolean {
  return dbDisabledReason === null;
}

async function readCacheDb<T>(key: string): Promise<{ data: T; ageMs: number } | null> {
  if (!dbUsable()) return null;
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select({ payload: gamereadCache.payload, updatedAt: gamereadCache.updatedAt })
      .from(gamereadCache)
      .where(eq(gamereadCache.cacheKey, key))
      .limit(1);
    if (rows.length === 0) return null;
    const ageMs = Date.now() - new Date(rows[0].updatedAt).getTime();
    return { data: rows[0].payload as T, ageMs };
  } catch (e) {
    dbDisabledReason = e instanceof Error ? e.message : String(e);
    console.warn(`[gameread] cache Postgres desativado: ${dbDisabledReason}`);
    return null;
  }
}

async function writeCacheDb(key: string, endpoint: string, dateKey: string | null, payload: unknown) {
  if (!dbUsable()) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db
      .insert(gamereadCache)
      .values({ cacheKey: key, endpoint, dateKey, payload, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: gamereadCache.cacheKey,
        set: { payload, updatedAt: new Date() },
      });
  } catch (e) {
    dbDisabledReason = e instanceof Error ? e.message : String(e);
    console.warn(`[gameread] falha ao gravar cache: ${dbDisabledReason}`);
  }
}

/**
 * Lê do cache persistido, aguardando a rede quando necessário.
 *
 * `revalidate=true` ignora o TTL e busca de novo (usado no botão "atualizar").
 * Se a rede falhar, serve o dado antigo em vez de estourar erro — a API é de
 * terceiros e uma falha momentânea não deve esvaziar a tela do usuário.
 */
export async function cachedGameRead<T>(
  endpoint: string,
  path: string,
  opts: { revalidate?: boolean; dateKey?: string | null } = {},
): Promise<CachedResult<T>> {
  const dateKey = opts.dateKey ?? null;
  const key = `${endpoint}:${dateKey ?? "-"}`;
  const now = Date.now();

  if (!opts.revalidate) {
    // 1) memória
    const hit = mem.get(key);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      return { data: hit.data as T, source: "memory", ageMs: now - hit.at };
    }

    // 2) Postgres
    const persisted = await readCacheDb<T>(key);
    if (persisted && persisted.ageMs < CACHE_TTL_MS) {
      mem.set(key, { at: now - persisted.ageMs, data: persisted.data });
      return { data: persisted.data, source: "db", ageMs: persisted.ageMs };
    }
  }

  // 3) rede (com dedupe de chamadas simultâneas)
  const flying = inflight.get(key);
  if (flying) {
    const data = (await flying) as T;
    return { data, source: "network", ageMs: 0 };
  }

  const p = grFetch<T>(path, opts.revalidate === true);
  inflight.set(key, p as Promise<unknown>);
  try {
    const data = await p;
    mem.set(key, { at: Date.now(), data });
    void writeCacheDb(key, endpoint, dateKey, data);
    return { data, source: "network", ageMs: 0 };
  } catch (err) {
    // 4) stale-while-error: melhor dado velho do que tela vazia.
    const stale = mem.get(key) ?? (await readCacheDb<T>(key));
    if (stale) {
      const staleAge =
        "at" in (stale as { at?: number })
          ? Date.now() - (stale as { at: number }).at
          : (stale as { ageMs: number }).ageMs;
      console.warn(`[gameread] rede falhou em ${path}, servindo cache de ${Math.round(staleAge / 1000)}s`);
      return {
        data: ("data" in stale ? (stale as { data: T }).data : stale) as T,
        source: "stale-fallback",
        ageMs: staleAge,
      };
    }
    throw err;
  } finally {
    inflight.delete(key);
  }
}

/* ------------------------------------------------------------------ */
/* Payload compacto do props-radar                                     */
/* ------------------------------------------------------------------ */

/**
 * `/props-radar/compact` usa um dicionário de chaves curtas (624 props em ~280 KB,
 * contra 3,7 MB do `/props-radar` completo). Formato **verificado campo a campo**
 * contra a resposta completa: 1701 de 1701 linhas bateram exatamente.
 *
 *   raw = { fixtures[], owners[], books[], props[] }
 *   prop = { f, o, m, h2h, v[], l[][] }
 *     f  índice em fixtures[]    → de qual jogo é a prop
 *     o  índice em owners[]      → dono (null/placeholder em prop de time)
 *     m  mercado                 → ex. "goals_over_under"
 *     v  últimos 10 resultados   → 1 acertou, 0 não
 *     l  linhas, como ARRAYS POSICIONAIS (não objetos!):
 *
 *        [0]  slot interno da linha
 *        [1]  line            (1.5, 7.0, ...)
 *        [2]  selection       0 = Under, 1 = Over
 *        [3]  price           (odd decimal)
 *        [4]  melhor bookmaker (índice em books[])
 *        [5]  quotes[]        pares [bookIdx, price, bookIdx, price, ...]
 *        [6]  hitBitsL10      "1111111111" | "xxxxx11111"  (x = não avaliado)
 *        [7]  flag
 *        [8..11]  contadores de amostra (10,10,10,10 no caso cheio)
 *        [12] seasonHits      acertos na temporada
 *        [13] seasonEval      jogos avaliados na temporada
 *        [14] seasonMisses    erros na temporada
 *        [15] 0
 *        [16] availabilityStatus (null | "injured" | ...)
 *        [17] injuryReason
 *
 * IMPORTANTE: as taxas de acerto NÃO vêm prontas — precisam ser derivadas do
 * bitstring [6], contando 1s sobre 1s+0s (`x` fica fora do denominador).
 * L5 usa os últimos 5 caracteres, L10 os 10.
 */
export type GrCompactLine = unknown[];

export type GrFixture = {
  id: string;
  apiId: number;
  ko: string;
  leagueId: string;
  leagueApiId: number;
  leagueName: string;
  leagueLogo: string;
  tier: number;
  priority: number;
  live: boolean;
  elapsed: number | null;
  home: GrTeamMini;
  away: GrTeamMini;
};

export type GrTeamMini = {
  id: string;
  name: string;
  logo?: string;
  abbreviation?: string | null;
  color?: string | null;
};

export type GrOwner = {
  id: string | null;
  name: string | null;
  photo: string | null;
  teamId: string | null;
  teamName: string | null;
  teamLogo: string | null;
  teamColor?: string | null;
  nat?: string | null;
  pos?: string | null;
  avail?: string | null;
  injury?: string | null;
  starter?: boolean;
};

export type GrProp = {
  f: number;
  o: number | null;
  m: string;
  h2h?: boolean;
  v?: number[];
  l?: GrCompactLine[];
};

export type GrCompactRaw = {
  v: number;
  fixtures: GrFixture[];
  owners: GrOwner[];
  books: (string | { name?: string; apiId?: number })[];
  props: GrProp[];
  leagues?: unknown[];
  totalAvailable?: number;
  returnedCount?: number;
  dayCounts?: { dayIso?: string; count?: number }[];
  limited?: boolean;
};

/* ---------------------------- Tipos públicos ---------------------------- */

/** Prop já achatada e legível — é o que a UI consome. */
export type PropRow = {
  id: string;
  market: string;
  marketLabel: string;
  marketGroup: "gols" | "cantos" | "cartoes" | "jogador" | "outros";
  selection: "Over" | "Under";
  fixtureId: string;
  kickoffUtc: string;
  leagueName: string;
  leagueLogo: string;
  homeName: string;
  homeLogo: string;
  awayName: string;
  awayLogo: string;
  awayColor: string | null;
  isLive: boolean;
  /** Jogador (quando a prop é de jogador) ou "Mandante x Visitante". */
  subjectName: string;
  subjectPhoto: string | null;
  subjectPosition: string | null;
  subjectKind: "player" | "team";
  availability: string | null;
  injuryReason: string | null;
  line: number | null;
  odd: number | null;
  bookmaker: string | null;
  /** Taxas em 0..100 (null quando não há amostra). */
  hitRateL5: number | null;
  hitRateL10: number | null;
  hitRateSzn: number | null;
  seasonHits: number | null;
  seasonEval: number | null;
  last10: string;
  h2h: boolean;
  /**
   * Score de oportunidade (~38 a ~115 na API real): acerto ponderado × valor da
   * odd × confiança da amostra. Quanto maior, melhor a oportunidade.
   */
  score: number;
};

const MARKET_LABELS: Record<string, string> = {
  goals_over_under: "Total de gols",
  goals_over_under_1h: "Gols 1º tempo",
  goals_over_under_2h: "Gols 2º tempo",
  btts: "Ambas marcam",
  corners_over_under: "Total de cantos",
  corners_over_under_1h: "Cantos 1º tempo",
  home_corners_over_under: "Cantos do mandante",
  away_corners_over_under: "Cantos do visitante",
  cards_over_under: "Total de cartões",
  home_team_total_goals: "Gols do mandante",
  away_team_total_goals: "Gols do visitante",
  home_team_goals_1h: "Gols mandante 1ºT",
  away_team_goals_1h: "Gols visitante 1ºT",
  home_team_goals_2h: "Gols mandante 2ºT",
  away_team_goals_2h: "Gols visitante 2ºT",
};

export function marketLabel(m: string): string {
  if (MARKET_LABELS[m]) return MARKET_LABELS[m];
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Classifica o mercado em grupos de UI.
 *
 * Ordem importa: "home_team_cards" casaria com /card/ e viraria "jogador"
 * (bug real, pego testando). Por isso mercados de TIME são resolvidos antes,
 * e "jogador" só entra para mercados que explicitamente começam com `player_`
 * ou não têm prefixo de time/lado.
 */
function marketGroup(m: string): PropRow["marketGroup"] {
  const isTeamScoped =
    m.startsWith("home_") || m.startsWith("away_") || m.startsWith("player_") === false
      ? m.startsWith("home_") || m.startsWith("away_")
      : false;

  // 1) Props explicitamente de jogador.
  if (m.startsWith("player_") || m === "anytime_goal_scorer" || m === "first_goal_scorer") {
    return "jogador";
  }

  // 2) Mercados de time/partida: o grupo vem da primeira palavra-chave.
  if (isTeamScoped || !m.startsWith("player_")) {
    if (m.includes("corner")) return "cantos";
    if (m.includes("card")) return "cartoes";
    if (m.includes("goal") || m.includes("btts") || m.includes("scorer")) return "gols";
    if (m.includes("foul") || m.includes("save") || m.includes("shot") || m.includes("tackle")) {
      return "outros";
    }
  }

  if (m.includes("corner")) return "cantos";
  if (m.includes("goal") || m === "btts") return "gols";
  return "outros";
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Deriva a taxa de acerto de um trecho do bitstring.
 * `x` (não avaliado) sai do denominador; sem amostra devolve null.
 * Retorna taxa em 0..100.
 */
function rateFromBits(bits: string): { rate: number | null; hits: number; eval: number } {
  let hits = 0;
  let evalCount = 0;
  for (const ch of bits) {
    if (ch === "1") {
      hits++;
      evalCount++;
    } else if (ch === "0") {
      evalCount++;
    }
  }
  return {
    rate: evalCount > 0 ? Math.round((hits / evalCount) * 1000) / 10 : null,
    hits,
    eval: evalCount,
  };
}

/**
 * Score de oportunidade (0..100).
 *
 * Por que não é só "maior hitRate": medido na API real, 175 de 1743 linhas
 * empatam em 100% de acerto, mas metade delas tem odd ~1.27 — acertar sempre com
 * odd 1.15 não é oportunidade, é preço ruim. Então o score combina três coisas:
 *
 *   1. acerto ponderado (L5 vale mais que L10, temporada como ajuste fino);
 *   2. valor da odd — odd baixa é penalizada, odd alta é recompensada;
 *   3. confiança da amostra — 3/3 (eval=3) pesa menos que 10/10 (eval=10).
 *
 * O resultado desempata os ""100%"" de forma útil e faz a lista mostrar props
 * realmente aproveitáveis no topo.
 */
function propScore(p: {
  l5: number | null;
  l10: number | null;
  eval10: number;
  szn: number | null;
  odd: number | null;
  group: PropRow["marketGroup"];
}): number {
  const l10 = p.l10 ?? 0;
  const l5 = p.l5 ?? l10;
  const szn = p.szn ?? l10;

  // 1) Acerto (0..100): curto prazo domina, temporada só ajusta.
  const accuracy = l10 * 0.5 + l5 * 0.35 + szn * 0.15;

  // 2) Fator de odd: 1.00 em odd<=1.20 → cresce até 1.15 em odd>=2.00.
  //    Uma odd 1.15 multiplica por 1.0 (sem bônus); 2.00 multiplica por 1.15.
  const odd = p.odd != null && p.odd > 0 ? p.odd : 1.2;
  const oddFactor = 1 + Math.max(0, Math.min(0.15, (odd - 1.2) * 0.188));

  // 3) Confiança pela amostra: 0.70 com 3 avaliados → 1.0 com 10.
  const confidence = Math.min(1, 0.7 + (Math.min(p.eval10, 10) / 10) * 0.3);

  // Sem teto em 100 de propósito: o corte achatava o topo (dezenas empatadas em
  // 100) e destruía o ranking. A faixa real medida é 38..115.
  const bonus = p.group === "jogador" ? 1.5 : 0;
  return Math.round((accuracy * oddFactor * confidence + bonus) * 10) / 10;
}

function bookName(books: GrCompactRaw["books"], idx: unknown): string | null {
  if (!isNum(idx)) return null;
  const b = books?.[idx];
  if (!b) return null;
  return typeof b === "string" ? b : (b.name ?? null);
}

/** Achata o payload compacto em linhas legíveis para a UI. */
export function flattenCompact(raw: GrCompactRaw): PropRow[] {
  const out: PropRow[] = [];
  const fixtures = raw.fixtures ?? [];
  const owners = raw.owners ?? [];

  for (const prop of raw.props ?? []) {
    const fx = fixtures[prop.f];
    if (!fx) continue;

    // owners[0] é um placeholder nulo (prop de time); só é jogador se tiver id E nome.
    const rawOwner = prop.o != null ? owners[prop.o] : null;
    const owner = rawOwner && rawOwner.id && rawOwner.name ? rawOwner : null;

    const lines = prop.l ?? [];
    if (lines.length === 0) continue;

    // Uma prop tem várias linhas (Over 1.5, Over 2.5...). Publicamos a de MAIOR
    // taxa L10 — é a "melhor oportunidade" daquela prop. Empate → maior odd.
    let best: GrCompactLine | null = null;
    let bestRate = -1;
    let bestPrice = -1;
    for (const ln of lines) {
      if (!Array.isArray(ln) || ln.length < 7) continue;
      const bits = typeof ln[6] === "string" ? ln[6] : "";
      const { rate } = rateFromBits(bits);
      const r = rate ?? -1;
      const price = isNum(ln[3]) ? ln[3] : -1;
      if (r > bestRate || (r === bestRate && price > bestPrice)) {
        bestRate = r;
        bestPrice = price;
        best = ln;
      }
    }
    if (!best) continue;

    const bits10 = typeof best[6] === "string" ? best[6] : "";
    const r10 = rateFromBits(bits10);
    const r5 = rateFromBits(bits10.slice(-5));

    const seasonHits = isNum(best[12]) ? best[12] : null;
    const seasonEval = isNum(best[13]) ? best[13] : null;
    const sznRate =
      seasonHits != null && seasonEval != null && seasonEval > 0
        ? Math.round((seasonHits / seasonEval) * 1000) / 10
        : null;

    const group = marketGroup(prop.m);
    const selection: "Over" | "Under" = best[2] === 1 ? "Over" : "Under";

    out.push({
      id: `${fx.id}:${prop.m}:${owner?.id ?? "team"}:${isNum(best[1]) ? best[1] : "na"}:${best[2]}`,
      market: prop.m,
      marketLabel: marketLabel(prop.m),
      marketGroup: group,
      selection,
      fixtureId: fx.id,
      kickoffUtc: fx.ko,
      leagueName: fx.leagueName,
      leagueLogo: fx.leagueLogo,
      homeName: fx.home?.name ?? "",
      homeLogo: fx.home?.logo ?? "",
      awayName: fx.away?.name ?? "",
      awayLogo: fx.away?.logo ?? "",
      awayColor: fx.away?.color ?? null,
      isLive: fx.live === true,
      subjectName: owner?.name ?? `${fx.home?.name ?? ""} x ${fx.away?.name ?? ""}`,
      subjectPhoto: owner?.photo ?? null,
      subjectPosition: owner?.pos ?? null,
      subjectKind: owner ? "player" : "team",
      availability: typeof best[16] === "string" ? best[16] : null,
      injuryReason: typeof best[17] === "string" ? best[17] : null,
      line: isNum(best[1]) ? best[1] : null,
      odd: isNum(best[3]) ? best[3] : null,
      bookmaker: bookName(raw.books, best[4]),
      hitRateL5: r5.rate,
      hitRateL10: r10.rate,
      hitRateSzn: sznRate,
      seasonHits,
      seasonEval,
      last10: bits10,
      h2h: prop.h2h === true,
      score: propScore({
        l5: r5.rate,
        l10: r10.rate,
        eval10: r10.eval,
        szn: sznRate,
        odd: isNum(best[3]) ? best[3] : null,
        group,
      }),
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Fetchers tipados                                                    */
/* ------------------------------------------------------------------ */

export type FixtureDayGroup = {
  league: { id: string; apiFootballId: number; name: string; slug?: string; logoUrl?: string; tier?: number; priority?: number };
  fixtures: {
    id: string;
    apiFootballId: number;
    kickoffUtc?: string;
    status?: string;
    isLive?: boolean;
    elapsedMinutes?: number | null;
    home?: { id: string; name: string; logoUrl?: string };
    away?: { id: string; name: string; logoUrl?: string };
    homeGoals?: number | null;
    awayGoals?: number | null;
  }[];
};

export async function getFixturesDay(date: string, revalidate = false) {
  const tz = tzOffsetMinutes();
  return cachedGameRead<FixtureDayGroup[]>(
    "fixtures_day",
    `/fixtures/day?date=${encodeURIComponent(date)}&tzOffsetMinutes=${tz}`,
    { revalidate, dateKey: date },
  );
}

export async function getPropsRadar(date: string, revalidate = false) {
  const tz = tzOffsetMinutes();
  const res = await cachedGameRead<GrCompactRaw>(
    "props_radar",
    `/props-radar/compact?date=${encodeURIComponent(date)}&tzOffsetMinutes=${tz}`,
    { revalidate, dateKey: date },
  );
  return { ...res, rows: flattenCompact(res.data) };
}

export type GrLineItem = {
  oddId: string;
  fixtureId: string;
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogoUrl?: string;
  awayTeamLogoUrl?: string;
  market: string;
  marketName?: string;
  selection: string;
  line: number | null;
  price: number | null;
  bookmakerName?: string;
  playerName?: string | null;
  playerPhotoUrl?: string | null;
  hitRateL5?: number | null;
  hitRateL10?: number | null;
  hitRateL20?: number | null;
  hitL10Hits?: number | null;
  hitL20Eval?: number | null;
  playerPosition?: string | null;
  availabilityStatus?: string | null;
  injuryReason?: string | null;
  probableStarter?: boolean | null;
  isLive?: boolean;
  /** Prop baseada em confronto direto (poucos jogos, tratar com cautela). */
  headToHeadBased?: boolean | null;
  hitStreak?: number | null;
  grMean?: number | null;
};

export async function getFixtureLines(id: string, revalidate = false) {
  return cachedGameRead<{ items: GrLineItem[]; totalAvailable: number }>(
    "fixture_lines",
    `/fixtures/${encodeURIComponent(id)}/lines`,
    { revalidate, dateKey: id },
  );
}

export async function getFixture(id: string, revalidate = false) {
  return cachedGameRead<Record<string, unknown>>(
    "fixture",
    `/fixtures/${encodeURIComponent(id)}`,
    { revalidate, dateKey: id },
  );
}

export async function getComparison(id: string, revalidate = false) {
  return cachedGameRead<Record<string, unknown>>(
    "comparison",
    `/fixtures/${encodeURIComponent(id)}/comparison`,
    { revalidate, dateKey: id },
  );
}

/** Diagnóstico: quantas linhas de cache existem por endpoint. */
export async function cacheStats() {
  if (!dbUsable()) {
    return { db: "disabled", reason: dbDisabledReason, memoryKeys: mem.size };
  }
  const db = await getDb();
  if (!db) {
    return { db: "disabled", reason: dbDisabledReason, memoryKeys: mem.size };
  }
  try {
    const rows = await db
      .select({ endpoint: gamereadCache.endpoint, updatedAt: gamereadCache.updatedAt })
      .from(gamereadCache);
    const byEndpoint: Record<string, number> = {};
    for (const r of rows) byEndpoint[r.endpoint] = (byEndpoint[r.endpoint] ?? 0) + 1;
    return { db: "ok", byEndpoint, memoryKeys: mem.size, ttlSeconds: CACHE_TTL_MS / 1000 };
  } catch (e) {
    return { db: "error", reason: e instanceof Error ? e.message : String(e), memoryKeys: mem.size };
  }
}

