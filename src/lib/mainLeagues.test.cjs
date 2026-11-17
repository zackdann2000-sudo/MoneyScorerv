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
const { isMainLeague, mainLeagueId, normalizar } = require("./mainLeagues.js");

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
  ["Serie A", "serie_a"],
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

console.log(`\n${falhas === 0 ? "✅ TODOS OS TESTES PASSARAM" : `❌ ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
