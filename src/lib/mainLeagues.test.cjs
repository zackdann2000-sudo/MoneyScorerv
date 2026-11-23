/**
 * Teste do filtro de principais ligas.
 *
 * As listas abaixo NÃO são inventadas: os nomes em `DEVE_CASAR` e `NAO_DEVE_CASAR`
 * foram capturados das APIs reais em produção (KingStats, GameRead e apitou,
 * dias 2026-10-25 a 2026-11-17). Servem para travar falsos positivos — o risco
 * real do filtro não é deixar de fora, é deixar entrar liga de base/feminino.
 *
 * Rodar (compilando o TS para a mesma pasta):
 *   npx tsc src/lib/mainLeagues.ts --target es2022 --module commonjs --outDir .mlbuild
 *   cp src/lib/mainLeagues.test.cjs .mlbuild/ && node .mlbuild/mainLeagues.test.cjs
 */
const {
  isMainLeague, mainLeagueId, mainLeagueName, mainLeagueLabel, normalizar, TOTAL_LIGAS_PRINCIPAIS,
} = require("./mainLeagues.js");

let falhas = 0;
function check(nome, obtido, esperado) {
  const ok = obtido === esperado;
  if (!ok) {
    falhas++;
    console.log(`❌ ${nome}\n   obtido: ${JSON.stringify(obtido)} | esperado: ${JSON.stringify(esperado)}`);
  } else {
    console.log(`✅ ${nome}`);
  }
}

// nome da API → id canônico esperado
const DEVE_CASAR = [
  // KingStats (dados reais)
  ["England Premier League", "premier_league"],
  ["Spain La Liga", "la_liga"],
  ["Italy Serie A", "serie_a"],
  ["France Ligue 1", "ligue_1"],
  ["Brazil Serie A", "brasileirao_a"],
  ["Brazil Serie B", "brasileirao_b"],
  ["Argentina Liga Profesional", "argentina_primera"],
  ["USA MLS", "mls"],
  ["Saudi Arabia Pro League", "saudi_pro_league"],
  ["UEFA Champions League", "champions_league"],
  ["UEFA Europa League", "europa_league"],
  ["UEFA Conference League", "conference_league"],
  ["UEFA Nations League B", "nations_league"],
  ["UEFA Nations League A", "nations_league"],
  // GameRead / apitou (dados reais)
  ["UEFA Nations League", "nations_league"],
  ["Brasileirão", "brasileirao_a"],
  ["Liga das Nações", "nations_league"],
  // variações de outras fontes
  ["English Premier League", "premier_league"],
  ["EPL", "premier_league"],
  ["LaLiga", "la_liga"],
  ["Italian Serie A", "serie_a"],
  ["German Bundesliga", "bundesliga"],
  ["Bundesliga", "bundesliga"],
  ["French Ligue 1", "ligue_1"],
  ["Brazilian Serie A", "brasileirao_a"],
  ["Brasileirão Série A", "brasileirao_a"],
  ["Brasileirão Série B", "brasileirao_b"],
  ["Campeonato Brasileiro", "brasileirao_a"],
  ["Argentine Liga Profesional", "argentina_primera"],
  ["Major League Soccer", "mls"],
  ["Saudi Pro League", "saudi_pro_league"],
  ["Copa Libertadores", "libertadores"],
  ["Libertadores", "libertadores"],
  ["Copa Sudamericana", "sudamericana"],
  ["Sul-Americana", "sudamericana"],
  ["CONMEBOL Libertadores", "libertadores"],
  ["UEFA Europa Conference League", "conference_league"],
  // apelidos pedidos explicitamente na especificação do filtro
  ["Serie A Betano", "brasileirao_a"],
  ["Torneo Betano", "argentina_primera"],
  ["Liga Profesional", "argentina_primera"],
  ["Argentina Primera", "argentina_primera"],
  ["Italy Serie A", "serie_a"],
  ["Serie A TIM", "serie_a"],
  ["Major League Soccer", "mls"],
  ["USA MLS", "mls"],
  ["Brasil Serie A", "brasileirao_a"],
  ["Brazil Serie B", "brasileirao_b"],
  ["Brasileirao Serie B", "brasileirao_b"],
  // ligas de elite adicionadas depois (Holanda 2ª / Suécia 1ª)
  ["Eerste Divisie", "eerste_divisie"],
  ["Netherlands Eerste Divisie", "eerste_divisie"],
  ["Keuken Kampioen Divisie", "eerste_divisie"],
  ["Allsvenskan", "allsvenskan"],
  ["Sweden Allsvenskan", "allsvenskan"],
];

// nomes que NÃO podem entrar (base, feminino, copas, outros países/confederações)
const NAO_DEVE_CASAR = [
  "England Premier League 2",
  "England U21 Premier League Cup",
  "Premier League International Cup",
  "Armenia Premier League",
  "Russia Premier League",
  "Egypt Premier League Women",
  "England Northern Premier League",
  "England Southern Premier League Central",
  "Spain Primera Division RFEF Group 2",
  "Spain Copa del Rey",
  "Spain Segunda Division RFEF Group 1",
  "Italy Serie A Women",
  "Italy Serie D Cup",
  "Ecuador LigaPro Serie A",
  "France Ligue 2",
  "Ivory Coast Ligue 2",
  "Germany Bundesliga U19",
  "Germany Bundesliga Women",
  "Brazil Campeonato Carioca A2 U20",
  "Brazil Campeonato Paraibano Women",
  "Argentina Liga Profesional Reserves",
  "Argentina Primera B Metropolitana",
  "Argentina Torneo A",
  "Argentina Championship Women",
  "Saudi Arabia Division 1",
  "Saudi Arabia U21 League",
  "Mexico Liga Premier A",
  "UEFA Women's Champions League",
  "AFC Champions League Elite",
  "CAF Champions League Women",
  "CONCACAF Champions League",
  "CONCACAF Nations League",
  "Africa Cup of Nations - Qualification",
  "Copa Colombia",
  "Football League - Lowland League",
  "Friendlies",
  "International Match",
  // blacklist da especificação: base, feminino, divisões inferiores, copas
  "Brazil Serie A Women",
  "Brazil Serie A U20",
  "Brazil Serie A U17",
  "Italy Serie A U19",
  "Italy Serie A Youth",
  "Brazil Serie A Reserve",
  "Spain Primera B Nacional",
  "Argentina Tercera Division",
  "Argentina Primera B",
  "Brazil Amateur Serie A",
  "England FA Cup",
  "Spain Copa del Rey",
  "CONCACAF Champions Cup",
  "UEFA Women's Europa League",
  "Spain La Liga 2",
  // falsos positivos vistos em produção depois de trocar prefixo por "contém"
  "Zanzibar Premier League",
  "Sierra Leone Premier League",
  "Seychelles Premier League",
  "Kenya Premier League",
  "Ghana Premier League",
  "Uganda Premier League",
  "Zanzibar Champions League",
  "Ecuador Serie A",
  "Bolivia Serie A",
];

console.log("=== DEVE CASAR ===");
for (const [nome, id] of DEVE_CASAR) {
  check(`${nome} → ${id}`, mainLeagueId(nome), id);
  check(`${nome} isMainLeague`, isMainLeague(nome), true);
}

console.log("\n=== NÃO DEVE CASAR ===");
for (const nome of NAO_DEVE_CASAR) {
  check(`${nome} isMainLeague`, isMainLeague(nome), false);
}

console.log("\n=== normalização ===");
check("acento", normalizar("Brasileirão Série A"), "brasileirao serie a");
check("pontuação", normalizar("UEFA Champions League"), "uefa champions league");
check("vazio", isMainLeague(""), false);
check("null", isMainLeague(null), false);

console.log("\n=== blacklist roda antes da lista ===");
check("feminino bloqueado", isMainLeague("Brazil Serie A Women"), false);
check("base bloqueada", isMainLeague("Brazil Serie A U20"), false);
check("reserva bloqueada", isMainLeague("Brazil Serie A Reserve"), false);
check("segunda divisao bloqueada", isMainLeague("Spain Segunda Division"), false);
check("tercera bloqueada", isMainLeague("Argentina Tercera Division"), false);
check("amador bloqueado", isMainLeague("Brazil Amateur Serie A"), false);

console.log("\n=== excecao do 'cup' nas copas continentais ===");
check("copa nacional continua fora", isMainLeague("England FA Cup"), false);
check("champions com cup nao entra sozinho", isMainLeague("CONCACAF Champions Cup"), false);
check("libertadores continua dentro", isMainLeague("Copa Libertadores"), true);
check("sul-americana continua dentro", isMainLeague("Copa Sudamericana"), true);
check("conference continua dentro", isMainLeague("UEFA Conference League"), true);
check("excecao nao libera europeu de base", isMainLeague("UEFA Europa League U21"), false);

console.log("\n=== nome generico exige o pais ===");
check("Premier League sozinho é ambíguo", isMainLeague("Premier League"), false);
check("Serie A sozinho é ambíguo", isMainLeague("Serie A"), false);
check("Ligue 1 sozinho é ambíguo", isMainLeague("Ligue 1"), false);
check("Champions League sozinho é ambíguo", isMainLeague("Champions League"), false);
check("English Premier League", mainLeagueId("English Premier League"), "premier_league");
check("Bundesliga sozinho é a alemã?", isMainLeague("Bundesliga"), true);
check("Zanzibar Premier League fora", isMainLeague("Zanzibar Premier League"), false);

console.log("\n=== país explícito (2º argumento) ===");
check("Ligue 1 + France", mainLeagueId("Ligue 1", "France"), "ligue_1");
check("Ligue 1 + Algeria (bug de produção)", mainLeagueId("Ligue 1", "Algeria"), null);
check("Ligue 1 + Argélia sem acento", isMainLeague("Ligue 1", "Argelia"), false);
check("Serie A + Italy", mainLeagueId("Serie A", "Italy"), "serie_a");
check("Serie A + Ecuador", mainLeagueId("Serie A", "Ecuador"), null);
check("Serie A + Bolivia", mainLeagueId("Serie A", "Bolivia"), null);
check("Premier League + England", mainLeagueId("Premier League", "England"), "premier_league");
check("Premier League + Zanzibar", mainLeagueId("Premier League", "Zanzibar"), null);
check("Bundesliga + Germany", mainLeagueId("Bundesliga", "Germany"), "bundesliga");
check("Bundesliga + Austria", mainLeagueId("Bundesliga", "Austria"), null);
check("Brasileirão + Brazil", mainLeagueId("Brasileirão", "Brazil"), "brasileirao_a");
check("MLS + USA", mainLeagueId("MLS", "USA"), "mls");
check("país não atrapalha liga específica", mainLeagueId("Copa Libertadores", "CONMEBOL"), "libertadores");
check("pais vazio não quebra", mainLeagueId("Brasileirão", ""), "brasileirao_a");

console.log("\n=== tradução para português (mainLeagueLabel) ===");
check("BRAZIL SERIE A → Brasileirão Série A", mainLeagueLabel("BRAZIL SERIE A"), "Brasileirão Série A");
check("Brazil Serie A", mainLeagueLabel("Brazil Serie A"), "Brasileirão Série A");
check("SPAIN LA LIGA → La Liga", mainLeagueLabel("SPAIN LA LIGA"), "La Liga");
check("ITALY SERIE A → Serie A", mainLeagueLabel("ITALY SERIE A"), "Serie A");
check("ENGLAND PREMIER LEAGUE", mainLeagueLabel("ENGLAND PREMIER LEAGUE"), "Premier League");
check("GERMANY BUNDESLIGA", mainLeagueLabel("GERMANY BUNDESLIGA"), "Bundesliga");
check("liga fora das 18 volta crua", mainLeagueLabel("CHILE PRIMERA DIVISION"), "CHILE PRIMERA DIVISION");
check("espaço extra é limpo", mainLeagueLabel("  Chile   Primera  "), "Chile Primera");
check("vazio vira Outras competições", mainLeagueLabel(""), "Outras competições");
check("null vira Outras competições", mainLeagueLabel(null), "Outras competições");
check("país separa Ligue 1", mainLeagueLabel("Ligue 1", "Algeria"), "Ligue 1");
check("mainLeagueName usa a chave", mainLeagueName("brasileirao_a"), "Brasileirão Série A");
check("mainLeagueName de id inválido", mainLeagueName("nao_existe"), null);

console.log("\n=== contagem ===");
check("18 ligas na lista", TOTAL_LIGAS_PRINCIPAIS, 18);
check("isMainLeague('') ", isMainLeague(""), false);

console.log(`\n${falhas === 0 ? "✅ TODOS OS TESTES PASSARAM" : `❌ ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
