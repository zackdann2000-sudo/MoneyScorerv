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

// IP binário: 1 trial por IP. A primeira conta do IP ganha, a segunda não.
const agora = new Date("2025-01-01T00:00:00.000Z");
{
  const novo = decidirAcesso({ isOwner: false, reusado: false, contasNoIp: 0, agora });
  assert.strictEqual(novo.plan, "vip", "1ª conta no IP deve ser vip");
  assert.strictEqual(novo.expiresAt.toISOString(), "2025-01-02T00:00:00.000Z", "trial de 1 dia exato");
  assert.strictEqual(motivoBloqueio({ isOwner: false, reusado: false, contasNoIp: 0 }), null);
}

// Qualquer conta a partir da segunda no mesmo IP → free (sem bloquear o cadastro).
for (const contasNoIp of [1, 2, 3]) {
  const bloq = decidirAcesso({ isOwner: false, reusado: false, contasNoIp, agora });
  assert.strictEqual(bloq.plan, "free", `${contasNoIp} conta(s) no IP → free`);
  assert.strictEqual(bloq.expiresAt, null);
  assert.strictEqual(bloq.role, "user", "conta é criada como user, não recusada");
  assert.strictEqual(motivoBloqueio({ isOwner: false, reusado: false, contasNoIp }), "ip");
}

// device vence o IP como motivo (o primário explica o bloqueio).
assert.strictEqual(motivoBloqueio({ isOwner: false, reusado: true, contasNoIp: 5 }), "device");

assert.strictEqual(TRIAL_HORAS, 24);
assert.strictEqual(MAX_CONTAS_POR_IP, 1);

console.log("trialPolicy ok");