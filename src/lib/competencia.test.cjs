/**
 * Testes da competência do modelo por liga × mercado.
 *
 * Roda sem rede e sem banco (padrão da pasta: `./scripts/unit-tests.sh competencia`).
 */
const assert = require("node:assert/strict");
const {
  agruparCompetencia,
  wilson,
  MIN_AMOSTRA,
  BRIER_REFERENCIA,
  ROTULO_MERCADO,
} = require("./competencia.js");

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

/** Gera N picks liquidadas de um par liga × mercado. */
function lote(n, opts = {}) {
  const { liga = "Premier League", mercado = "over25", green = true, prob = 0.7, odd = 2, status } = opts;
  return Array.from({ length: n }, (_, i) => ({
    leagueName: liga,
    mercado,
    rotulo: ROTULO_MERCADO[mercado],
    linha: null,
    status: status ?? (green ? "green" : "red"),
    probModelo: prob,
    odd,
    __i: i,
  }));
}

console.log("agruparCompetencia — amostra e agrupamento");

t(`amostra mínima é ${MIN_AMOSTRA}`, () => {
  assert.equal(MIN_AMOSTRA, 10);
});

t("abaixo do mínimo o par NÃO vira linha publicada e cai em 'aguardando'", () => {
  const r = agruparCompetencia(lote(9));
  assert.equal(r.linhas.length, 0);
  assert.equal(r.aguardando.length, 1);
  const a = r.aguardando[0];
  assert.equal(a.amostraSuficiente, false);
  assert.equal(a.faltam, 1);
  assert.equal(a.liquidadas, 9);
  // O número pode existir no objeto, mas a tela não publica: o par está retido.
  assert.equal(a.acerto, 100);
});

t("no mínimo exato o par passa a ser publicado", () => {
  const r = agruparCompetencia(lote(MIN_AMOSTRA));
  assert.equal(r.linhas.length, 1);
  assert.equal(r.aguardando.length, 0);
  assert.equal(r.linhas[0].amostraSuficiente, true);
  assert.equal(r.linhas[0].faltam, 0);
});

t("separa ligas diferentes", () => {
  const r = agruparCompetencia([...lote(12, { liga: "Premier League" }), ...lote(12, { liga: "La Liga" })]);
  assert.equal(r.linhas.length, 2);
  assert.deepEqual(r.linhas.map((l) => l.liga).sort(), ["La Liga", "Premier League"]);
});

t("separa mercados diferentes na mesma liga", () => {
  const r = agruparCompetencia([...lote(12, { mercado: "over25" }), ...lote(12, { mercado: "btts" })]);
  assert.equal(r.linhas.length, 2);
  assert.deepEqual(r.linhas.map((l) => l.mercado).sort(), ["btts", "over25"]);
});

t("cartões com linhas diferentes são pares diferentes", () => {
  const base = lote(12, { mercado: "cards_over" });
  const r = agruparCompetencia([
    ...base.map((p) => ({ ...p, linha: 3.5 })),
    ...base.map((p) => ({ ...p, linha: 4.5 })),
  ]);
  assert.equal(r.linhas.length, 2);
  assert.deepEqual(r.linhas.map((l) => l.key.split("||")[2]).sort(), ["3.5", "4.5"]);
});

t("pendente, ao vivo e anulada não entram em nada", () => {
  const r = agruparCompetencia([
    ...lote(10, { green: true }),
    ...lote(5, { status: "pendente" }),
    ...lote(5, { status: "ao_vivo" }),
    ...lote(5, { status: "anulada" }),
  ]);
  assert.equal(r.linhas[0].liquidadas, 10);
  assert.equal(r.total.liquidadas, 10);
  assert.equal(r.total.greens, 10);
});

t("pick sem liga não forma par, mas é contada em semLiga", () => {
  const r = agruparCompetencia([...lote(12), ...lote(3, { liga: "   " })]);
  assert.equal(r.semLiga, 3);
  assert.equal(r.linhas.length, 1);
  assert.equal(r.total.liquidadas, 12);
});

console.log("métricas — acerto, Brier e ROI");

t("acerto = greens / liquidadas, em % com 1 casa", () => {
  const r = agruparCompetencia([...lote(7), ...lote(3, { green: false })]);
  const l = r.linhas[0];
  assert.equal(l.liquidadas, 10);
  assert.equal(l.greens, 7);
  assert.equal(l.reds, 3);
  assert.equal(l.acerto, 70);
});

t("esperado é a probabilidade média publicada (teste de calibração)", () => {
  const r = agruparCompetencia([
    ...lote(5, { prob: 0.6 }),
    ...lote(5, { prob: 0.8 }),
  ]);
  assert.equal(r.linhas[0].esperado, 70);
});

t("Brier: acerto com 70% → 0,09; erro com 70% → 0,49", () => {
  const green = agruparCompetencia(lote(10, { green: true, prob: 0.7 }));
  assert.equal(green.linhas[0].brier, 0.09);
  const red = agruparCompetencia(lote(10, { green: false, prob: 0.7 }));
  assert.equal(red.linhas[0].brier, 0.49);
});

t("Brier médio mistura os dois lados", () => {
  const r = agruparCompetencia([...lote(5, { green: true, prob: 0.7 }), ...lote(5, { green: false, prob: 0.7 })]);
  assert.equal(r.linhas[0].brier, 0.29);
});

t("Brier fica null quando o ledger não tem probabilidade", () => {
  const r = agruparCompetencia(lote(10, { prob: null }));
  assert.equal(r.linhas[0].brier, null);
  assert.equal(r.total.brier, null);
});

t("probModelo em escala 0..100 é normalizada (não vira Brier 4500)", () => {
  const r = agruparCompetencia(lote(10, { green: true, prob: 70 }));
  assert.equal(r.linhas[0].esperado, 70);
  assert.equal(r.linhas[0].brier, 0.09);
});

t("ROI: 7 greens a 2.00 e 3 reds → +40%", () => {
  const r = agruparCompetencia([...lote(7, { odd: 2 }), ...lote(3, { green: false, odd: 2 })]);
  const l = r.linhas[0];
  // 7 × (2 − 1) = +7u ; 3 × −1 = −3u ; lucro 4u sobre 10 apostadas
  assert.equal(l.lucro, 4);
  assert.equal(l.roi, 40);
  assert.equal(l.comOdd, 10);
});

t("ROI ignora pick sem odd válida (nunca inventa 1.00)", () => {
  const r = agruparCompetencia([
    ...lote(10, { odd: 2 }),
    ...lote(10, { green: false, odd: 0 }),
    ...lote(10, { green: false, odd: null }),
  ]);
  const l = r.linhas[0];
  assert.equal(l.liquidadas, 30);
  assert.equal(l.comOdd, 10);
  assert.equal(l.roi, 100); // só os 10 greens a 2.00: 10u / 10 apostadas
  assert.equal(l.lucro, 10);
});

t("odd média só das picks com odd", () => {
  const r = agruparCompetencia([...lote(5, { odd: 1.5 }), ...lote(5, { odd: 2.5 })]);
  assert.equal(r.linhas[0].oddMedia, 2);
});

console.log("agregação e bordas");

t("total soma os pares e conta ligas/mercados distintos", () => {
  const r = agruparCompetencia([
    ...lote(10, { liga: "Premier League", mercado: "over25" }),
    ...lote(10, { liga: "La Liga", mercado: "btts", green: false }),
    ...lote(5, { liga: "Serie A", mercado: "over25" }),
  ]);
  assert.equal(r.total.liquidadas, 25);
  assert.equal(r.total.greens, 15);
  assert.equal(r.total.acerto, 60);
  assert.equal(r.total.ligas, 3);
  assert.equal(r.total.mercados, 2);
  assert.equal(r.total.paresProntos, 2);
  assert.equal(r.total.paresAguardando, 1);
});

t("lista vazia devolve resumo zero sem quebrar", () => {
  const r = agruparCompetencia([]);
  assert.deepEqual(r.linhas, []);
  assert.deepEqual(r.aguardando, []);
  assert.equal(r.total.liquidadas, 0);
  assert.equal(r.total.acerto, null);
  assert.equal(r.total.brier, null);
  assert.equal(r.total.roi, null);
  assert.equal(r.semLiga, 0);
});

t("ordena por amostra, maior primeiro", () => {
  const r = agruparCompetencia([
    ...lote(10, { liga: "Liga A" }),
    ...lote(30, { liga: "Liga B" }),
    ...lote(20, { liga: "Liga C" }),
  ]);
  assert.deepEqual(r.linhas.map((l) => l.liga), ["Liga B", "Liga C", "Liga A"]);
});

t("rótulo do pick é preservado e o mapa cobre os 10 mercados do ledger", () => {
  const r = agruparCompetencia([
    ...lote(10).map((p) => ({ ...p, rotulo: "Over 2.5 gols" })),
  ]);
  assert.equal(r.linhas[0].rotulo, "Over 2.5 gols");
  assert.equal(Object.keys(ROTULO_MERCADO).length, 10);
});

console.log("wilson");

t("intervalo 95% existe com n > 0", () => {
  const w = wilson(7, 10);
  assert.ok(w.low < 0.7 && w.high > 0.7);
  assert.ok(w.low >= 0 && w.high <= 1);
});

t("sem liquidação não existe intervalo", () => {
  assert.equal(wilson(0, 0), null);
});

t("amostra maior estreita o intervalo", () => {
  const pequeno = wilson(7, 10);
  const grande = wilson(70, 100);
  assert.ok(grande.high - grande.low < pequeno.high - pequeno.low);
});

t("Brier de referência é 0,25 (chute 50/50)", () => {
  assert.equal(BRIER_REFERENCIA, 0.25);
});

console.log(`\n${ok} asserções verdes`);
