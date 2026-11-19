const assert = require("assert");
const {
  decidirAcesso,
  motivoBloqueio,
  TRIAL_HORAS,
  MAX_CONTAS_POR_IP,
  EXPIRA_VITALICIO,
} = require("./trialPolicy.js");

// Dono: sempre owner/vip vitalício, mesmo com device/IP já usados.
const owner = decidirAcesso({ isOwner: true, reusado: true, contasNoIp: 99 });
assert.strictEqual(owner.role, "owner");
assert.strictEqual(owner.plan, "vip");
assert.strictEqual(owner.expiresAt.getTime(), EXPIRA_VITALICIO.getTime());
assert.strictEqual(motivoBloqueio({ isOwner: true, reusado: true, contasNoIp: 99 }), null);

// device_id repetido = bloqueio imediato (primário).
const reusado = decidirAcesso({ isOwner: false, reusado: true, contasNoIp: 0 });
assert.strictEqual(reusado.role, "user");
assert.strictEqual(reusado.plan, "free");
assert.strictEqual(reusado.expiresAt, null);
assert.strictEqual(motivoBloqueio({ isOwner: false, reusado: true }), "device");

// IP tolerante: 1ª, 2ª e 3ª conta no mesmo IP (0, 1 e 2 anteriores).
const agora = new Date("2025-01-01T00:00:00.000Z");
for (const contasNoIp of [0, 1]) {
  const novo = decidirAcesso({ isOwner: false, reusado: false, contasNoIp, agora });
  assert.strictEqual(novo.plan, "vip", `conta ${contasNoIp + 1} no IP deve ser vip`);
  assert.strictEqual(novo.expiresAt.toISOString(), "2025-01-02T00:00:00.000Z");
  assert.strictEqual(motivoBloqueio({ isOwner: false, reusado: false, contasNoIp }), null);
}

// 4ª conta no mesmo IP (3 anteriores) e 3ª conta (2 anteriores) → free.
for (const contasNoIp of [2, 3]) {
  const bloq = decidirAcesso({ isOwner: false, reusado: false, contasNoIp, agora });
  assert.strictEqual(bloq.plan, "free", `${contasNoIp} contas no IP → free`);
  assert.strictEqual(bloq.expiresAt, null);
  assert.strictEqual(motivoBloqueio({ isOwner: false, reusado: false, contasNoIp }), "ip");
}

assert.strictEqual(TRIAL_HORAS, 24);
assert.strictEqual(MAX_CONTAS_POR_IP, 2);

console.log("trialPolicy ok");