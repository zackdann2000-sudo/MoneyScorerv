const assert = require("assert");
const {
  desvigar,
  oddJustaDe,
  faixaRisco,
  avaliarOportunidades,
  FAVORITO_ODD_MIN,
  FAVORITO_PROB_MIN,
  VALOR_ODD_MIN,
  VALOR_ODD_MAX,
  BOMBA_PROB_MIN,
} = require("./valueBet.js");

const r2 = (v) => Math.round(v * 100) / 100;

/* ---------------- de-vig: odd justa ---------------- */

// 1.90 / 3.40 / 4.20 → soma 1.0588 → margem 5.9%
const m = desvigar([1.9, 3.4, 4.2]);
assert.ok(m, "mercado de 3 lados deve desvigar");
assert.strictEqual(r2(m.somaImplicita), 1.06);
assert.strictEqual(r2(m.margem), 0.06);
// a odd justa é sempre MAIOR que a da casa (a casa cobra comissão)
m.oddsJustas.forEach((j, i) => assert.ok(j > [1.9, 3.4, 4.2][i], "justa deve superar a odd da casa"));
// as probabilidades justas somam 1
const somaJusta = m.oddsJustas.reduce((s, j) => s + 1 / j, 0);
assert.ok(Math.abs(somaJusta - 1) < 1e-3, `probs justas devem somar 1 (deu ${somaJusta})`);
// justa = odd × soma
assert.strictEqual(m.oddsJustas[0], +(1.9 * m.somaImplicita).toFixed(3));

// mercado justo (soma = 1) não tem margem para remover
const justo = desvigar([2, 2]);
assert.strictEqual(justo.margem, 0);
assert.deepStrictEqual(justo.oddsJustas, [2, 2]);

// um lado só não é mercado → null (não inventamos margem)
assert.strictEqual(desvigar([1.9]), null);
assert.strictEqual(desvigar([1.9, null]), null);
assert.strictEqual(desvigar([0, 1.2]), null); // odd ≤ 1 é inválida
// odds inválidas no meio não quebram: sobram 2 lados válidos
const parcial = desvigar([1.8, null, 2.1]);
assert.ok(parcial && parcial.oddsJustas.length === 3);
assert.strictEqual(parcial.oddsJustas[1], null);

// devolver só metade da comissão (regra do Pronostic.io)
const meio = desvigar([1.9, 3.4, 4.2], 0.5);
assert.ok(meio.oddsJustas[0] < m.oddsJustas[0] && meio.oddsJustas[0] > 1.9, "meia comissão fica entre a casa e a justa plena");

// oddJustaDe com margem conhecida
const j1 = oddJustaDe(2, 0.05);
assert.strictEqual(j1.oddJusta, 2.1);
assert.strictEqual(j1.probJusta, 0.4762);
assert.strictEqual(oddJustaDe(2, null), null);
assert.strictEqual(oddJustaDe(0.5, 0.05), null);

/* ---------------- faixas de risco ---------------- */

assert.strictEqual(FAVORITO_ODD_MIN, 1.25);
assert.strictEqual(FAVORITO_PROB_MIN, 0.55);
assert.strictEqual(VALOR_ODD_MIN, 1.75);
assert.strictEqual(VALOR_ODD_MAX, 2.9);
assert.strictEqual(BOMBA_PROB_MIN, 0.25);

assert.strictEqual(faixaRisco(1.4, 0.7), "favorito"); // odd baixa + prob alta
assert.strictEqual(faixaRisco(1.25, 0.6), "favorito"); // borda
assert.strictEqual(faixaRisco(1.4, 0.5), null); // prob insuficiente para Favorito
assert.strictEqual(faixaRisco(1.2, 0.9), null); // abaixo da odd mínima
assert.strictEqual(faixaRisco(1.75, 0.4), "valor"); // janela de Valor (não exige prob)
assert.strictEqual(faixaRisco(2.5, 0.66), "valor");
assert.strictEqual(faixaRisco(2.9, 0.5), "valor"); // borda superior do Valor
assert.strictEqual(faixaRisco(2.91, 0.5), "bomba");
assert.strictEqual(faixaRisco(4.5, 0.3), "bomba");
assert.strictEqual(faixaRisco(4.5, 0.2), null); // Bomba exige prob > 25%
// prioridade por odd: odd de Bomba com prob alta continua Bomba
assert.strictEqual(faixaRisco(3.5, 0.8), "bomba");
assert.strictEqual(faixaRisco(NaN, 0.5), null);

/* ---------------- integração no motor ---------------- */

const meta = {
  matchId: "1",
  league: "bra.1",
  leagueName: "Brasileirão",
  country: "BRA",
  kickoff: "2026-11-19T23:30:00Z",
  estado: "Agendado",
  state: "pre",
  home: { id: "1", name: "Casa", logo: "" },
  away: { id: "2", name: "Fora", logo: "" },
};

const op = avaliarOportunidades({
  meta,
  probs: { home: 0.7, draw: 0.15, away: 0.15, over25: 0.6, under25: 0.4, btts: 0.6 },
  odds: { home: 1.6, draw: 4.2, away: 5.5, over: 1.85, under: 1.95, ou: 2.5, btts: 1.7 },
  confianca: "alta",
  fonteOdd: "teste",
  minProb: 0.55,
  oddMin: 1.3,
  oddMax: 4,
});

const casa = op.find((o) => o.mercado === "home");
assert.ok(casa, "deve emitir a vitória da casa");
// margem do 1X2: 1/1.6 + 1/4.2 + 1/5.5 = 1.0449
assert.strictEqual(r2(casa.margemMercado), 0.04);
assert.strictEqual(casa.oddJusta, +(1.6 * 1.04491).toFixed(3));
assert.ok(casa.probJusta < 1 / 1.6, "prob justa é menor que a implícita bruta");
assert.ok(casa.folgaOddPct < 0, "a casa paga abaixo da justa → folga negativa");
assert.strictEqual(casa.ehValorOdd, false);
assert.strictEqual(casa.faixa, "favorito"); // odd 1.60 e prob 70%

const over = op.find((o) => o.mercado === "over25");
assert.ok(over, "deve emitir o Over 2.5");
assert.strictEqual(r2(over.margemMercado), 0.05); // 1/1.85+1/1.95 = 1.0535
assert.ok(over.oddJusta > 1.85);
assert.strictEqual(over.faixa, "valor"); // odd na janela 1.75–2.90

// BTTS não é mercado par → sem odd justa, mas ainda entra no pick
const btts = op.find((o) => o.mercado === "btts");
assert.ok(btts);
assert.strictEqual(btts.oddJusta, null);
assert.strictEqual(btts.margemMercado, null);
assert.strictEqual(btts.folgaOddPct, null);
assert.strictEqual(btts.faixa, "favorito"); // odd 1.70 ≥ 1.25 e prob 60% > 55%

// sem odds → nada
assert.deepStrictEqual(avaliarOportunidades({ meta, probs: { home: 0.5, draw: 0.2, away: 0.3, over25: 0.5, under25: 0.5, btts: 0.5 }, odds: null, confianca: "baixa", fonteOdd: "x" }), []);

console.log(
  `✅ valueBet ok — 1X2 margem ${(casa.margemMercado * 100).toFixed(1)}% · casa ${casa.odd.toFixed(2)}→justa ${casa.oddJusta.toFixed(2)} · faixas ${casa.faixa}/${over.faixa}/bomba`,
);
