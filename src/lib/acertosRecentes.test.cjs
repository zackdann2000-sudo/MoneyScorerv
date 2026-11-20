const assert = require("assert");
const {
  calcularTrustScore,
  TRUST_PESO_PROB,
  TRUST_PESO_EV,
  TRUST_PESO_AMOSTRA,
  TRUST_AMOSTRA_MINIMA,
  TRUST_PENALIDADE_AMOSTRA,
  TRUST_CORTE_EXCELENTE,
  TRUST_CORTE_BOA,
} = require("./valueBet.js");
const {
  montarSeries,
  serieDoPalpite,
  normalizarTime,
  timesDoPalpite,
  chaveAcerto,
  rotuloSerie,
  ACERTOS_JANELA,
  ACERTOS_MINIMOS,
} = require("./acertosRecentes.js");

/* ---------------- TRUST x/10 ---------------- */

assert.strictEqual(TRUST_PESO_PROB + TRUST_PESO_EV + TRUST_PESO_AMOSTRA, 1);
assert.strictEqual(TRUST_AMOSTRA_MINIMA, 5);
assert.strictEqual(TRUST_CORTE_EXCELENTE, 8);
assert.strictEqual(TRUST_CORTE_BOA, 6);

// topo de tudo: prob 90%+, EV 25%+ e amostra cheia → 10.0
const top = calcularTrustScore(0.9, 25, 10);
assert.strictEqual(top.nota, 10);
assert.strictEqual(top.rotulo, "Excelente");
assert.deepStrictEqual(top.partes, { prob: 1, ev: 1, amostra: 1 });

// piso: prob 55%, EV 0 e amostra 0 → 0
const zero = calcularTrustScore(0.55, 0, 0);
assert.strictEqual(zero.nota, 0);
assert.strictEqual(zero.rotulo, "Cautela");

// probabilidade alta com EV alto e amostra cheia é Excelente
const bom = calcularTrustScore(0.85, 20, 10);
assert.ok(bom.nota >= TRUST_CORTE_EXCELENTE, `esperava Excelente, deu ${bom.nota}`);
assert.strictEqual(bom.rotulo, "Excelente");

// mesma probabilidade/EV com amostra curta perde nota (penalidade <5 jogos)
const cheia = calcularTrustScore(0.7, 10, 10);
const curta = calcularTrustScore(0.7, 10, 3);
assert.ok(curta.nota < cheia.nota, "amostra curta deve pontuar menos");
const semPenalidade = +(cheia.nota * 1).toFixed(1);
assert.ok(semPenalidade > 0);
// a penalidade é aplicada sobre a amostra curta: 3 jogos → componente 0.3
assert.ok(curta.partes.amostra <= 0.35);

// amostra 5 já sai da penalidade
const cinco = calcularTrustScore(0.7, 10, 5);
assert.ok(cinco.nota > curta.nota);

// rótulo Boa fica na faixa 6–8
const meia = calcularTrustScore(0.8, 15, 10);
assert.ok(meia.nota >= 6 && meia.nota < 8, `esperava Boa, deu ${meia.nota}`);
assert.strictEqual(meia.rotulo, "Boa");

// entradas sujas não explodem nem viram nota alta
assert.strictEqual(calcularTrustScore(NaN, NaN, null).nota, 0);
assert.strictEqual(calcularTrustScore(1.5, 100, 99).nota, 10); // clamp no teto
assert.strictEqual(calcularTrustScore(0.9, 25, 10).nota, 10);
assert.ok(calcularTrustScore(-1, -50, -3).nota === 0);

/* ---------------- acertos recentes (série) ---------------- */

assert.strictEqual(ACERTOS_JANELA, 5);
assert.strictEqual(ACERTOS_MINIMOS, 3);

assert.strictEqual(normalizarTime("São Paulo  FC"), "sao paulo fc");
assert.deepStrictEqual(timesDoPalpite({ homeName: "São Paulo", awayName: "Flamengo", mercado: "home", status: "green" }), ["sao paulo"]);
assert.deepStrictEqual(timesDoPalpite({ homeName: "São Paulo", awayName: "Flamengo", mercado: "away", status: "green" }), ["flamengo"]);
assert.deepStrictEqual(timesDoPalpite({ homeName: "São Paulo", awayName: "Flamengo", mercado: "over25", status: "green" }), ["sao paulo", "flamengo"]);
assert.deepStrictEqual(timesDoPalpite({ homeName: "A", awayName: "B", mercado: "draw", status: "green" }), []);

const linha = (homeName, awayName, mercado, status) => ({ homeName, awayName, mercado, status });

// 3 greens seguidos → selo ligado
const tres = montarSeries([
  linha("São Paulo", "Flamengo", "home", "green"),
  linha("São Paulo", "Palmeiras", "home", "green"),
  linha("São Paulo", "Corinthians", "home", "green"),
]);
const sp = tres.get(chaveAcerto("Sao Paulo", "home"));
assert.strictEqual(sp.verdes, 3);
assert.strictEqual(sp.total, 3);
assert.strictEqual(sp.acertosRecentes, true);
assert.strictEqual(rotuloSerie(sp), "3/3");

// red no meio da série derruba o selo
const comRed = montarSeries([
  linha("Vasco", "X", "home", "green"),
  linha("Vasco", "Y", "home", "red"),
  linha("Vasco", "Z", "home", "green"),
]);
assert.strictEqual(comRed.get(chaveAcerto("Vasco", "home")).acertosRecentes, false);

// só 2 greens não bastam (mínimo 3)
const dois = montarSeries([
  linha("Botafogo", "X", "home", "green"),
  linha("Botafogo", "Y", "home", "green"),
]);
assert.strictEqual(dois.get(chaveAcerto("Botafogo", "home")).acertosRecentes, false);

// pendente não conta para a série
const comPendente = montarSeries([
  linha("Grêmio", "X", "home", "green"),
  linha("Grêmio", "Y", "home", "green"),
  linha("Grêmio", "Z", "home", "pendente"),
  linha("Grêmio", "W", "home", "green"),
]);
assert.strictEqual(comPendente.get(chaveAcerto("Gremio", "home")).acertosRecentes, true);

// mercados diferentes não se misturam
const misto = montarSeries([
  linha("Santos", "X", "home", "green"),
  linha("Santos", "Y", "home", "green"),
  linha("Santos", "Z", "over25", "green"),
]);
assert.strictEqual(misto.get(chaveAcerto("Santos", "home")).acertosRecentes, false);
assert.strictEqual(misto.get(chaveAcerto("Santos", "over25")).acertosRecentes, false);

// mercado neutro conta para os dois times
const neutro = montarSeries([
  linha("Inter", "Grêmio", "btts", "green"),
  linha("Juventude", "Grêmio", "btts", "green"),
  linha("Caxias", "Grêmio", "btts", "green"),
]);
assert.strictEqual(neutro.get(chaveAcerto("Gremio", "btts")).acertosRecentes, true);

// série maior que a janela: só os 5 mais recentes entram
const longa = montarSeries(
  [
    ...Array.from({ length: 6 }, (_, i) => linha("Bahia", `T${i}`, "home", "green")),
    linha("Bahia", "Antigo", "home", "red"),
  ],
  { janela: 5 },
);
const bahia = longa.get(chaveAcerto("Bahia", "home"));
assert.strictEqual(bahia.total, 5);
assert.strictEqual(bahia.acertosRecentes, true);

// consulta por palpite: acha pelo time da casa ou de fora
const mapa = montarSeries([
  linha("Cruzeiro", "Atlético", "over25", "green"),
  linha("Outro", "Cruzeiro", "over25", "green"),
  linha("Terceiro", "Cruzeiro", "over25", "green"),
]);
const achado = serieDoPalpite(mapa, "Fulano", "Cruzeiro", "over25");
assert.ok(achado);
assert.strictEqual(achado.serie.acertosRecentes, true);
assert.strictEqual(serieDoPalpite(mapa, "Ninguem", "Ninguem", "over25"), null);

console.log(
  `✅ trust/acertos ok — top ${top.nota} · 70%/10%EV amostra 10 → ${cheia.nota} vs amostra 3 → ${curta.nota} · série ${sp.verdes}/${sp.total}`,
);
