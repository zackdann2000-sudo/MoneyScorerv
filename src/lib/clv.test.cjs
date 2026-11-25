/**
 * Testes da matemática de CLV e faixas de odd.
 *
 * Roda sem rede e sem banco (é o padrão da pasta: `./scripts/unit-tests.sh clv`).
 */
const assert = require("node:assert/strict");
const { clvPct, faixaDaOdd, agruparPorFaixa, FAIXAS_ODD } = require("./clv.js");

let ok = 0;
const t = (nome, fn) => {
  try {
    fn();
    ok++;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    console.error(`  ✗ ${nome}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

console.log("clvPct");

t("odd fechou abaixo da abertura → CLV positivo", () => {
  // 2.05 → 1.92: pegamos 2.05 e o mercado fechou 1.92 (mais provável).
  assert.equal(clvPct(2.05, 1.92), 6.77);
});

t("odd fechou acima da abertura → CLV negativo", () => {
  assert.equal(clvPct(1.8, 2.0), -10);
});

t("abertura igual ao fechamento → 0", () => {
  assert.equal(clvPct(1.5, 1.5), 0);
});

t("qualquer ponta ausente → null (nunca 'aproximado')", () => {
  assert.equal(clvPct(null, 1.9), null);
  assert.equal(clvPct(1.9, null), null);
  assert.equal(clvPct(undefined, undefined), null);
});

t("odd inválida (≤ 1) → null", () => {
  assert.equal(clvPct(1, 1.9), null);
  assert.equal(clvPct(1.9, 1.0), null);
  assert.equal(clvPct(0.5, 1.9), null);
});

t("NaN / Infinity → null", () => {
  assert.equal(clvPct(NaN, 1.9), null);
  assert.equal(clvPct(1.9, Infinity), null);
});

console.log("faixaDaOdd");

t("limites: 1.20 fecha a faixa de baixo, 1.50 abre a de cima", () => {
  assert.equal(faixaDaOdd(1.2).key, "1.20-1.50");
  assert.equal(faixaDaOdd(1.49).key, "1.20-1.50");
  assert.equal(faixaDaOdd(1.5).key, "1.50-2.00");
  assert.equal(faixaDaOdd(1.99).key, "1.50-2.00");
  assert.equal(faixaDaOdd(2.0).key, "2.00-3.00");
  assert.equal(faixaDaOdd(2.99).key, "2.00-3.00");
  assert.equal(faixaDaOdd(3.0).key, "3.00+");
  assert.equal(faixaDaOdd(9.5).key, "3.00+");
});

t("abaixo de 1.20 cai na faixa de baixo, não some", () => {
  assert.equal(faixaDaOdd(1.05).key, "min");
});

t("odd inválida → null", () => {
  assert.equal(faixaDaOdd(1), null);
  assert.equal(faixaDaOdd(null), null);
  assert.equal(faixaDaOdd(NaN), null);
});

console.log("agruparPorFaixa");

t("acerto, ROI e lucro por faixa (stake 1 unidade)", () => {
  const r = agruparPorFaixa([
    { odd: 1.3, status: "green", clvPct: 2 },      // +0.30
    { odd: 1.4, status: "red", clvPct: -1 },       // -1.00
    { odd: 1.8, status: "green", clvPct: 4 },      // +0.80
    { odd: 2.5, status: "green", clvPct: null },   // +1.50
  ]);
  const baixa = r.faixas.find((f) => f.key === "1.20-1.50");
  const media = r.faixas.find((f) => f.key === "1.50-2.00");
  const alta = r.faixas.find((f) => f.key === "2.00-3.00");
  assert.equal(baixa.liquidadas, 2);
  assert.equal(baixa.acerto, 50);
  assert.equal(baixa.lucro, -0.7);
  assert.equal(baixa.roi, -35);
  assert.equal(media.liquidadas, 1);
  assert.equal(media.roi, 80);
  assert.equal(alta.liquidadas, 1);
  assert.equal(alta.roi, 150);
});

t("CLV médio usa só quem tem as duas pontas", () => {
  const r = agruparPorFaixa([
    { odd: 1.3, status: "green", clvPct: 2 },
    { odd: 1.4, status: "green", clvPct: 4 },
    { odd: 1.45, status: "green", clvPct: null },
  ]);
  const baixa = r.faixas.find((f) => f.key === "1.20-1.50");
  assert.equal(baixa.comClv, 2);
  assert.equal(baixa.clvMedio, 3);
  assert.equal(baixa.clvPositivoPct, 100);
  assert.equal(r.total.comClv, 2);
  assert.equal(r.total.clvMedio, 3);
});

t("pendente não entra em acerto nem em ROI", () => {
  const r = agruparPorFaixa([
    { odd: 1.6, status: "pendente", clvPct: null },
    { odd: 1.6, status: "green", clvPct: 1 },
  ]);
  const f = r.faixas.find((x) => x.key === "1.50-2.00");
  assert.equal(f.liquidadas, 1);
  assert.equal(f.acerto, 100);
  assert.equal(f.roi, 60);
});

t("sem liquidada → acerto/ROI null (a tela mostra '—', nunca 0%)", () => {
  const r = agruparPorFaixa([{ odd: 2.2, status: "pendente", clvPct: 3 }]);
  const f = r.faixas.find((x) => x.key === "2.00-3.00");
  assert.equal(f.acerto, null);
  assert.equal(f.roi, null);
  assert.equal(f.comClv, 1, "CLV de pick pendente ainda conta como amostra");
  assert.equal(r.total.acerto, null);
  assert.equal(r.total.roi, null);
});

t("odd ausente é contada em semOdd e não cria faixa fantasma", () => {
  const r = agruparPorFaixa([
    { odd: null, status: "green", clvPct: null },
    { odd: 0, status: "red", clvPct: null },
  ]);
  assert.equal(r.semOdd, 2);
  assert.equal(r.total.liquidadas, 0);
  assert.equal(r.faixas.length, FAIXAS_ODD.length);
});

t("CLV total é a média ponderada, não a média das médias", () => {
  const r = agruparPorFaixa([
    { odd: 1.3, status: "green", clvPct: 10 },
    { odd: 1.3, status: "green", clvPct: 10 },
    { odd: 1.3, status: "green", clvPct: 10 },
    { odd: 2.5, status: "green", clvPct: -10 },
  ]);
  // (10*3 + (-10)*1) / 4 = 5 — e não (10 + -10)/2 = 0
  assert.equal(r.total.clvMedio, 5);
});

if (process.exitCode) {
  console.error("\n❌ clv: falhou");
} else {
  console.log(`\n✅ clv: ${ok} asserções`);
}
