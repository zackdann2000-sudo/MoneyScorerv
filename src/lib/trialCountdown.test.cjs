const assert = require("assert");
const { formatarRestante, chaveToastExpiracao } = require("./trialCountdown.js");

const agora = new Date("2025-01-01T00:00:00.000Z").getTime();
const emMin = (m) => new Date(agora + m * 60000).toISOString();

// 23h 59m — o caso do exemplo do produto
let r = formatarRestante(emMin(23 * 60 + 59), agora);
assert.strictEqual(r.texto, "23h 59m");
assert.strictEqual(r.expirado, false);

// 24h exatas
r = formatarRestante(emMin(24 * 60), agora);
assert.strictEqual(r.texto, "24h 00m");

// 1 minuto
r = formatarRestante(emMin(1), agora);
assert.strictEqual(r.texto, "0h 01m");

// 10 segundos restantes ainda contam como 0h 00m, mas NÃO expirado
r = formatarRestante(new Date(agora + 10000).toISOString(), agora);
assert.strictEqual(r.texto, "0h 00m");
assert.strictEqual(r.expirado, false);

// exatamente agora → expirado
r = formatarRestante(new Date(agora).toISOString(), agora);
assert.strictEqual(r.expirado, true);
assert.strictEqual(r.texto, "0h 00m");

// no passado → expirado, nunca negativo
r = formatarRestante(new Date(agora - 5 * 3600 * 1000).toISOString(), agora);
assert.strictEqual(r.expirado, true);
assert.strictEqual(r.texto, "0h 00m");
assert.ok(r.ms < 0);

// chave do toast: muda por usuário e por expiração
assert.strictEqual(
  chaveToastExpiracao(7, "2025-01-02T00:00:00.000Z"),
  "gs_trial_toast_7_2025-01-02T00:00:00.000Z",
);
assert.notStrictEqual(
  chaveToastExpiracao(7, "2025-01-02T00:00:00.000Z"),
  chaveToastExpiracao(7, "2025-02-02T00:00:00.000Z"),
);
assert.notStrictEqual(
  chaveToastExpiracao(7, "2025-01-02T00:00:00.000Z"),
  chaveToastExpiracao(8, "2025-01-02T00:00:00.000Z"),
);

console.log("trialCountdown ok");