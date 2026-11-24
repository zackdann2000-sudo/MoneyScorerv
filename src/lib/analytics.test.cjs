/**
 * Teste dos eventos de funil (src/lib/analytics.ts).
 *
 * O que importa aqui não é "o GA recebeu" — é que analytics NUNCA quebre a
 * página (sem window, sem gtag, storage bloqueado) e que `purchase` não conte
 * duas vezes no mesmo refresh.
 *
 * Rodar:
 *   ./scripts/unit-tests.sh analytics
 */
const { track, trackOnce, analiticaAtiva } = require("./analytics.js");

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) console.log(`✅ ${nome}`);
  else {
    falhas++;
    console.log(`❌ ${nome}${detalhe ? `\n   ${detalhe}` : ""}`);
  }
}

// ------------------------------------------------- sem window (SSR/Node)
ok("sem window: track devolve false", track("sign_up") === false);
ok("sem window: trackOnce devolve false", trackOnce("purchase", "k1") === false);
ok("sem window: analiticaAtiva é false", analiticaAtiva() === false);

// ------------------------------------------------------ com gtag de mentira
const chamadas = [];
global.window = {
  gtag: (comando, nome, params) => chamadas.push({ comando, nome, params }),
};

ok("com gtag: analiticaAtiva é true", analiticaAtiva() === true);
ok("track devolve true", track("sign_up", { method: "email" }) === true);
ok(
  "evento chega com nome e parâmetros",
  chamadas[0]?.comando === "event" &&
    chamadas[0]?.nome === "sign_up" &&
    chamadas[0]?.params?.method === "email",
  JSON.stringify(chamadas[0]),
);

ok("track sem parâmetros não injeta undefined", track("page_view") === true);
ok(
  "parâmetros ausentes viram objeto vazio",
  JSON.stringify(chamadas[chamadas.length - 1]?.params) === "{}",
  JSON.stringify(chamadas[chamadas.length - 1]),
);

// ------------------------------------------- gtag que lança não derruba nada
global.window = {
  gtag: () => {
    throw new Error("gtag explodiu");
  },
};
ok("gtag que lança: track devolve false e não propaga", track("purchase") === false);

// ------------------------------------------------------------- dedupe
const store = new Map();
global.window = {
  gtag: (comando, nome, params) => chamadas.push({ comando, nome, params }),
  sessionStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  },
};
const antes = chamadas.length;
ok("trackOnce dispara na primeira vez", trackOnce("purchase", "stripe_sucesso") === true);
ok("trackOnce não dispara de novo", trackOnce("purchase", "stripe_sucesso") === false);
ok("trackOnce gravou só um evento", chamadas.length === antes + 1, `enviados=${chamadas.length - antes}`);
ok("chave diferente dispara de novo", trackOnce("purchase", "outro_pagamento") === true);

// ------------------------------------- storage bloqueado: dispara, não duplica erro
global.window = {
  gtag: (comando, nome, params) => chamadas.push({ comando, nome, params }),
  sessionStorage: {
    getItem: () => {
      throw new Error("storage bloqueado");
    },
    setItem: () => {
      throw new Error("storage bloqueado");
    },
  },
};
ok("storage bloqueado: trackOnce ainda dispara", trackOnce("sign_up", "k9") === true);

// ------------------------------------------------------------ sem gtag
global.window = {};
ok("window sem gtag: track é false", track("sign_up") === false);
ok("window sem gtag: analiticaAtiva é false", analiticaAtiva() === false);

console.log("");
if (falhas) {
  console.error(`❌ ${falhas} asserção(ões) falharam`);
  process.exit(1);
}
console.log("✅ analytics: todas as asserções passaram");
