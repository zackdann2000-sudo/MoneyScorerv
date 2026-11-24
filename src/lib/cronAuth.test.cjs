const assert = require("assert");
const { iguaisSeguro, motivoCronAutorizado, cronConfigurado, respostaNaoAutorizado } = require("./cronAuth.js");

function fakeReq({ headers = {}, query = {} } = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    headers: { get: (k) => h[String(k).toLowerCase()] ?? null },
    nextUrl: { searchParams: new URLSearchParams(query) },
  };
}

// comparação em tempo constante
assert.strictEqual(iguaisSeguro("abc", "abc"), true);
assert.strictEqual(iguaisSeguro("abc", "abd"), false);
assert.strictEqual(iguaisSeguro("abc", "abcd"), false);

// --- fonte única: só CRON_SECRET -------------------------------------------
process.env.CRON_SECRET = "cron-s3gredo";
// Env "legada" presente NÃO pode ser aceita: é exatamente esse fallback que
// fazia a rota autenticar com um nome que ninguém tinha configurado na Vercel.
process.env.PUSH_CRON_SECRET = "push-s3gredo";

assert.strictEqual(cronConfigurado(), true);

// Vercel Cron: Authorization: Bearer CRON_SECRET
assert.strictEqual(motivoCronAutorizado(fakeReq({ headers: { authorization: "Bearer cron-s3gredo" } })), "cron");
assert.strictEqual(motivoCronAutorizado(fakeReq({ headers: { authorization: "Bearer errado" } })), null);

// Manual: header x-cron-secret e ?secret= comparam com o MESMO CRON_SECRET
assert.strictEqual(motivoCronAutorizado(fakeReq({ headers: { "x-cron-secret": "cron-s3gredo" } })), "segredo");
assert.strictEqual(motivoCronAutorizado(fakeReq({ query: { secret: "cron-s3gredo" } })), "segredo");
assert.strictEqual(motivoCronAutorizado(fakeReq({ query: { secret: "nope" } })), null);

// O segredo legado (PUSH_CRON_SECRET) não abre mais nada, por nenhum caminho.
assert.strictEqual(motivoCronAutorizado(fakeReq({ headers: { "x-cron-secret": "push-s3gredo" } })), null);
assert.strictEqual(motivoCronAutorizado(fakeReq({ query: { secret: "push-s3gredo" } })), null);
assert.strictEqual(motivoCronAutorizado(fakeReq({ headers: { authorization: "Bearer push-s3gredo" } })), null);

// CRON_SECRET vazia não vale como segredo (fail-closed, não "senha em branco")
process.env.CRON_SECRET = "   ";
assert.strictEqual(cronConfigurado(), false);
assert.strictEqual(motivoCronAutorizado(fakeReq({ query: { secret: "   " } })), null);
assert.strictEqual(motivoCronAutorizado(fakeReq({ headers: { authorization: "Bearer " } })), null);

// --- sem nenhum segredo configurado → falha fechada ------------------------
delete process.env.CRON_SECRET;
delete process.env.PUSH_CRON_SECRET;
assert.strictEqual(cronConfigurado(), false);
assert.strictEqual(motivoCronAutorizado(fakeReq({ headers: { "x-cron-secret": "qualquer" } })), null);

// 503 (não 401) quando não há segredo: a rota avisa "configure a env".
const semSegredo = respostaNaoAutorizado();
assert.strictEqual(semSegredo.status, 503);
assert.ok(/CRON_SECRET/.test(semSegredo.body.error), "a mensagem deve citar CRON_SECRET");

// 401 (não 503) quando o segredo existe e o pedido não provou.
process.env.CRON_SECRET = "cron-s3gredo";
const comSegredo = respostaNaoAutorizado();
assert.strictEqual(comSegredo.status, 401);
assert.ok(!/CRON_SECRET/.test(comSegredo.body.error), "não vaza nome/valor de env no 401");

console.log("cronAuth ok");
