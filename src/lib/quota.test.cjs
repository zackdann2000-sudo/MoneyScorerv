/* Quota diária: limites por plano e virada de dia na leitura. */
const assert = require("assert");
const { estadoQuota, planoDeQuota, textoQuota, QUOTA_POR_PLANO } = require("./quota.js");

const hoje = "2026-03-10";

// Limites do produto (a regra que substitui o trial de 24h).
assert.deepStrictEqual(QUOTA_POR_PLANO, { free: 1, starter: 6, pro: 20, expert: 999 });

// free: 0 usados -> pode 1; 1 usado -> esgotada.
let e = estadoQuota({ plan: "free", usado: 0, dia: hoje, hoje });
assert.strictEqual(e.limite, 1);
assert.strictEqual(e.restante, 1);
assert.strictEqual(e.esgotada, false);

e = estadoQuota({ plan: "free", usado: 1, dia: hoje, hoje });
assert.strictEqual(e.restante, 0);
assert.strictEqual(e.esgotada, true);

// Virada de dia: contador gravado ontem não conta hoje (sem cron de reset).
e = estadoQuota({ plan: "free", usado: 1, dia: "2026-03-09", hoje });
assert.strictEqual(e.usado, 0);
assert.strictEqual(e.esgotada, false);
assert.strictEqual(e.dia, hoje);

// Conta nova (dia vazio) começa do zero.
e = estadoQuota({ plan: "free", usado: 0, dia: "", hoje });
assert.strictEqual(e.usado, 0);

// starter 6 / pro 20 no meio do dia.
assert.strictEqual(estadoQuota({ plan: "starter", usado: 3, dia: hoje, hoje }).restante, 3);
assert.strictEqual(estadoQuota({ plan: "pro", usado: 19, dia: hoje, hoje }).esgotada, false);
assert.strictEqual(estadoQuota({ plan: "pro", usado: 20, dia: hoje, hoje }).esgotada, true);

// expert e vip nunca esgotam, mesmo com usado alto.
assert.strictEqual(estadoQuota({ plan: "expert", usado: 9999, dia: hoje, hoje }).esgotada, false);
assert.strictEqual(estadoQuota({ plan: "vip", usado: 9999, dia: hoje, hoje }).ilimitada, true);

// admin (ilimitada) ignora o plano.
assert.strictEqual(estadoQuota({ plan: "free", usado: 50, dia: hoje, hoje, ilimitada: true }).esgotada, false);

// Limite gravado na linha vence o do plano (promo/manual), mas nunca abaixo de 1.
assert.strictEqual(estadoQuota({ plan: "free", dailyQuota: 3, usado: 2, dia: hoje, hoje }).restante, 1);
assert.strictEqual(estadoQuota({ plan: "free", dailyQuota: 0, usado: 0, dia: hoje, hoje }).limite, 1);

// Normalização dos planos legados.
assert.strictEqual(planoDeQuota("trial"), "free");
assert.strictEqual(planoDeQuota("vip"), "expert");
assert.strictEqual(planoDeQuota(null), "free");
assert.strictEqual(planoDeQuota("pro"), "pro");

// Texto do badge.
assert.strictEqual(textoQuota(estadoQuota({ plan: "starter", usado: 2, dia: hoje, hoje })), "2 de 6 hoje");
assert.strictEqual(textoQuota(estadoQuota({ plan: "expert", usado: 1, dia: hoje, hoje })), "Ilimitado");

console.log("quota OK");
