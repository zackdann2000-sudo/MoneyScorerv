/**
 * Catálogo único de "principais ligas" usado por todas as telas.
 *
 * Cada fonte (ESPN, API-Football, 5Dollar, KingStats, apitou, NerdyTips) batiza
 * a mesma competição de um jeito: a Serie A italiana chega como "Italy Serie A",
 * "Serie A" ou "Serie A TIM"; o Brasileirão como "Brazil Serie A",
 * "Brasileirão" ou "Serie A Betano". Este arquivo centraliza o mapa
 * canônico → apelidos para o filtro funcionar em qualquer fonte.
 *
 * Ordem da decisão (importante):
 *   1. normaliza (minúsculas, sem acento, pontuação vira espaço);
 *   2. BLACKLIST — se o nome tem cara de base/feminino/copa/divisão inferior,
 *      retorna `false` na hora, antes de olhar a lista de ligas;
 *   3. só então procura um apelido das 16 ligas permitidas;
 *   4. `exclude` por liga desempata nomes genéricos que existem em vários
 *      países ("Premier League" da Armênia, "Serie A" do Equador, "Champions
 *      League" da CONCACAF).
 *
 * Regra de ouro: falso positivo (mostrar liga menor como principal) é pior que
 * falso negativo. Por isso o veto vem primeiro e todo apelido genérico tem
 * `exclude`.
 */

export type MainLeague = {
  /** Chave canônica, estável, usada em código. */
  id: string;
  /** Nome de exibição. */
  name: string;
  /** Formas como a liga aparece nas APIs. */
  aliases: string[];
  /** Tokens que, presentes no nome, desqualificam o casamento. */
  exclude?: string[];
  /**
   * País/região que precisa qualificar o nome genérico.
   *
   * "Premier League" existe na Zanzibar, na Sierra Leone e nas Seychelles; sem
   * essa exigência o filtro deixaria passar as três (falso positivo real visto
   * em produção). O nome exato continua valendo: "Premier League" sozinho, sem
   * país, é a inglesa.
   */
  pais?: string[];
};

/** As 16 ligas permitidas, na ordem em que são testadas. */
export const MAIN_LEAGUES: MainLeague[] = [
  {
    id: "premier_league",
    name: "Premier League",
    pais: ["england", "english", "epl"],
    aliases: ["Premier League", "English Premier League", "England Premier League", "EPL"],
    exclude: [
      "2", "u19", "u21", "u23", "cup", "women", "international", "reserve",
      "division", "armenia", "russia", "ukraine", "israel", "egypt", "nigeria",
      "kenya", "ghana", "ethiopia", "thailand", "singapore", "malta", "india",
      "iraq", "jamaica", "mongolia", "botswana", "burundi", "uganda", "tanzania",
      "azerbaijan", "wales", "scotland", "irish", "northern", "southern",
      "lowland", "isthmian",
    ],
  },
  {
    id: "la_liga",
    name: "La Liga",
    pais: ["spain", "spanish", "laliga", "la liga"],
    aliases: ["La Liga", "LaLiga", "Spanish La Liga", "Spain La Liga", "Spanish Primera Division"],
    exclude: [
      "2", "rfef", "segunda", "women", "u19", "u21", "cup", "copa", "regional",
      "tercera", "youth", "mx", "mexico", "expansion", "hypermotion",
    ],
  },
  {
    // Antes do Brasileirão Série A: "Brasileirão Série B" também contém "Brasileirão".
    id: "brasileirao_b",
    name: "Brasileirão Série B",
    pais: ["brazil", "brazilian", "brasil", "brasileirao", "brasileiro"],
    aliases: [
      "Brasileirão Série B", "Brasileirão B", "Brazil Serie B", "Brasil Serie B",
      "Brazilian Serie B", "Campeonato Brasileiro Série B", "Brasileirao Serie B",
    ],
    exclude: ["women", "u20", "u19", "u23", "cup", "copa", "reserve"],
  },
  {
    // Antes da Serie A italiana: "Serie A Betano" é o Brasileirão, não a Itália.
    id: "brasileirao_a",
    name: "Brasileirão Série A",
    pais: ["brazil", "brazilian", "brasil", "brasileirao", "brasileiro", "betano"],
    aliases: [
      "Brasileirão Série A", "Brasileirão", "Brasileirao", "Brazil Serie A",
      "Brasil Serie A", "Brazilian Serie A", "Campeonato Brasileiro",
      "Campeonato Brasileiro Série A", "Serie A Brasil", "Serie A Brazil",
      "Serie A Betano",
    ],
    exclude: [
      "women", "u20", "u19", "u23", "cup", "copa", "reserve", "carioca",
      "paulista", "gaucho", "cearense", "potiguar", "paraibano", "fares",
      "paraiba", "a2", "a3", "2",
    ],
  },
  {
    id: "argentina_primera",
    name: "Liga Argentina",
    pais: ["argentina", "argentine", "liga profesional", "torneo betano"],
    aliases: [
      "Liga Argentina", "Liga Profesional", "Argentina Liga Profesional",
      "Argentine Liga Profesional", "Primera División Argentina",
      "Argentina Primera Division", "Argentina Primera", "Torneo Betano",
    ],
    exclude: [
      "reserve", "reserves", "women", "u19", "u20", "u21", "youth",
      "championship", "primera b", "primera c", "torneo a", "torneo regional",
      "nacional b", "amateur",
    ],
  },
  {
    id: "serie_a",
    name: "Serie A",
    pais: ["italy", "italian", "serie a tim"],
    aliases: ["Serie A", "Italian Serie A", "Italy Serie A", "Serie A TIM"],
    exclude: [
      "women", "u17", "u19", "u20", "u21", "u23", "primavera", "coppa", "cup",
      "serie d", "2", "brasil", "brazil", "brasileirao", "betano", "argentina",
      "colombia", "chile", "peru", "uruguay", "paraguay", "bolivia", "venezuela",
      "ecuador",
    ],
  },
  {
    id: "bundesliga",
    name: "Bundesliga",
        aliases: ["Bundesliga", "German Bundesliga", "Germany Bundesliga", "1. Bundesliga"],
    exclude: ["2", "u19", "u21", "u23", "women", "cup", "regionalliga", "oberliga", "austria", "reserve"],
  },
  {
    id: "ligue_1",
    name: "Ligue 1",
    pais: ["french", "france"],
    aliases: ["Ligue 1", "French Ligue 1", "France Ligue 1", "Ligue 1 Conforama"],
    exclude: ["2", "women", "u19", "u21", "cup", "coupe"],
  },
  {
    id: "mls",
    name: "MLS",
    pais: ["usa", "us", "united states", "major league soccer", "mls"],
    aliases: ["MLS", "Major League Soccer", "USA MLS", "US MLS", "United States MLS"],
    exclude: ["next", "women", "u19", "u21", "reserve", "canada"],
  },
  {
    id: "saudi_pro_league",
    name: "Saudi Pro League",
    pais: ["saudi"],
    aliases: [
      "Saudi Pro League", "Saudi Professional League", "Saudi Premier League",
      "Saudi Arabia Pro League",
    ],
    exclude: ["division", "2", "u19", "u21", "women", "cup"],
  },
  {
    id: "champions_league",
    name: "Champions League",
    pais: ["uefa", "liga dos campeoes"],
    aliases: ["UEFA Champions League", "Champions League", "Liga dos Campeões", "UCL"],
    exclude: ["women", "u19", "u21", "youth", "afa", "afc", "caf", "concacaf", "elite", "two"],
  },
  {
    // Antes da Europa League: "Europa Conference League" não é a Europa League.
    id: "conference_league",
    name: "Conference League",
    pais: ["uefa", "liga conferencia"],
    aliases: [
      "UEFA Conference League", "Conference League", "UEFA Europa Conference League",
      "Liga Conferência",
    ],
    exclude: ["women", "u19", "u21", "youth"],
  },
  {
    id: "europa_league",
    name: "Europa League",
    pais: ["uefa", "liga europa"],
    aliases: ["UEFA Europa League", "Europa League", "Liga Europa", "UEL"],
    exclude: ["conference", "women", "u19", "u21", "youth"],
  },
  {
    id: "libertadores",
    name: "Libertadores",
    aliases: ["Copa Libertadores", "Libertadores", "CONMEBOL Libertadores"],
    exclude: ["women", "u20", "u19", "sub 20", "sub 19", "youth", "feminina"],
  },
  {
    id: "sudamericana",
    name: "Sul-Americana",
    aliases: [
      "Copa Sudamericana", "Sudamericana", "Sul-Americana", "Sulamericana",
      "CONMEBOL Sudamericana",
    ],
    exclude: ["women", "u20", "u19", "sub 20", "sub 19", "youth", "feminina"],
  },
  {
    id: "nations_league",
    name: "Liga das Nações",
    pais: ["uefa", "liga das nacoes"],
    aliases: ["UEFA Nations League", "Liga das Nações", "Nations League"],
    exclude: ["concacaf", "women", "u19", "u21", "youth"],
  },
];

/**
 * Veto global: se aparecer um destes termos, não é liga principal.
 *
 * Cobre base, feminino, reservas, divisões inferiores e copas nacionais.
 * `u21`/`u23` entram junto de `u17`/`u19`/`u20` porque as fontes usam todos.
 */
const BLACKLIST: string[] = [
  "women", "feminin", "feminina", "u17", "u19", "u20", "u21", "u23", "youth",
  "reserve", "tercera", "segunda", "primera b", "amateur", "cup",
];

/** Termos que "salvam" o token `cup` do veto (copas continentais que valem). */
const EXCECOES_COPA: string[] = [
  "champions", "europa", "libertadores", "sul americana", "conference",
];

/** Minúsculas, sem acento, pontuação vira espaço e espaços colapsados. */
export function normalizar(valor: string): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** O apelido aparece inteiro dentro do nome (não como pedaço de palavra). */
function contemAlias(nome: string, apelido: string): boolean {
  if (!apelido) return false;
  return ` ${nome} `.includes(` ${apelido} `);
}

/**
 * Veto de categoria: base, feminino, reservas, divisão inferior ou copa.
 *
 * Roda ANTES da lista de ligas. A exceção do `cup` existe para as competições
 * continentais cujo nome em inglês traz "cup" — "Champions Cup", "Europa Cup" —
 * mas o nome ainda precisa casar um apelido das 16 para entrar.
 */
export function bloqueadoPorCategoria(leagueName: string | null | undefined): boolean {
  const nome = normalizar(leagueName ?? "");
  if (!nome) return true; // sem nome não é liga principal

  const portaliberado = EXCECOES_COPA.some((t) => contemAlias(nome, t));

  for (const termo of BLACKLIST) {
    if (!contemAlias(nome, termo)) continue;
    if (termo === "cup" && portaliberado) continue;
    return true;
  }
  return false;
}

/**
 * Devolve a liga canônica correspondente ou `null` se não for uma das 16.
 * Retorna o objeto inteiro para quem precisa do `id` e do `name`.
 */
export function leagueOf(
  leagueName: string | null | undefined,
  pais?: string | null,
): MainLeague | null {
  if (!leagueName) return null;

  const nomeLiga = normalizar(leagueName);
  if (!nomeLiga) return null;

  // Quando a fonte informa o país, ele entra no nome usado no casamento: é o
  // que separa a "Ligue 1" da França da "Ligue 1" da Argélia.
  const paisNorm = pais ? normalizar(pais) : "";
  const nome = paisNorm ? `${paisNorm} ${nomeLiga}` : nomeLiga;

  if (bloqueadoPorCategoria(nome)) return null;

  for (const liga of MAIN_LEAGUES) {
    if (!liga.aliases.some((a) => contemAlias(nome, normalizar(a)))) continue;

    // Nome genérico ("Ligue 1", "Serie A", "Premier League") só vale com o país
    // certo no nome. Sem país, fica de fora: existe Ligue 1 na França, na
    // Argélia e no Senegal, e Serie A na Itália, no Equador e na Bolívia.
    if (liga.pais && !liga.pais.some((t) => contemToken(nome, t))) continue;

    const vetada = (liga.exclude ?? []).some((t) => contemToken(nome, t));
    if (vetada) continue;
    return liga;
  }
  return null;
}

/** Token (já normalizado) presente inteiro no nome, inclusive números ("2"). */
function contemToken(nome: string, token: string): boolean {
  const t = normalizar(token);
  if (!t) return false;
  return ` ${nome} `.includes(` ${t} `);
}

/**
 * `true` se a liga informada é uma das 16 principais.
 *
 * ```ts
 * isMainLeague("Brasileirão Série A")      // true
 * isMainLeague("Brazil Serie A")           // true
 * isMainLeague("Ligue 1", "France")        // true
 * isMainLeague("Ligue 1", "Algeria")       // false (não é a francesa)
 * isMainLeague("Serie A")                  // false (genérico sem país)
 * isMainLeague("Italy Serie A Women")      // false (veto de feminino)
 * isMainLeague("Spain Copa del Rey")       // false (copa nacional)
 * ```
 */
export function isMainLeague(
  leagueName: string | null | undefined,
  pais?: string | null,
): boolean {
  return leagueOf(leagueName, pais) !== null;
}

/** Chave canônica da liga (ou `null`). */
export function mainLeagueId(
  leagueName: string | null | undefined,
  pais?: string | null,
): string | null {
  return leagueOf(leagueName, pais)?.id ?? null;
}

const IDS = new Set(MAIN_LEAGUES.map((l) => l.id));

export function isMainLeagueId(id: string | null | undefined): boolean {
  return !!id && IDS.has(id);
}

/** Nome de exibição a partir da chave canônica. */
export function mainLeagueName(id: string | null | undefined): string | null {
  return MAIN_LEAGUES.find((l) => l.id === id)?.name ?? null;
}

/** Quantidade de ligas na lista (16) — usada em texto de UI/teste. */
export const TOTAL_LIGAS_PRINCIPAIS = MAIN_LEAGUES.length;
