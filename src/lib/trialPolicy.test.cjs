const assert = require("assert");
const { decidirAcesso, TRIAL_HORAS, EXPIRA_VITALICIO } = require("./trialPolicy.js");

// Dono: sempre owner/vip vitalício, mesmo se o device já foi usado.
const owner = decidirAcesso({ isOwner: true, reusado: true });
assert.strictEqual(owner.role, "owner");
assert.strictEqual(owner.plan, "vip");
assert.strictEqual(owner.expiresAt.getTime(), EXPIRA_VITALICIO.getTime());

// Device/IP já usado: free, sem expiração, sem bônus.
const reusado = decidirAcesso({ isOwner: false, reusado: true });
assert.strictEqual(reusado.role, "user");
assert.strictEqual(reusado.plan, "free");
assert.strictEqual(reusado.expiresAt, null);

// Primeiro uso: vip por exatamente 24h.
const agora = new Date("2025-01-01T00:00:00.000Z");
const novo = decidirAcesso({ isOwner: false, reusado: false, agora });
assert.strictEqual(novo.role, "user");
assert.strictEqual(novo.plan, "vip");
assert.strictEqual(novo.expiresAt.toISOString(), "2025-01-02T00:00:00.000Z");
assert.strictEqual(TRIAL_HORAS, 24);

console.log("trialPolicy ok");
