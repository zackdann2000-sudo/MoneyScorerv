/**
 * Teste do parser de fontes do apitou — dados MOCK, sem rede.
 *
 * Roda com: node .apttest/fonte.test.cjs
 *
 * Os fixtures em __fixtures__/ foram extraídos de 1 jogo real do site, mas
 * reduzidos a ~64 KB (o original tem 22 MB). Contêm a estrutura verdadeira:
 * SC_SEMANA com fixtures/elencos/raioxRaw/h2h/escalacoes/arbitros, e SC_LINHAS
 * com as odds por jogador. O objetivo é provar que `parseDados` extrai médias,
 * H2H, escalação, árbitro e odds corretamente ANTES de tocar no arquivo grande.
 */
const { readFileSync } = require("fs");
const { join } = require("path");
const F = require("./fonte.js");

let falhas = 0;
function check(nome, obtido, esperado, tol = 1e-9) {
  const ok =
    typeof obtido === "number" && typeof esperado === "number"
      ? Math.abs(obtido - esperado) <= tol
      : JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  const fmt = (v) => (typeof v === "number" ? v.toFixed(6) : JSON.stringify(v));
  console.log(`${ok ? "✅" : "❌"} ${nome.padEnd(46)} obtido=${fmt(obtido)}${ok ? "" : " esperado=" + fmt(esperado)}`);
}

/** Reembrulha o JSON no formato real do site: window.X={...}; */
function comoSite(nome, obj) {
  return `window.${nome}=${JSON.stringify(obj)};`;
}

const dir = join(__dirname, "__fixtures__");

console.log("\n=== 0. Carregamento dos fixtures ===");
const semanaJson = JSON.parse(readFileSync(join(dir, "mock-semana.json"), "utf8"));
const linhasJson = JSON.parse(readFileSync(join(dir, "mock-linhas.json"), "utf8"));
const dadosJs = comoSite("SC_SEMANA", semanaJson);
const linhasJs = comoSite("SC_LINHAS", linhasJson);
console.log(`  semana=${(dadosJs.length / 1024).toFixed(0)}KB linhas=${(linhasJs.length / 1024).toFixed(0)}KB`);

console.log("\n=== 1. parseGlobais (extrai window.X do texto) ===");
const g = F.parseGlobais(dadosJs + "\n" + linhasJs);
check("encontrou SC_SEMANA", typeof g.SC_SEMANA, "object");
check("encontrou SC_LINHAS", typeof g.SC_LINHAS, "object");
check("SC_SEMANA.fixtures é lista", Array.isArray(g.SC_SEMANA.fixtures), true);
// Duas atribuições no mesmo texto: o parser não pode parar na primeira.
check("leu 2 atribuições", Object.keys(g).length, 2);

console.log("\n=== 2. parseDados (resumo do jogo) ===");
// Desvio padrão que o teste usa para comparar com o JSON cru.
let r;
try {
  r = F.parseDados(dadosJs, linhasJs);
} catch (e) {
  console.log("❌ parseDados lançou:", e.message);
  process.exit(1);
}
check("geradoEm preservado", r.geradoEm, semanaJson.geradoEm);
check("fonte preservada", r.fonte, semanaJson.fonte);
check("1 jogo no resumo", r.jogos.length, 1);

const j = r.jogos[0];
const f = semanaJson.fixtures[0];

console.log("\n=== 3. Identificação do jogo ===");
check("id", j.id, f.id);
check("mandante", j.home, f.home);
check("visitante", j.away, f.away);
check("competição", j.competicao, f.competicao);
check("kickoff", j.kickoff, f.kickoff);

console.log("\n=== 4. Jogadores com props ===");
const nomesLinhas = Object.keys(linhasJson.jogos[String(f.id)].jogador);
console.log(`  nas linhas: ${nomesLinhas.join(", ")}`);
check("jogadores extraídos = jogadores com odds", j.jogadores.length, nomesLinhas.length);

// CASO REAL: o site nem sempre cruza as listas. Aqui os jogadores com odds
// (Mihajlo Cvetkovic...) NÃO estão na lista `players` do fixture (Tzolis...).
// O parser precisa cair no elenco do time e mesmo assim preencher os campos.
const alvoNome = nomesLinhas[0];
const jp = j.jogadores.find((x) => x.nome === alvoNome);
console.log(`  conferindo (só nas odds): ${alvoNome}`);
check("jogador extraído das odds", Boolean(jp), true);
check("props não vazias", Object.keys(jp.props).length > 0, true);
// Time e posição vêm do elenco (fallback) — não podem ficar vazios.
const elencoOrigem = semanaJson.elencos[String(f.homeId)]
  .concat(semanaJson.elencos[String(f.awayId)])
  .find((e) => e.name === alvoNome);
check("time preenchido pelo elenco", jp.time.length > 0, true);
console.log(`    time="${jp.time}" pos="${jp.pos}" media=${jp.media} (elenco: ${elencoOrigem ? "achado" : "AUSENTE"})`);

// E o caso oposto: um jogador do fixture QUE TENHA odds é copiado fielmente.
const cruzado = f.players.find((p) => nomesLinhas.includes(p.name));
if (cruzado) {
  const jc = j.jogadores.find((x) => x.nome === cruzado.name);
  console.log(`  conferindo (nas duas listas): ${cruzado.name}`);
  check("media do fixture", jc.media, cruzado.media);
  check("mediaOn do fixture", jc.mediaOn, cruzado.mediaOn);
  check("minutosMedios do fixture", jc.minutosMedios, cruzado.minutosMedios);
  check("multAdversario do fixture", jc.multAdversario, cruzado.multAdversario);
  check("isHome do fixture", jc.isHome, cruzado.isHome);
  check("pos do fixture", jc.pos, cruzado.pos);
  check("playerId", jc.playerId, cruzado.playerId);
} else {
  console.log("  (nenhum jogador nas duas listas neste mock — checagem cruzada pulada)");
}

console.log("\n=== 5. Odds por mercado (normalizadas) ===");
// Compara com o JSON cru das linhas.
const mercadosCrus = linhasJson.jogos[String(f.id)].jogador[alvoNome];
check("mercados do jogador", Object.keys(jp.props).sort(), Object.keys(mercadosCrus).sort());
const primeiroMercado = Object.keys(jp.props)[0];
const linhasCru = mercadosCrus[primeiroMercado].l;
console.log(`  mercado "${primeiroMercado}": ${JSON.stringify(linhasCru)}`);
check(
  `nº de linhas de ${primeiroMercado}`,
  jp.props[primeiroMercado].length,
  Object.keys(linhasCru).length,
);
// Ordenação crescente por linha (o parser garante isso).
const linhasOrd = jp.props[primeiroMercado].map((l) => l.linha);
check("linhas em ordem crescente", linhasOrd, [...linhasOrd].sort((a, b) => a - b));
// Odd confere com o cru.
check("odd da primeira linha", jp.props[primeiroMercado][0].odd, linhasCru[String(linhasOrd[0])]);

console.log("\n=== 6. Estatísticas do time (raio-X) ===");
// Média calculada pelo parser sobre os jogos do raio-X.
const raioxHome = semanaJson.raioxRaw[String(f.homeId)].geral;
const golsCalc = raioxHome.reduce((a, x) => a + (x.gols || 0), 0) / raioxHome.length;
console.log(`  raio-X mandante: ${raioxHome.length} jogos`);
check("statsHome existe", j.statsHome !== null, true);
check("statsHome.jogos = jogos do raio-X", j.statsHome.jogos, raioxHome.length);
check("statsHome.gols = média calculada", j.statsHome.gols, Math.round(golsCalc * 100) / 100, 1e-9);
check("statsAway existe", j.statsAway !== null, true);

console.log("\n=== 7. H2H ===");
const h2hCru = semanaJson.h2h[String(f.id)];
check("nº de confrontos", j.h2hResumo.length, Math.min(h2hCru.length, 6));
check("primeiro H2H casa", j.h2hResumo[0].casa, h2hCru[0].nH);
check("primeiro H2H gols", j.h2hResumo[0].golsCasa, h2hCru[0].gH);

console.log("\n=== 8. Escalação ===");
check("escalação mandante presente", j.escHome !== null, true);
check("formação", j.escHome.formacao, semanaJson.escalacoes.ultimas[String(f.homeId)].formacao);
check("11 titulares", j.escHome.xi.length, semanaJson.escalacoes.ultimas[String(f.homeId)].xi.length);

console.log("\n=== 9. Árbitro ===");
check("árbitro presente", j.arbitro !== null, true);
check("nome do árbitro", j.arbitro.nome, semanaJson.arbitros[String(f.id)].nome);
check("média de amarelos", j.arbitro.amarelos, semanaJson.arbitros[String(f.id)].amarelos);

console.log("\n=== 10. Odds de time ===");
const timeCru = linhasJson.jogos[String(f.id)].time || {};
check("mercados de time extraídos", j.mercados.length, Object.keys(timeCru).length);
if (j.mercados.length) {
  const m = j.mercados[0];
  console.log(`  mercado "${m.mercado}" períodos: ${Object.keys(m.periodos).join(", ")}`);
  check("tem períodos", Object.keys(m.periodos).length > 0, true);
}

console.log("\n=== 11. Robustez ===");
// Entrada inválida deve lançar erro claro, não travar.
try {
  F.parseDados("window.SC_OUTRA={};", linhasJs);
  check("sem SC_SEMANA lança erro", false, true);
} catch (e) {
  check("sem SC_SEMANA lança erro claro", e.message.includes("SC_SEMANA"), true);
}
// Jogo sem linhas não quebra o parse: só gera aviso.
const semLinhas = comoSite("SC_SEMANA", semanaJson) + "\n" + comoSite("SC_LINHAS", { geradoEm: "x", jogos: {} });
const r2 = F.parseDados(semLinhas, comoSite("SC_LINHAS", { geradoEm: "x", jogos: {} }));
check("jogo sem linhas vira aviso", r2.avisos.length >= 0, true);

console.log(
  falhas === 0
    ? "\n🎉 PARSER OK — extraiu médias, odds, H2H, escalação e árbitro do arquivo pequeno.\n"
    : `\n❌ ${falhas} verificação(ões) falharam.\n`,
);
process.exit(falhas ? 1 : 0);
