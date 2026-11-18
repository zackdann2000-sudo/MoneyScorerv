/**
 * Tradução de mercados de apostas para português.
 *
 * Problema real: a API do gameread devolve o nome do mercado no idioma da casa
 * que o forneceu (já vimos romeno, inglês e português) e, quando não há nome,
 * devolve a chave crua (`away_team_total_goals`, `btts`). A tela mostrava
 * "Faulturi suferite jucător" e "goals_over_under_1h".
 *
 * Estratégia, em ordem de prioridade:
 *   1. traduzir pela CHAVE crua (`market`) — é estável e independe do idioma;
 *   2. traduzir pelo rótulo exato (dicionário de rótulos conhecidos);
 *   3. trocar termos soltos (romeno/inglês) dentro do rótulo;
 *   4. formatar o que sobrou (remove underlines, capitaliza a primeira letra).
 *
 * Nada aqui inventa mercado: se não souber traduzir, apenas arruma a aparência.
 */

/** Chave crua da API -> português. Fonte primária de verdade. */
export const MARKET_TRANSLATIONS: Record<string, string> = {
  // --- gols
  goals_over_under: "Total de gols",
  goals_over_under_1h: "Gols do 1º tempo",
  goals_over_under_2h: "Gols do 2º tempo",
  btts: "Ambas marcam",
  home_team_total_goals: "Gols do mandante",
  away_team_total_goals: "Gols do visitante",
  home_team_goals_1h: "Gols do mandante (1ºT)",
  away_team_goals_1h: "Gols do visitante (1ºT)",
  home_team_goals_2h: "Gols do mandante (2ºT)",
  away_team_goals_2h: "Gols do visitante (2ºT)",
  total_goals: "Total de gols",
  goals_total: "Total de gols",

  // --- cantos
  corners_over_under: "Total de cantos",
  corners_over_under_1h: "Cantos do 1º tempo",
  home_corners_over_under: "Cantos do mandante",
  away_corners_over_under: "Cantos do visitante",
  home_corners_over_under_1h: "Cantos do mandante (1ºT)",
  away_corners_over_under_1h: "Cantos do visitante (1ºT)",

  // --- cartões
  cards_over_under: "Total de cartões",
  cards_over_under_1h: "Cartões do 1º tempo",
  home_team_cards: "Cartões do mandante",
  away_team_cards: "Cartões do visitante",
  home_team_cards_1h: "Cartões do mandante (1ºT)",
  away_team_cards_1h: "Cartões do visitante (1ºT)",
  yellow_cards_over_under: "Total de amarelos",

  // --- faltas / impedimentos / desarmes
  fouls_over_under: "Total de faltas",
  home_team_fouls: "Faltas do mandante",
  away_team_fouls: "Faltas do visitante",
  offsides_over_under: "Total de impedimentos",
  home_team_offsides: "Impedimentos do mandante",
  away_team_offsides: "Impedimentos do visitante",
  tackles_over_under: "Total de desarmes",

  // --- jogador
  anytime_goal_scorer: "Jogador marca",
  first_goal_scorer: "Jogador marca o 1º gol",
  last_goal_scorer: "Jogador marca o último gol",
  player_to_score: "Jogador marca",
  player_to_score_2_plus: "Jogador marca 2+ gols",
  player_to_score_or_assist: "Jogador marca ou assiste",
  player_assists: "Assistências do jogador",
  player_goalkeeper_saves: "Defesas do goleiro",
  player_shots_total: "Finalizações do jogador",
  player_shots_on_target: "Finalizações no gol (jogador)",
  player_to_be_booked: "Jogador recebe cartão",
  player_cards: "Cartões do jogador",
  player_fouls: "Faltas do jogador",
  player_fouls_suffered: "Faltas sofridas (jogador)",
  player_fouls_committed: "Faltas cometidas (jogador)",
  player_offsides: "Impedimentos do jogador",
  player_tackles: "Desarmes do jogador",
  player_passes: "Passes do jogador",

  // --- time: finalizações / defesas
  shots_total: "Finalizações totais",
  shots_total_1h: "Finalizações (1ºT)",
  shots_home: "Finalizações do mandante",
  shots_away: "Finalizações do visitante",
  shots_on_goal_total: "Finalizações no gol",
  shots_on_goal_total_1h: "Finalizações no gol (1ºT)",
  shots_on_goal_home: "Finalizações no gol do mandante",
  shots_on_goal_away: "Finalizações no gol do visitante",
  saves_total: "Defesas totais",
  saves_home: "Defesas do mandante",
  saves_away: "Defesas do visitante",
};

/**
 * Rótulos exatos já vistos (comparados após normalização: minúsculas e sem
 * acento). Cobre o romeno e variações de outras casas.
 */
const LABEL_TRANSLATIONS: Record<string, string> = {
  "faulturi suferite jucator": "Faltas sofridas (jogador)",
  "faulturi comise jucator": "Faltas cometidas (jogador)",
  "faulturi jucator": "Faltas do jogador",
  "ofsaiduri jucator": "Impedimentos do jogador",
  "jucatorul inscrie": "Jogador marca",
  "jucatorul inscrie golul numarul 1": "Jogador marca o 1º gol",
  "jucatorul inscrie sau da o pasa de gol": "Jogador marca ou assiste",
  "jucatorul primeste cartonas": "Jogador recebe cartão",
  "a doua repriza total goluri": "Gols do 2º tempo",
  "prima repriza total goluri": "Gols do 1º tempo",
  "ambele echipe marcheaza gg": "Ambas marcam",
  "ambele echipe marcheaza": "Ambas marcam",
  "both teams score": "Ambas marcam",
  "both teams to score": "Ambas marcam",
  "total goluri": "Total de gols",
  "total cartonase": "Total de cartões",
  "total cornere": "Total de cantos",
  "total faulturi": "Total de faltas",
  "total de escanteios": "Total de cantos",
  "total cartoes": "Total de cartões",
};

/**
 * Termos soltos (romeno/inglês) trocados dentro de rótulos compostos, como
 * "A doua repriză - Total goluri Barcelona" -> "2º tempo - Total de gols Barcelona".
 * Aplicados sobre o texto normalizado (sem acento).
 */
const TERMOS: [RegExp, string][] = [
  [/\ba doua repriza\b/g, "2º tempo"],
  [/\bprima repriza\b/g, "1º tempo"],
  [/\bambele echipe marcheaza\b/g, "ambas marcam"],
  [/\bjucatorul inscrie golul numarul 1\b/g, "jogador marca o 1º gol"],
  [/\bjucatorul inscrie sau da o pasa de gol\b/g, "jogador marca ou assiste"],
  [/\bjucatorul inscrie\b/g, "jogador marca"],
  [/\bjucatorul primeste cartonas\b/g, "jogador recebe cartão"],
  [/\bfaulturi suferite\b/g, "faltas sofridas"],
  [/\bfaulturi comise\b/g, "faltas cometidas"],
  [/\bfaulturi\b/g, "faltas"],
  [/\bsuferite\b/g, "sofridas"],
  [/\bcomise\b/g, "cometidas"],
  [/\bjucatorul\b/g, "jogador"],
  [/\bjucator\b/g, "jogador"],
  [/\binscrie\b/g, "marca"],
  [/\bprimeste\b/g, "recebe"],
  [/\bcartonase\b/g, "cartões"],
  [/\bcartonas\b/g, "cartão"],
  [/\bpas[ae] de gol\b/g, "assistência"],
  [/\bofsaiduri\b/g, "impedimentos"],
  [/\bcornere\b/g, "cantos"],
  [/\bsuturi\b/g, "finalizações"],
  [/\bgoluri\b/g, "gols"],
  [/\bgol\b/g, "gol"],
  [/\btotal\b/g, "total"],
  [/\baway\b/g, "visitante"],
  [/\bhome\b/g, "mandante"],
  [/\bfirst half\b/g, "1º tempo"],
  [/\bsecond half\b/g, "2º tempo"],
  [/\b1st half\b/g, "1º tempo"],
  [/\b2nd half\b/g, "2º tempo"],
];

/** Minúsculas, sem acento e sem pontuação — para comparar rótulos. */
function normalizar(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Formatação de último recurso: remove underlines, colapsa espaços e sobe a
 * primeira letra. Não traduz — só deixa apresentável.
 */
export function formatarMercado(valor: string): string {
  const s = String(valor || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "Mercado";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Traduz um mercado. `market` é a chave crua (preferida); `label` é o nome que
 * veio da casa. Devolve sempre uma string pronta para exibir.
 */
export function traduzirMercado(market?: string | null, label?: string | null): string {
  const chave = String(market || "").trim().toLowerCase();
  if (chave && MARKET_TRANSLATIONS[chave]) return MARKET_TRANSLATIONS[chave];

  const rotulo = String(label || "").trim();
  if (rotulo) {
    const exato = LABEL_TRANSLATIONS[normalizar(rotulo)];
    if (exato) return exato;

    const norm = normalizar(rotulo);
    let texto = norm;
    for (const [rx, pt] of TERMOS) texto = texto.replace(rx, pt);

    if (texto !== norm) return formatarMercado(texto);
    return formatarMercado(rotulo);
  }

  return formatarMercado(chave);
}
