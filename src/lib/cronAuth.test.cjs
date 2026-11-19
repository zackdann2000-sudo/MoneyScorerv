const assert = require("assert");
const { iguaisSeguro, motivoCronAutorizado, cronConfigurado } = require("./cronAuth.js");

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

// Vercel Cron: Authorization: Bearer CRON_SECRET
process.env.CRON_SECRET = "cron-s3gredo";
process.env.PUSH_CRON_SECRET = "push-s3gredo";
assert.strictEqual(cronConfigurado("PUSH_CRON_SECRET"), true);
assert.strictEqual(
  motivoCronAutorizado(fakeReq({ headers: { authorization: "Bearer cron-s3gredo" } }), "PUSH_CRON_SECRET"),
  "cron",
);
assert.strictEqual(
  motivoCronAutorizado(fakeReq({ headers: { authorization: "Bearer errado" } }), "PUSH_CRON_SECRET"),
  null,
);

// Manual: header x-cron-secret e ?secret=
assert.strictEqual(
  motivoCronAutorizado(fakeReq({ headers: { "x-cron-secret": "push-s3gredo" } }), "PUSH_CRON_SECRET"),
  "segredo",
);
assert.strictEqual(
  motivoCronAutorizado(fakeReq({ query: { secret: "push-s3gredo" } }), "PUSH_CRON_SECRET"),
  "segredo",
);
assert.strictEqual(motivoCronAutorizado(fakeReq({ query: { secret: "nope" } }), "PUSH_CRON_SECRET"), null);

// sem nenhum segredo configurado → falha fechada
delete process.env.CRON_SECRET;
delete process.env.PUSH_CRON_SECRET;
assert.strictEqual(cronConfigurado("PUSH_CRON_SECRET"), false);
assert.strictEqual(
  motivoCronAutorizado(fakeReq({ headers: { "x-cron-secret": "qualquer" } }), "PUSH_CRON_SECRET"),
  null,
);

console.log("cronAuth ok");
