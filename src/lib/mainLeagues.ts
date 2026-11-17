/**
 * Catálogo único de "principais ligas" usado por todas as telas.
 *
 * Cada fonte (ESPN, API-Football, 5Dollar, KingStats, apitou) batiza a mesma
 * competição de um jeito. Ex.: a Serie A italiana chega como "Italy Serie A",
 * "Serie A" ou "Italian Serie A"; o Brasileirão como "Brazil Serie A",
 * "Brasileirão" ou "Brasileirão Série A". Este arquivo centraliza o mapa
 * canônico → apelidos para que o filtro funcione em qualquer fonte.
 *
 * Como o casamento é feito:
 *   - o nome da liga e os apelidos são normalizados (minúsculas, sem acento,
 *     pontuação vira espaço);
 *   - o apelido precisa ser o nome inteiro OU o começo dele ("prefixo"), nunca
 *     um pedaço no meio. Isso evita "Primera Division" casar com qualquer
 *     "Primera Division" do continente;
 *   - `exclude` desqualifica categorias de base, feminino, copas e ligas de
 *     outros países/confederações que compartilham o mesmo nome genérico.
 *
 * Regra de ouro: um falso positivo (mostrar jogo de liga menor como principal)
 * é pior que um falso negativo, então os apelidos genéricos só valem no começo
 * do nome e sempre passam pelo `exclude`.
 */

export type MainLeague = {
  /** Chave canônica, estável, usada em código. */
  id: string;
  /** Nome de exibição. */
  name: string;
  /** Formas como a liga aparece nas APIs (prefixo ou nome completo). */
  aliases: string[];
  /** Tokens que, presentes no nome, desqualificam o casamento. */
  exclude?: string[];
};

export const MAIN_LEAGUES: MainLeague[] = [
  {
    id: "premier_league",
    name: "Premier League",
    aliases: ["Premier League", "English Premier League", "England Premier League", "EPL"],
    exclude: [
      "2", "u19", "u21", "u23", "cup", "women", "international", "reserve",
      "division", "armenia", "russia", "ukraine", "israel", "egypt", "nigeria",
      "kenya", "ghana", "ethiopia", "thailand", "singapore", "malta", "india",
      "iraq", "jamaica", "mongolia", "botswana", "burundi", "uganda", "tanzania",
      "azerbaijan", "wales", "scotland", "irish", "northern", "lowland",
    ],
  },
  {
    id: "la_liga",
    name: "La Liga",
    aliases: ["La Liga", "LaLiga", "Spanish La Liga", "Spain La Liga", "Spanish Primera Division"],
    exclude: [
      "2", "rfef", "segunda", "women", "u19", "u21", "cup", "copa", "regional",
      "tercera", "youth", "mx", "mexico", "expansion", "hypermotion",
    ],
  },
  {
    id: "serie_a",
    name: "Serie A",
    aliases: ["Serie A", "Italian Serie A", "Italy Serie A", "Serie A TIM"],
    exclude: [
      "women", "u17", "u19", "u20", "u21", "u23", "primavera", "coppa", "cup",
      "serie d", "2", "brasil", "brazil", "brasileirao", "argentina", "colombia",
      "chile", "peru", "uruguay", "paraguay", "bolivia", "venezuela", "ecuador",
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
    aliases: ["Ligue 1", "French Ligue 1", "France Ligue 1", "Ligue 1 Conforama"],
    exclude: ["2", "women", "u19", "u21", "cup", "coupe"],
  },
  {
    // Antes do Brasileirão Série A: "Brasileirão Série B" também contém "Brasileirão".
    id: "brasileirao_b",
    name: "Brasileirão Série B",
    aliases: [
      "Brasileirão Série B", "Brasileirão B", "Brazil Serie B", "Brasil Serie B",
      "Brazilian Serie B", "Campeonato Brasileiro Série B",
    ],
    exclude: ["women", "u20", "u19", "u23", "cup", "copa", "reserve"],
  },
  {
    id: "brasileirao_a",
    name: "Brasileirão Série A",
    aliases: [
      "Brasileirão Série A", "Brasileirão", "Brazil Serie A", "Brasil Serie A",
      "Brazilian Serie A", "Campeonato Brasileiro", "Campeonato Brasileiro Série A",
      "Serie A Brasil", "Serie A Brazil",
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
    aliases: [
      "Liga Argentina", "Liga Profesional", "Argentina Liga Profesional",
      "Argentine Liga Profesional", "Primera División Argentina",
      "Argentina Primera Division", "Torneo Betano",
    ],
    exclude: [
      "reserve", "reserves", "women", "u19", "u20", "u21", "youth",
      "championship", "primera b", "primera c", "torneo a", "torneo regional",
      "nacional b", "amateur",
    ],
  },
  {
    id: "mls",
    name: "MLS",
    aliases: ["MLS", "Major League Soccer", "USA MLS", "US MLS", "United States MLS"],
    exclude: ["next", "women", "u19", "u21", "reserve", "canada"],
  },
  {
    id: "saudi_pro_league",
    name: "Saudi Pro League",
    aliases: ["Saudi Pro League", "Saudi Professional League", "Saudi Premier League", "Saudi Arabia Pro League"],
    exclude: ["division", "2", "u19", "u21", "women", "cup"],
  },
  {
    id: "champions_league",
    name: "Champions League",
    aliases: ["UEFA Champions League", "Champions League", "Liga dos Campeões", "UCL"],
    exclude: [
      "women", "u19", "u21", "youth", "afa", "afc", "caf", "concacaf",
      "elite", "two", "qualification", "qualifying",
    ],
  },
  {
    // Antes da Europa League: "Europa Conference League" não deve cair na Europa.
    id: "conference_league",
    name: "Conference League",
    aliases: ["UEFA Conference League", "Conference League", "UEFA Europa Conference League", "Liga Conferência"],
    exclude: ["women", "u19", "u21", "youth", "qualification", "qualifying"],
  },
  {
    id: "europa_league",
    name: "Europa League",
    aliases: ["UEFA Europa League", "Europa League", "Liga Europa", "UEL"],
    exclude: ["conference", "women", "u19", "u21", "youth", "qualification", "qualifying"],
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
    aliases: ["Copa Sudamericana", "Sudamericana", "Sul-Americana", "Sulamericana", "CONMEBOL Sudamericana"],
    exclude: ["women", "u20", "u19", "sub 20", "sub 19", "youth", "feminina"],
  },
  {
    id: "nations_league",
    name: "Liga das Nações",
    aliases: ["UEFA Nations League", "Liga das Nações", "Nations League"],
    exclude: ["concacaf", "women", "u19", "u21", "youth"],
  },
];

/** Minúsculas, sem acento, pontuação vira espaço e espaços colapsados. */
export function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** O nome (já normalizado) começa com o apelido, no limite de palavra. */
function comecaCom(nome: string, apelido: string): boolean {
  return nome === apelido || nome.startsWith(apelido + " ");
}

/** O token (já normalizado) aparece inteiro dentro do nome. */
function contemToken(nome: string, token: string): boolean {
  return ` ${nome} `.includes(` ${token} `);
}

/**
 * Devolve a liga canônica correspondente ou `null` se não for uma das 16.
 * Retorna o objeto inteiro para quem precisa do `id` e do `name`.
 */
export function leagueOf(leagueName: string | null | undefined): MainLeague | null {
  if (!leagueName) return null;
  const nome = normalizar(String(leagueName));
  if (!nome) return null;

  for (const liga of MAIN_LEAGUES) {
    const casa = liga.aliases.some((a) => comecaCom(nome, normalizar(a)));
    if (!casa) continue;
    const bloqueado = (liga.exclude ?? []).some((t) => contemToken(nome, normalizar(t)));
    if (bloqueado) continue;
    return liga;
  }
  return null;
}

/** `true` se a liga informada é uma das 16 principais. */
export function isMainLeague(leagueName: string | null | undefined): boolean {
  return leagueOf(leagueName) !== null;
}

/** Chave canônica da liga (ou `null`). */
export function mainLeagueId(leagueName: string | null | undefined): string | null {
  return leagueOf(leagueName)?.id ?? null;
}

const IDS = new Set(MAIN_LEAGUES.map((l) => l.id));
export function isMainLeagueId(id: string | null | undefined): boolean {
  return !!id && IDS.has(id);
}

/** Nome de exibição a partir da chave canônica. */
export function mainLeagueName(id: string | null | undefined): string | null {
  return MAIN_LEAGUES.find((l) => l.id === id)?.name ?? null;
}
