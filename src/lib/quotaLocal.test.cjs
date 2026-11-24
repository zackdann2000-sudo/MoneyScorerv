const assert = require("assert");
const { diaBrasilia, chaveQuota, matchIdDeCaminho } = require("./quotaLocal.js");

// dia no fuso de Brasília (UTC-3)
assert.strictEqual(diaBrasilia(new Date("2026-11-23T12:00:00.000Z")), "2026-11-23");
// 02:00 UTC do dia 24 = 23:00 de Brasília do dia 23 (não pode virar o dia antes da hora)
assert.strictEqual(diaBrasilia(new Date("2026-11-24T02:00:00.000Z")), "2026-11-23");
// 03:00 UTC do dia 24 = 00:00 de Brasília → dia novo
assert.strictEqual(diaBrasilia(new Date("2026-11-24T03:00:00.000Z")), "2026-11-24");

assert.strictEqual(chaveQuota("abc", "2026-11-23"), "gs_q_2026-11-23_abc");

// caminho da partida
assert.strictEqual(matchIdDeCaminho("/jogos/12345"), "12345");
assert.strictEqual(matchIdDeCaminho("/jogos/12345?tab=ia&league=bra.1"), "12345");
assert.strictEqual(matchIdDeCaminho("/jogos/12345/resumo"), "12345");
// não confundir com a lista nem com outras rotas
assert.strictEqual(matchIdDeCaminho("/jogos"), null);
assert.strictEqual(matchIdDeCaminho("/jogos/"), null);
assert.strictEqual(matchIdDeCaminho("/edge"), null);
assert.strictEqual(matchIdDeCaminho("/x/jogos/1"), null);

console.log("quotaLocal ok");
