/**
 * Catálogo único de "principais ligas" usado por todas as telas.
 *
 * Cada fonte (ESPN, Football-Data.org, Sportmonks, Bzzoiro) batiza a mesma
 * competição de um jeito: a Serie A italiana chega como "Italy Serie A",
 * "Serie A" ou "Serie A TIM"; o Brasileirão como "Brazil Serie A",
 * "Brasileirão" ou "Serie A Betano". Este arquivo centraliza o mapa
 * canônico → apelidos (e códigos por fonte) para o filtro funcionar em
 * qualquer fonte.
 *
 * A lista é FECHADA em 16 competições. Não existe "todas as ligas": o produto
 * só publica estas. Qualquer outra é descartada antes de virar linha no banco.
 *
 * Ordem da decisão (importante):
 *   1. normaliza (minúsculas, sem acento, pontuação vira espaço);
 *   2. BLACKLIST — se o nome tem cara de base/feminino/copa/divisão inferior,
 *      retorna `false` na hora, antes de olhar a lista de ligas;
 *   3. só então procura um apelido das 16 ligas permitidas;
 *   4. `exclude` por liga desempata nomes genéricos que existem em vários
 *      países ("Premier League" da Armênia, "Serie A" do Equador, "Champions
 *      League" da CONCACAF);
 *   5. `pais` confirma o país/região que qualifica o nome genérico.
 *
 * Regra de ouro: falso positivo (mostrar liga menor como principal) é pior que
 * falso negativo. Por isso o veto vem primeiro e todo apelido genérico tem
 * `exclude` e/ou `pais`.
 */

/** Fontes de dados integradas no Hub. */
export type MainLeagueSource = "espn" | "footballdata" | "sportmonks" | "bzzoiro";

export type MainLeague = {
  /** Chave canônica, estável, usada em código. */
  id: string;
  /** Nome de exibição. */
  name: string;
  /** Formas como a liga aparece nas APIs (todas as fontes). */
  aliases: string[];
  /**
   * Códigos exatos de cada fonte. Onde a fonte identifica a liga por código
   * (ESPN: "eng.1", Football-Data: "PL") este é o casamento mais seguro —
   * independe do nome que o fornecedor devolveu no dia.
   */
  codes?: Partial<Record<MainLeagueSource, string[]>>;
  /** Tokens que, presentes no nome, desqualificam o casamento. */
  exclude?: string[];
  /**
   * País/região que precisa qualificar o nome genérico.
   *
   * "Premier League" existe na Zanzibar, na Sierra Leone e nas Seychelles; sem
   * essa exigência o filtro deixaria passar as três (falso positivo real visto
   * em produção). O nome exato continua valendo: "Premier League" sozinho, sem
   * país, é a inglesa.
   *
   * As fontes escrevem o país em inglês ("Spain") e em português ("Espanha"),
   * então cada lista de países carrega as duas grafias.
   */
  pais?: string[];
};

/**
 * As 16 ligas permitidas, na ordem em que são testadas.
 *
 * A ordem NÃO é alfabética de propósito: ligas cujo nome de uma é prefixo do
 * nome de outra vêm da mais específica para a mais genérica (Série B antes da
 * Série A, Conference antes da Europa League).
 */
export const MAIN_LEAGUES: MainLeague[] = [
  {
    id: "premier_league",
    name: "Premier League",
    pais: ["england", "english", "inglaterra", "epl"],
    aliases: [
      "Premier League", "English Premier League", "England Premier League",
      "English Premier", "Barclays Premier League", "EPL",
    ],
    codes: { espn: ["eng.1"], footballdata: ["PL"] },
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
    pais: ["spain", "spanish", "espanha", "laliga", "la liga"],
    aliases: [
      "La Liga", "LaLiga", "Spanish La Liga", "Spain La Liga",
      "Spanish Primera Division", "Spain Primera Division", "Liga BBVA",
      "Liga Santander", "Primera Division Spain",
    ],
    codes: { espn: ["esp.1"], footballdata: ["PD"] },
    exclude: [
      "2", "rfef", "segunda", "women", "u19", "u21", "cup", "copa", "regional",
      "tercera", "youth", "mx", "mexico", "expansion", "hypermotion",
    ],
  },
  {
    id: "serie_a",
    name: "Serie A",
    pais: ["italy", "italian", "italia", "serie a tim"],
    aliases: [
      "Serie A", "Italian Serie A", "Italy Serie A", "Serie A TIM",
      "Serie A Italy", "Serie A Italiana",
    ],
    codes: { espn: ["ita.1"], footballdata: ["SA"] },
    exclude: [
      "women", "u17", "u19", "u20", "u21", "u23", "primavera", "coppa", "cup",
      "serie d", "2", "brasil", "brazil", "brasileirao", "betano", "argentina",
      "colombia", "chile", "peru", "uruguay", "paraguay", "bolivia", "venezuela",
      "ecuador",
    ],
  },
  {
    // "Bundesliga" é nome único; a austríaca sai pelo `exclude` (austria/2).
    id: "bundesliga",
    name: "Bundesliga",
    aliases: [
      "Bundesliga", "German Bundesliga", "Germany Bundesliga",
      "1. Bundesliga", "Bundesliga Germany", "Fussball Bundesliga",
    ],
    codes: { espn: ["ger.1"], footballdata: ["BL1"] },
    exclude: [
      "2", "u19", "u21", "u23", "women", "cup", "regionalliga", "oberliga",
      "austria", "reserve",
    ],
  },
  {
    id: "ligue_1",
    name: "Ligue 1",
    pais: ["french", "france", "franca"],
    aliases: ["Ligue 1", "French Ligue 1", "France Ligue 1", "Ligue 1 Conforama", "Ligue 1 France"],
    codes: { espn: ["fra.1"], footballdata: ["FL1"] },
    exclude: ["2", "women", "u19", "u21", "cup", "coupe"],
  },
  {
    // Antes do Brasileirão Série A: "Brasileirão Série B" também contém "Brasileirão".
    id: "brasileirao_b",
    name: "Brasileirão Série B",
    pais: ["brazil", "brazilian", "brasil", "brasileirao", "brasileiro", "serie b"],
    aliases: [
      "Brasileirão Série B", "Brasileirão B", "Brazil Serie B", "Brasil Serie B",
      "Brazilian Serie B", "Campeonato Brasileiro Série B",
      "Brasileirao Serie B", "Serie B Brazil", "Serie B Brasil", "Serie B Betano",
    ],
    codes: { espn: ["bra.2"] },
    exclude: ["women", "feminino", "u20", "u19", "u23", "cup", "copa", "reserve"],
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
    codes: { espn: ["bra.1"], footballdata: ["BSA"] },
    exclude: [
      "women", "feminino", "u20", "u19", "u23", "cup", "copa", "reserve",
      "carioca", "paulista", "gaucho", "cearense", "potiguar", "paraibano",
      "fares", "paraiba", "a2", "a3", "serie b", "2",
    ],
  },
  {
    id: "argentina_primera",
    name: "Liga Argentina",
    pais: ["argentina", "argentine", "liga profesional", "torneo betano"],
    aliases: [
      "Liga Argentina", "Liga Profesional", "Liga Profesional Argentina",
      "Argentina Liga Profesional", "Argentine Liga Profesional",
      "Primera División Argentina", "Argentina Primera Division",
      "Argentina Primera", "Torneo Betano", "Liga Profesional de Futbol",
    ],
    codes: { espn: ["arg.1"] },
    exclude: [
      "reserve", "reserves", "women", "u19", "u20", "u21", "youth",
      "championship", "primera b", "primera c", "torneo a", "torneo regional",
      "nacional b", "amateur",
    ],
  },
  {
    id: "mls",
    name: "MLS",
    pais: ["usa", "us", "united states", "eua", "major league soccer", "mls"],
    aliases: ["MLS", "Major League Soccer", "USA MLS", "US MLS", "United States MLS", "MLS USA"],
    codes: { espn: ["usa.1"] },
    exclude: ["next", "women", "u19", "u21", "reserve", "canada"],
  },
  {
    id: "saudi_pro_league",
    name: "Saudi Pro League",
    pais: ["saudi", "arabia saudita"],
    aliases: [
      "Saudi Pro League", "Saudi Professional League", "Saudi Premier League",
      "Saudi Arabia Pro League", "Saudi League", "Roshn Saudi League",
      "Saudi Arabia Saudi League",
    ],
    codes: { espn: ["ksa.1"] },
    exclude: ["division", "2", "u19", "u21", "women", "cup"],
  },
  {
    id: "champions_league",
    name: "Champions League",
    pais: ["uefa", "europe", "europa", "liga dos campeoes"],
    aliases: [
      "UEFA Champions League", "Champions League", "Liga dos Campeões",
      "UCL", "European Champions League",
    ],
    codes: { espn: ["uefa.champions"], footballdata: ["CL"] },
    exclude: ["women", "u19", "u21", "youth", "afa", "afc", "caf", "concacaf", "elite", "two"],
  },
  {
    // Antes da Europa League: "Europa Conference League" não é a Europa League.
    id: "conference_league",
    name: "Conference League",
    pais: ["uefa", "europe", "europa", "liga conferencia"],
    aliases: [
      "UEFA Conference League", "Conference League",
      "UEFA Europa Conference League", "Liga Conferência", "UECL",
      "Europa Conference League",
    ],
    codes: { espn: ["uefa.europa.conf"], footballdata: ["ECL"] },
    exclude: ["women", "u19", "u21", "youth"],
  },
  {
    id: "europa_league",
    name: "Europa League",
    pais: ["uefa", "europe", "europa", "liga europa"],
    aliases: ["UEFA Europa League", "Europa League", "Liga Europa", "UEL"],
    codes: { espn: ["uefa.europa"], footballdata: ["EL"] },
    exclude: ["conference", "women", "u19", "u21", "youth"],
  },
  {
    // Nome próprio: não existe "Libertadores" de outro continente.
    id: "libertadores",
    name: "Libertadores",
    aliases: [
      "Copa Libertadores", "Libertadores", "CONMEBOL Libertadores",
      "Copa Libertadores de America", "Copa Libertadores da America",
    ],
    codes: { espn: ["conmebol.libertadores"] },
    exclude: ["women", "feminina", "feminino", "u20", "u19", "sub 20", "sub 19", "youth"],
  },
  {
    // Nome próprio: "Sul-Americana" não colide com liga nacional.
    id: "sudamericana",
    name: "Sul-Americana",
    aliases: [
      "Copa Sudamericana", "Sudamericana", "Sul-Americana", "Sulamericana",
      "CONMEBOL Sudamericana", "Copa Sul-Americana",
    ],
    codes: { espn: ["conmebol.sudamericana"] },
    exclude: ["women", "feminina", "feminino", "u20", "u19", "sub 20", "sub 19", "youth"],
  },
  {
    id: "nations_league",
    name: "Liga das Nações",
    pais: ["uefa", "europe", "europa", "liga das nacoes", "nations"],
    aliases: ["UEFA Nations League", "Liga das Nações", "Nations League"],
    codes: { espn: ["uefa.nations"] },
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
  "women", "feminin", "feminina", "feminino", "u17", "u19", "u20", "u21",
  "u23", "youth", "reserve", "tercera", "segunda", "primera b", "amateur", "cup",
];

/** Termos que "salvam" o token `cup` do veto (copas continentais que valem). */
const EXCECOES_COPA: string[] = [
  "champions", "europa", "libertadores", "sul americana", "sudamericana", "conference",
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

/** Token (já normalizado) presente inteiro no nome, inclusive números ("2"). */
function contemToken(nome: string, token: string): boolean {
  const t = normalizar(token);
  if (!t) return false;
  return ` ${nome} `.includes(` ${t} `);
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
 * isMainLeague("Bolivia Primera Division") // false (fora das 16)
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

/* ===================== CODES POR FONTE (casamento exato) ===================== */

/**
 * Índice `fonte/código` → chave canônica.
 *
 * É o caminho preferido quando a fonte informa um código estável (ESPN "eng.1",
 * Football-Data "PL"): não depende de como o fornecedor escreveu o nome no dia.
 */
const CODE_INDEX: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const liga of MAIN_LEAGUES) {
    for (const [fonte, codigos] of Object.entries(liga.codes ?? {})) {
      for (const codigo of codigos ?? []) {
        if (!codigo) continue;
        out[`${fonte}:${normalizar(codigo)}`] = liga.id;
      }
    }
  }
  return out;
})();

/** Liga canônica a partir do código de uma fonte (ou `null`). */
export function leagueOfCode(source: MainLeagueSource, code: string | null | undefined): MainLeague | null {
  if (!code) return null;
  const id = CODE_INDEX[`${source}:${normalizar(code)}`];
  return id ? MAIN_LEAGUES.find((l) => l.id === id) ?? null : null;
}

/** `true` se `code` é uma das 16 ligas naquela fonte. */
export function isMainLeagueCode(source: MainLeagueSource, code: string | null | undefined): boolean {
  return leagueOfCode(source, code) !== null;
}

/** Código ESPN ("eng.1") → chave canônica. */
export function mainLeagueIdFromEspnCode(code: string | null | undefined): string | null {
  return leagueOfCode("espn", code)?.id ?? null;
}

/** Código Football-Data ("PL") → chave canônica. */
export function mainLeagueIdFromFootballDataCode(code: string | null | undefined): string | null {
  return leagueOfCode("footballdata", code)?.id ?? null;
}

/**
 * Códigos que o plano free do Football-Data.org cobre entre as nossas 16.
 *
 * São exatamente SEIS: PL, PD, SA, BL1, FL1 e BSA. O resto das nossas ligas
 * (Libertadores, MLS, Saudi, Conference, Nations League, Série B) o FD não
 * entrega nas contas gratuitas. Este array é a fonte da verdade para o
 * escalonamento de requisições em `footballdata-hub.ts` — se um dia o plano
 * mudar, muda aqui e o throttle acompanha.
 */
export const FOOTBALLDATA_MAIN_CODES = ["PL", "PD", "SA", "BL1", "FL1", "BSA"] as const;

/** Pausa entre requisições consecutivas ao Football-Data (ms) — 10 req/min. */
export const FOOTBALLDATA_REQUEST_PAUSE_MS = 6_000;

/** Códigos ESPN das 16 ligas — usado para filtrar listas que chegam por código. */
export const ESPN_MAIN_CODES: string[] = MAIN_LEAGUES.flatMap((l) => l.codes?.espn ?? []);

/**
 * Filtra uma lista qualquer mantendo só o que é liga principal.
 *
 * `key` diz como extrair nome e código do item; devolve a lista filtrada
 * preservando a ordem. Serve tanto para fixtures cruas quanto para as linhas
 * que a ESPN devolve para a tela.
 */
export function filterMainLeagues<T>(
  items: readonly T[],
  get: (item: T) => { name?: string | null; country?: string | null; source?: MainLeagueSource; code?: string | null },
): T[] {
  const out: T[] = [];
  for (const item of items) {
    const { name, country, source, code } = get(item);
    const porCodigo = source && code ? isMainLeagueCode(source, code) : false;
    if (porCodigo || isMainLeague(name, country)) out.push(item);
  }
  return out;
}

/**
 * Nome em português a partir do nome que a fonte mandou.
 *
 * As fontes (KingStats, ESPN, NerdyTips) escrevem a liga em inglês —
 * "BRAZIL SERIE A", "SPAIN LA LIGA". A lista de principais ligas já sabe
 * traduzir (`name`), mas só a partir da chave canônica; esta função faz o
 * caminho completo: nome cru → `mainLeagueId` → `mainLeagueName`.
 *
 * Liga fora das 16 volta como veio (só normalizada em espaço), porque inventar
 * tradução para 700 competições seria pior que mostrar o nome original.
 *
 * ```ts
 * mainLeagueLabel("BRAZIL SERIE A")   // "Brasileirão Série A"
 * mainLeagueLabel("Spain LaLiga")     // "La Liga"
 * mainLeagueLabel("Chile Primera")    // "Chile Primera"
 * ```
 */
export function mainLeagueLabel(leagueName: string | null | undefined, pais?: string | null): string {
  const traduzido = mainLeagueName(mainLeagueId(leagueName, pais));
  if (traduzido) return traduzido;
  const bruto = typeof leagueName === "string" ? leagueName.trim().replace(/\s+/g, " ") : "";
  return bruto || "Outras competições";
}

/** Quantidade de ligas na lista (16) — usada em texto de UI/teste. */
export const TOTAL_LIGAS_PRINCIPAIS = MAIN_LEAGUES.length;
