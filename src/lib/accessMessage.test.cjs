const assert = require("assert");
const { mensagemAcesso } = require("./accessMessage.js");

const agora = new Date("2025-01-02T12:00:00.000Z");

// Owner/admin: vitalício
assert.strictEqual(
  mensagemAcesso({ isAdmin: true, accessActive: true, expiresAt: "2099-12-31T00:00:00.000Z" }, agora),
  "Você tem acesso vitalício a todas as análises e estatísticas.",
);

// Trial ativo: mostra data/hora de término
const ativo = mensagemAcesso({ isAdmin: false, accessActive: true, expiresAt: "2025-01-03T10:00:00.000Z" }, agora);
assert.ok(/^Seu período VIP de 24h termina em \d{2}\/\d{2}, \d{2}:\d{2}$/.test(ativo), ativo);
// 2025-01-03T10:00 UTC = 03/01, 07:00 em Brasília
assert.ok(ativo.includes("03/01, 07:00"), ativo);

// Expirado (accessActive já falso no servidor)
assert.strictEqual(
  mensagemAcesso({ isAdmin: false, accessActive: false, expiresAt: "2025-01-02T11:00:00.000Z" }, agora),
  "Seu período de teste expirou. Faça upgrade para ver as oportunidades.",
);

// Sem expiresAt (free)
assert.strictEqual(
  mensagemAcesso({ isAdmin: false, accessActive: false, expiresAt: null }, agora),
  "Seu período de teste expirou. Faça upgrade para ver as oportunidades.",
);

// Data no futuro mas flag inativa (ex.: bloqueio manual) → tratado como expirado
assert.strictEqual(
  mensagemAcesso({ isAdmin: false, accessActive: false, expiresAt: "2025-02-01T00:00:00.000Z" }, agora),
  "Seu período de teste expirou. Faça upgrade para ver as oportunidades.",
);

// Relógio local já passou do expiresAt mesmo com flag ativa (cache antiga)
assert.strictEqual(
  mensagemAcesso({ isAdmin: false, accessActive: true, expiresAt: "2025-01-02T11:59:00.000Z" }, agora),
  "Seu período de teste expirou. Faça upgrade para ver as oportunidades.",
);

console.log("accessMessage ok");