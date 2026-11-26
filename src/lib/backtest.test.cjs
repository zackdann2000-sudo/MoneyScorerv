/**
 * Testes do backtest do ledger (Validador).
 *
 * Roda sem rede e sem banco (padrão da pasta: `./scripts/unit-tests.sh backtest`).
 */
const assert = require("node:assert/strict");
const { rodarBacktest, filtrarPicks, opcoesDoLedger } = require("./backtest.js");

let ok = 0;
const t = (nome, fn) => {
  try {
    fn();
    ok++;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    console.error(`  ✗ ${nome}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

let seq = 0;
/** Pick liquidada. `g: true` = green. */
function pick(p = {}) {
  seq++;
  return {
    id: p.id ?? seq,
    data: p.data ?? "2026-11-20",
    status: p.status ?? (p.g === false ? "red" : "green"),
    odd: p.odd === undefined ? 2 : p.odd,
    leagueName: p.liga ?? "Premier League",
    mercado: p.mercado ?? "over25",
    rotulo: p.rotulo ?? "Over 2.5 gols",
    linha: p.linha ?? null,
    homeName: "A",
    awayName: "B",
  };
}

const AGORA = new Date("2026-11-26T12:00:00Z");

console.log("filtrarPicks");

t("ignora pendente, ao vivo e anulada", () => {
  const r = filtrarPicks(
    [pick(), pick({ status: "pendente" }), pick({ status: "ao_vivo" }), pick({ status: "anulada" })],
    {},
    AGORA,
  );
  assert.equal(r.length, 1);
});

t("ordena por dia do jogo e depois por id", () => {
  const r = filtrarPicks(
    [pick({ data: "2026-11-22", id: 9 }), pick({ data: "2026-11-20", id: 3 }), pick({ data: "2026-11-20", id: 1 })],
    {},
    AGORA,
  );
  assert.deepEqual(r.map((p) => p.id), [1, 3, 9]);
});

t("filtra por liga e por mercado", () => {
  const base = [
    pick({ liga: "Premier League" }),
    pick({ liga: "La Liga" }),
    pick({ liga: "Premier League", mercado: "btts", rotulo: "Ambas marcam" }),
  ];
  assert.equal(filtrarPicks(base, { liga: "Premier League" }, AGORA).length, 2);
  assert.equal(filtrarPicks(base, { liga: "Premier League", mercado: "over25" }, AGORA).length, 1);
  assert.equal(filtrarPicks(base, { liga: "all", mercado: "btts" }, AGORA).length, 1);
});

t("janela de dias usa o dia do JOGO", () => {
  const base = [pick({ data: "2026-10-01" }), pick({ data: "2026-11-25" })];
  const r = filtrarPicks(base, { dias: 30 }, AGORA);
  assert.equal(r.length, 1);
  assert.equal(r[0].data, "2026-11-25");
});

t("janela nula = tudo", () => {
  const base = [pick({ data: "2020-01-01" }), pick({ data: "2026-11-25" })];
  assert.equal(filtrarPicks(base, { dias: null }, AGORA).length, 2);
});

t("data inválida não quebra o filtro", () => {
  const r = filtrarPicks([pick({ data: "" }), pick({ data: "lixo" })], { dias: 30 }, AGORA);
  assert.equal(r.length, 0);
});

console.log("rodarBacktest — dinheiro");

t("7 greens a 2.00 e 3 reds, stake 1u: lucro +4u, banca 104", () => {
  const base = [
    ...Array.from({ length: 7 }, () => pick({ g: true, odd: 2 })),
    ...Array.from({ length: 3 }, () => pick({ g: false, odd: 2 })),
  ];
  const r = rodarBacktest(base, {}, { agora: AGORA });
  assert.equal(r.liquidadas, 10);
  assert.equal(r.lucro, 4);
  assert.equal(r.bancaFinal, 104);
  assert.equal(r.roi, 40);
  assert.equal(r.acerto, 70);
});

t("banca inicial e unidade são configuráveis", () => {
  const base = [pick({ g: true, odd: 3 }), pick({ g: false, odd: 3 })];
  const r = rodarBacktest(base, {}, { bancaInicial: 200, unidade: 2, agora: AGORA });
  // green: 2 × (3−1) = +4 ; red: −2 → lucro 2
  assert.equal(r.lucro, 2);
  assert.equal(r.bancaFinal, 202);
  assert.equal(r.roi, 50); // 2 / (2 × 2) = 50%
});

t("banca inválida cai no padrão 100", () => {
  const r = rodarBacktest([pick()], {}, { bancaInicial: 0, agora: AGORA });
  assert.equal(r.bancaInicial, 100);
});

t("pick sem odd válida fica fora da curva e é contada", () => {
  const base = [pick({ g: true, odd: 2 }), pick({ g: false, odd: 0 }), pick({ g: false, odd: null })];
  const r = rodarBacktest(base, {}, { agora: AGORA });
  assert.equal(r.semOdd, 2);
  assert.equal(r.liquidadas, 3);
  assert.equal(r.lucro, 1); // só o green com odd entrou
  // curva: ponto de partida + 1 pick
  assert.equal(r.curva.length, 2);
});

t("curva começa na banca inicial (i = 0)", () => {
  const r = rodarBacktest([pick({ g: true, odd: 2 })], {}, { bancaInicial: 100, agora: AGORA });
  assert.equal(r.curva[0].i, 0);
  assert.equal(r.curva[0].banca, 100);
  assert.equal(r.curva[0].resultado, "inicio");
  assert.equal(r.curva[1].banca, 101);
  assert.equal(r.curva[1].resultado, "green");
});

console.log("sequências e drawdown");

t("maior sequência de greens e reds", () => {
  const base = [
    pick({ g: true }),
    pick({ g: true }),
    pick({ g: true }),
    pick({ g: false }),
    pick({ g: false }),
    pick({ g: true }),
  ];
  const r = rodarBacktest(base, {}, { agora: AGORA });
  assert.equal(r.maiorSequenciaGreens, 3);
  assert.equal(r.maiorSequenciaReds, 2);
  assert.deepEqual(r.sequenciaAtual, { tipo: "green", n: 1 });
});

t("sequência atual reflete o fim da série", () => {
  const r = rodarBacktest([pick({ g: true }), pick({ g: false }), pick({ g: false })], {}, { agora: AGORA });
  assert.deepEqual(r.sequenciaAtual, { tipo: "red", n: 2 });
});

t("drawdown máximo: do pico 101 até 98 = 3u (2,97% do pico)", () => {
  const base = [
    pick({ g: true, odd: 2 }), // 101
    pick({ g: false }), // 100
    pick({ g: false }), // 99
    pick({ g: false }), // 98
  ];
  const r = rodarBacktest(base, {}, { agora: AGORA });
  assert.equal(r.picoBanca, 101);
  assert.equal(r.bancaFinal, 98);
  assert.equal(r.drawdownMaximo, 3);
  assert.equal(r.drawdownMaximoPct, 3);
  assert.equal(r.curva[r.curva.length - 1].drawdown, -3);
});

t("sem queda, drawdown é 0 e o % fica null (nada inventado)", () => {
  const r = rodarBacktest([pick({ g: true })], {}, { agora: AGORA });
  assert.equal(r.drawdownMaximo, 0);
  assert.equal(r.drawdownMaximoPct, null);
});

console.log("bordas");

t("recorte vazio devolve zeros e curva vazia", () => {
  const r = rodarBacktest([], {}, { agora: AGORA });
  assert.equal(r.liquidadas, 0);
  assert.equal(r.lucro, 0);
  assert.equal(r.bancaFinal, 100);
  assert.equal(r.roi, null);
  assert.equal(r.acerto, null);
  assert.equal(r.oddMedia, null);
  assert.deepEqual(r.curva, []);
  assert.equal(r.primeiro, null);
  assert.equal(r.ultimo, null);
});

t("filtro sem resultado mantém banca inicial", () => {
  const r = rodarBacktest([pick({ liga: "La Liga" })], { liga: "Serie A" }, { agora: AGORA });
  assert.equal(r.liquidadas, 0);
  assert.equal(r.bancaFinal, 100);
});

t("odd média só das picks com odd", () => {
  const r = rodarBacktest([pick({ odd: 1.5 }), pick({ odd: 2.5 }), pick({ odd: 0 })], {}, { agora: AGORA });
  assert.equal(r.oddMedia, 2);
});

t("primeiro e último dia do recorte", () => {
  const r = rodarBacktest(
    [pick({ data: "2026-11-01" }), pick({ data: "2026-11-25" })],
    {},
    { agora: AGORA },
  );
  assert.equal(r.primeiro, "2026-11-01");
  assert.equal(r.ultimo, "2026-11-25");
});

console.log("opcoesDoLedger");

t("lista ligas e mercados com contagem, só de liquidadas", () => {
  const base = [
    pick({ liga: "Premier League" }),
    pick({ liga: "Premier League" }),
    pick({ liga: "La Liga" }),
    pick({ liga: "Serie A", status: "pendente" }),
  ];
  const o = opcoesDoLedger(base);
  assert.equal(o.liquidadas, 3);
  assert.deepEqual(o.ligas.map((l) => l.valor), ["Premier League", "La Liga"]);
  assert.equal(o.ligas[0].picks, 2);
  assert.equal(o.mercados.length, 1);
  assert.equal(o.mercados[0].valor, "over25");
});

t("ledger vazio devolve listas vazias", () => {
  const o = opcoesDoLedger([]);
  assert.deepEqual(o.ligas, []);
  assert.deepEqual(o.mercados, []);
  assert.equal(o.liquidadas, 0);
});

console.log(`\n${ok} asserções verdes`);
