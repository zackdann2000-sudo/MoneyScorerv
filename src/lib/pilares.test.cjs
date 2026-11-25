const assert = require("assert");
const {
  decomporPilares,
  notaDeFator,
  pesosLog,
  oddDoMercado,
} = require("./pilares.js");
const { runModel, forcasRelativas, HOME_ADV } = require("./model.js");

let seq = 0;
const jogo = (opts) =>
  ({
    id: `g${++seq}`,
    date: opts.date ?? "2026-05-01",
    league: "bra.1",
    home: opts.home ?? true,
    gf: opts.gf,
    ga: opts.ga,
    res: opts.gf > opts.ga ? "V" : opts.gf === opts.ga ? "E" : "D",
    xgEst: opts.xgEst ?? opts.gf,
    oppXgEst: opts.oppXgEst ?? opts.ga,
    xgF: null,
    xgA: null,
    corners: opts.corners ?? 5,
    oppCorners: opts.oppCorners ?? 5,
    yellow: opts.yellow ?? 1,
    red: 0,
    oppYellow: 1,
    fouls: opts.fouls ?? 12,
    oppFouls: 12,
  });

/* 10 jogos de cada lado — a amostra que o modelo usa. */
const casa = [3, 2, 2, 1, 2, 3, 1, 2, 2, 1].map((g) => jogo({ gf: g, ga: 1, home: true }));
const fora = [1, 1, 0, 1, 2, 0, 1, 1, 0, 2].map((g) => jogo({ gf: g, ga: 1, home: false }));

let ok = 0;
const t = (nome, fn) => {
  fn();
  ok++;
  console.log(`  ✓ ${nome}`);
};

console.log("pilares");

/* ---------- 1. nota de fator ---------- */
t("fator neutro (1,00) dá nota 50", () => {
  assert.strictEqual(notaDeFator(1), 50);
});

t("fator acima de 1 sobe a nota, abaixo desce", () => {
  assert.ok(notaDeFator(1.2) > 50, "1,20 deveria ficar acima de 50");
  assert.ok(notaDeFator(0.8) < 50, "0,80 deveria ficar abaixo de 50");
  assert.strictEqual(notaDeFator(3), 100, "satura no topo");
  assert.strictEqual(notaDeFator(0.1), 0, "satura embaixo");
});

t("fator inválido não estoura — cai no neutro", () => {
  assert.strictEqual(notaDeFator(0), 50);
  assert.strictEqual(notaDeFator(-2), 50);
  assert.strictEqual(notaDeFator(NaN), 50);
});

/* ---------- 2. pesos ---------- */
t("pesos log somam 100", () => {
  const p = pesosLog([1.3, 0.8, 1.1]);
  const soma = p.reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(soma - 100) <= 1, `soma ${soma} deveria fechar em 100`);
});

t("todos neutros → sem peso (null), não 0%", () => {
  assert.deepStrictEqual(pesosLog([1, 1, 1]), [null, null, null]);
});

/* ---------- 3. a conta é a mesma do λ ---------- */
t("forcasRelativas reconstroem o λ do modelo", () => {
  const a = runModel("Casa", "Fora", casa, fora, 2.65);
  assert.strictEqual(a.status, "ok");
  const leagueHalf = a.sample.leagueAvg / 2;
  const { atkH, defA } = forcasRelativas(a.rates.home, a.rates.away, leagueHalf);
  const lambda = leagueHalf * atkH * defA * HOME_ADV;
  assert.ok(
    Math.abs(lambda - a.lambdaHome) < 0.02,
    `λ reconstruído ${lambda.toFixed(3)} × modelo ${a.lambdaHome}`,
  );
});

/* ---------- 4. decomposição com dado real ---------- */
t("pilares do λ aparecem com peso e fator", () => {
  const a = runModel("Casa", "Fora", casa, fora, 2.65);
  const d = decomporPilares({
    modelType: a.model_type,
    leagueAvg: a.sample.leagueAvg,
    rates: a.rates,
    h2h: null,
    mercado: { id: "over25", rotulo: "Over 2.5", final: 58, observado: 62 },
  });
  const medias = d.pilares.find((p) => p.id === "medias");
  const matchup = d.pilares.find((p) => p.id === "matchup");
  const contexto = d.pilares.find((p) => p.id === "contexto");
  assert.ok(medias.nota != null && medias.peso != null, "médias precisa de nota e peso");
  assert.ok(matchup.nota != null && matchup.peso != null, "matchup precisa de nota e peso");
  assert.ok(contexto.fator != null, "contexto precisa do fator de mando");
  assert.strictEqual(d.simplificado, false);
  assert.strictEqual(d.score, 58);
});

t("hit rate e value saem sem peso (leitura de apoio)", () => {
  const a = runModel("Casa", "Fora", casa, fora, 2.65);
  const d = decomporPilares({
    modelType: a.model_type,
    leagueAvg: a.sample.leagueAvg,
    rates: a.rates,
    h2h: null,
    mercado: { id: "over25", rotulo: "Over 2.5", final: 58, observado: 62 },
    odd: 2.1,
  });
  const hr = d.pilares.find((p) => p.id === "hitrate");
  const value = d.pilares.find((p) => p.id === "value");
  assert.strictEqual(hr.nota, 62, "nota do hit rate é a taxa observada");
  assert.strictEqual(hr.peso, null, "hit rate não tem peso no λ");
  assert.ok(value.nota != null, "com odd, o value tem nota");
  assert.strictEqual(value.peso, null, "value não tem peso no λ");
});

/* ---------- 5. sem dado → null, nunca número inventado ---------- */
t("sem rates: pilares do λ sem nota e com aviso", () => {
  const d = decomporPilares({
    modelType: "dc-poisson-1.0",
    leagueAvg: 2.65,
    rates: null,
    h2h: null,
    mercado: null,
  });
  for (const id of ["medias", "matchup", "contexto"]) {
    const p = d.pilares.find((x) => x.id === id);
    assert.strictEqual(p.nota, null, `${id} deveria ficar null`);
    assert.strictEqual(p.peso, null);
    assert.ok(p.motivo, `${id} precisa explicar por que está sem base`);
  }
  assert.ok(d.aviso, "precisa avisar que não deu para decompor");
  assert.strictEqual(d.score, null);
});

t("modelo simplificado não publica pesos", () => {
  const a = runModel("Casa", "Fora", casa.slice(0, 2), fora.slice(0, 2), 2.65);
  const d = decomporPilares({
    modelType: a.model_type,
    leagueAvg: a.sample.leagueAvg,
    rates: a.rates,
    h2h: null,
    mercado: null,
  });
  assert.strictEqual(d.simplificado, true);
  assert.strictEqual(d.pilares.find((p) => p.id === "medias").peso, null);
  assert.ok(d.aviso && d.aviso.length > 10);
});

t("jogador e lesão sempre null nesta tela", () => {
  const a = runModel("Casa", "Fora", casa, fora, 2.65);
  const d = decomporPilares({
    modelType: a.model_type,
    leagueAvg: a.sample.leagueAvg,
    rates: a.rates,
    h2h: null,
    mercado: null,
  });
  for (const id of ["jogador", "lesao"]) {
    const p = d.pilares.find((x) => x.id === id);
    assert.strictEqual(p.nota, null);
    assert.ok(p.motivo, "precisa dizer o motivo");
  }
});

/* ---------- 6. H2H entra como modificador ---------- */
t("H2H aplicado vira modificador ×H2H", () => {
  const a = runModel("Casa", "Fora", casa, fora, 2.65);
  const d = decomporPilares({
    modelType: a.model_type,
    leagueAvg: a.sample.leagueAvg,
    rates: a.rates,
    h2h: { fator: 0.9, aplicado: true, jogos: 7 },
    mercado: { id: "over25", rotulo: "Over 2.5", final: 50, observado: 40 },
  });
  const m = d.modificadores.find((x) => x.id === "h2h");
  assert.ok(m, "deveria existir o modificador de H2H");
  assert.strictEqual(m.fator, 0.9);
});

t("H2H não aplicado não polui os modificadores", () => {
  const a = runModel("Casa", "Fora", casa, fora, 2.65);
  const d = decomporPilares({
    modelType: a.model_type,
    leagueAvg: a.sample.leagueAvg,
    rates: a.rates,
    h2h: { fator: 1.1, aplicado: false, jogos: 1 },
    mercado: null,
  });
  assert.ok(!d.modificadores.some((x) => x.id === "h2h"));
});

/* ---------- 7. odd só da mesma linha ---------- */
t("odd do mercado respeita a linha do par", () => {
  assert.strictEqual(oddDoMercado("over25", { ou: 2.5, over: 1.9 }), 1.9);
  assert.strictEqual(oddDoMercado("over25", { ou: 3.5, over: 1.9 }), null);
  assert.strictEqual(oddDoMercado("under35", { ou: 3.5, under: 2.05 }), 2.05);
  assert.strictEqual(oddDoMercado("btts", { btts: 1.8 }), null, "sem par publicado, sem odd");
  assert.strictEqual(oddDoMercado(null, { ou: 2.5, over: 1.9 }), null);
  assert.strictEqual(oddDoMercado("over25", null), null);
});

/* ---------- 8. nunca lança ---------- */
t("entrada vazia não lança", () => {
  const d = decomporPilares({
    modelType: "nenhum",
    leagueAvg: null,
    rates: null,
    h2h: null,
    mercado: null,
    odd: null,
  });
  assert.ok(Array.isArray(d.pilares));
  assert.strictEqual(d.score, null);
});

t("todas as sete chaves existem, uma vez cada", () => {
  const d = decomporPilares({
    modelType: "nenhum",
    leagueAvg: null,
    rates: null,
    h2h: null,
    mercado: null,
  });
  const ids = d.pilares.map((p) => p.id).sort();
  assert.deepStrictEqual(ids, [
    "contexto",
    "hitrate",
    "jogador",
    "lesao",
    "matchup",
    "medias",
    "value",
  ]);
});

console.log(`pilares: ${ok} testes ok`);
