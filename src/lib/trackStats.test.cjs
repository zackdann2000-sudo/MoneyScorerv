const assert = require("assert");
const { calcularStats } = require("./trackStats.js");

// 3 liquidadas (2 green, 1 red) + 1 pendente
const rows = [
  { status: "green", stake: 0.05, odd: 1.85 }, // +4.25 u
  { status: "green", stake: 0.025, odd: 2.1 }, // +2.75 u
  { status: "red", stake: 0.05, odd: 1.6 }, //   -5.00 u
  { status: "pendente", stake: 0.03, odd: 2.0 }, // não conta
];

const s = calcularStats(rows);
assert.strictEqual(s.total, 4);
assert.strictEqual(s.pendentes, 1);
assert.strictEqual(s.greens, 2);
assert.strictEqual(s.reds, 1);
assert.ok(Math.abs(s.hitRate - 66.6666666) < 1e-6, "hit rate 2/3");
assert.ok(Math.abs(s.unidades - 2.0) < 1e-9, "unidades +2.00");
assert.ok(Math.abs(s.stakeTotal - 12.5) < 1e-9, "stake total 12.5");
assert.ok(Math.abs(s.roi - 16.0) < 1e-9, "ROI 16%");

// Vazio → sem divisão por zero
const vazio = calcularStats([]);
assert.strictEqual(vazio.total, 0);
assert.strictEqual(vazio.hitRate, null);
assert.strictEqual(vazio.roi, null);
assert.strictEqual(vazio.unidades, 0);

// Só pendentes → nada liquidado
const pend = calcularStats([{ status: "pendente", stake: 0.05, odd: 1.9 }]);
assert.strictEqual(pend.hitRate, null);
assert.strictEqual(pend.unidades, 0);
assert.strictEqual(pend.pendentes, 1);

console.log("trackStats ok");