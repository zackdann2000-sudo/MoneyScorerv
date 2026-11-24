/**
 * Teste do Combo Builder (puro).
 *
 * O que este teste protege:
 *  1. A odd do EV é a da Pinnacle — perna sem odd não entra (nada de odd de
 *     casa menor entrando pela porta de trás).
 *  2. Correlação é detectada e o EV do combo correlacionado fica `null`.
 *  3. Os três perfis saem e o "Seguro" é o de maior probabilidade.
 *
 * Rodar: ./scripts/unit-tests.sh combo
 */
const { montarCombos, motivoCorrelacao, evDe, correlacaoDoConjunto } = require("./comboBuilder.js");

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) console.log(`✅ ${nome}`);
  else {
    falhas++;
    console.log(`❌ ${nome}${detalhe ? `\n   ${detalhe}` : ""}`);
  }
}

const perna = (over = {}) => ({
  chave: "k",
  fixtureId: 1,
  origem: "mercado",
  matchLabel: "A × B",
  rotulo: "Mercado",
  prob: 0.6,
  odd: 2,
  ...over,
});

// EV
ok("EV de prob 50% e odd 2,00 = 0", evDe(0.5, 2) === 0, String(evDe(0.5, 2)));
ok("EV de prob 55% e odd 2,00 = +10%", Math.abs(evDe(0.55, 2) - 10) < 1e-9);
ok("EV sem odd = null", evDe(0.5, null) === null);
ok("EV com odd inválida (1,00) = null", evDe(0.5, 1) === null);

// Correlação
const propA = perna({ chave: "p1", jogador: "Yuri Alberto", origem: "prop" });
const propB = perna({ chave: "p2", jogador: "yuri alberto", origem: "prop" });
ok("mesmo jogador = correlacionado", Boolean(motivoCorrelacao(propA, propB)), String(motivoCorrelacao(propA, propB)));

const btts = perna({ chave: "m1", mercadoId: "btts", grupo: "gols" });
const over = perna({ chave: "m2", mercadoId: "over15_jogo", grupo: "gols" });
ok("BTTS × over = correlacionado", Boolean(motivoCorrelacao(btts, over)), String(motivoCorrelacao(btts, over)));

const g1t = perna({ chave: "m3", mercadoId: "ht_casa_05", grupo: "gols_1t" });
ok("gols do 1º tempo × gols do jogo = correlacionado", Boolean(motivoCorrelacao(g1t, over)));

const cantos = perna({ chave: "m4", mercadoId: "escanteios_jogo_85", grupo: "escanteios" });
ok("cantos × gols no mesmo jogo = independentes", motivoCorrelacao(cantos, over) === null);
ok("jogos diferentes = independentes", motivoCorrelacao(perna({ chave: "m5", fixtureId: 2, grupo: "gols" }), over) === null);

// Combos
const independentes = [
  perna({ chave: "a", fixtureId: 1, grupo: "gols", prob: 0.7, odd: 1.6 }),
  perna({ chave: "b", fixtureId: 2, grupo: "escanteios", prob: 0.65, odd: 1.7 }),
  perna({ chave: "c", fixtureId: 3, grupo: "gols_1t", prob: 0.6, odd: 1.8 }),
];
const combos = montarCombos(independentes);
ok("gera até 3 combos", combos.length === 3, `n=${combos.length}`);
ok("perfis nomeados", combos.every((c) => ["Seguro", "Equilibrado", "Ousado"].includes(c.perfil)));
ok("combo independente tem EV", combos.every((c) => c.ev != null), JSON.stringify(combos.map((c) => c.ev)));
ok(
  "prob do combo = produto das pernas",
  combos.every((c) => Math.abs(c.prob - c.pernas.reduce((a, p) => a * p.prob, 1)) < 1e-12),
);
ok(
  "odd do combo = produto das pernas",
  combos.every((c) => Math.abs(c.odd - c.pernas.reduce((a, p) => a * p.odd, 1)) < 1e-12),
);
const seguro = combos.find((c) => c.perfil === "Seguro");
ok("Seguro é o de maior probabilidade", seguro && combos.every((c) => c.prob <= seguro.prob));

// Correlação dentro do combo
const correlacionadas = [
  perna({ chave: "x", fixtureId: 1, grupo: "gols", prob: 0.8, odd: 1.4 }),
  perna({ chave: "y", fixtureId: 1, grupo: "gols", prob: 0.7, odd: 1.5 }),
];
const cCorr = montarCombos(correlacionadas);
ok("combo só com pernas correlacionadas é marcado", cCorr.length > 0 && cCorr.every((c) => c.correlacionado), JSON.stringify(cCorr.map((c) => c.correlacionado)));
ok("combo correlacionado não publica EV", cCorr.every((c) => c.ev === null));
ok("motivo da correlação é explicado", cCorr.every((c) => Boolean(c.motivo)));
ok("correlacaoDoConjunto resume o par", Boolean(correlacaoDoConjunto(correlacionadas)));

// Sem âncora
const semOdd = [
  perna({ chave: "s1", fixtureId: 1, grupo: "gols", odd: null }),
  perna({ chave: "s2", fixtureId: 1, grupo: "escanteios", odd: null }),
];
ok("perna sem odd de âncora não entra", montarCombos(semOdd).length === 0);
ok("uma perna só com odd não forma combo", montarCombos([independentes[0], semOdd[0]]).length === 0);

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\ncomboBuilder: tudo certo.");
