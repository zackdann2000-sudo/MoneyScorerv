/**
 * Testes do motivo congelado.
 *
 * Roda sem rede e sem banco (padrão da pasta: `./scripts/unit-tests.sh motivo`).
 */
const assert = require("node:assert/strict");
const {
  montarMotivo,
  camposDoMotivo,
  motivoEmUmaLinha,
  quandoCongelou,
  MOTIVO_VERSAO,
} = require("./motivoPick.js");

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

const entrada = {
  mercado: "over25",
  rotulo: "Over 2.5 gols",
  linha: 2.5,
  probModelo: 0.7123,
  probImplicita: 0.4878,
  odd: 2.05,
  oddJusta: 2.4,
  valor: 0.2245,
  evPct: 12.34,
  stake: 0.0321,
  trust: 7.42,
  trustRotulo: "Boa",
  confianca: "alta",
  faixa: "valor",
  amostra: 10,
  fonteOdd: "pinnacle",
  porque: "Over 2.5 em 7 de 10 jogos do mandante.",
};

const ctx = {
  lambdaHome: 1.4212,
  lambdaAway: 0.9876,
  xgHome: 1.51,
  xgAway: 1.2,
  xgFonte: "api-football",
  xgCoverage: 0.8,
  probs: { home: 0.51, draw: 0.26, away: 0.23, over25: 0.7123, btts: 0.55 },
};

const AGORA = "2026-11-26T23:04:59.258Z";

console.log("montarMotivo — snapshot");

t("versão e instante do congelamento", () => {
  const m = montarMotivo(entrada, ctx, AGORA);
  assert.equal(m.v, MOTIVO_VERSAO);
  assert.equal(m.registradoEm, AGORA);
});

t("grava o cenário completo do pick", () => {
  const m = montarMotivo(entrada, ctx, AGORA);
  assert.equal(m.mercado, "over25");
  assert.equal(m.rotulo, "Over 2.5 gols");
  assert.equal(m.linha, 2.5);
  assert.equal(m.prob, 0.7123);
  assert.equal(m.odd, 2.05);
  assert.equal(m.oddJusta, 2.4);
  assert.equal(m.edge, 0.2245);
  assert.equal(m.evPct, 12.34);
  assert.equal(m.trust, 7.42);
  assert.equal(m.trustRotulo, "Boa");
  assert.equal(m.amostra, 10);
});

t("grava λ e xG que o motor usou", () => {
  const m = montarMotivo(entrada, ctx, AGORA);
  assert.equal(m.lambdaCasa, 1.421);
  assert.equal(m.lambdaFora, 0.988);
  assert.equal(m.xgCasa, 1.51);
  assert.equal(m.xgFora, 1.2);
  assert.equal(m.xgFonte, "api-football");
});

t("grava as probabilidades do jogo (1 · X · 2)", () => {
  const m = montarMotivo(entrada, ctx, AGORA);
  assert.equal(m.probs.casa, 0.51);
  assert.equal(m.probs.over25, 0.7123);
});

t("preserva a frase do motor (porque)", () => {
  assert.equal(montarMotivo(entrada, ctx, AGORA).porque, entrada.porque);
});

t("campo ausente vira null — nunca 0", () => {
  const m = montarMotivo({ mercado: "btts", rotulo: "Ambas marcam" }, {}, AGORA);
  assert.equal(m.prob, null);
  assert.equal(m.odd, null);
  assert.equal(m.oddJusta, null);
  assert.equal(m.evPct, null);
  assert.equal(m.stake, null);
  assert.equal(m.trust, null);
  assert.equal(m.lambdaCasa, null);
  assert.equal(m.probs, null);
  assert.equal(m.porque, null);
});

t("não explode com entrada vazia (pick vale mais que o motivo dele)", () => {
  const m = montarMotivo({}, {}, AGORA);
  assert.equal(m.mercado, "desconhecido");
  assert.equal(m.rotulo, "desconhecido");
});

t("texto em branco não vira string vazia", () => {
  const m = montarMotivo({ ...entrada, porque: "   ", fonteOdd: "" }, ctx, AGORA);
  assert.equal(m.porque, null);
  assert.equal(m.fonteOdd, null);
});

t("strings numéricas do banco são aceitas", () => {
  const m = montarMotivo({ ...entrada, probModelo: "0.5", odd: "2.10" }, ctx, AGORA);
  assert.equal(m.prob, 0.5);
  assert.equal(m.odd, 2.1);
});

t("NaN não entra no snapshot", () => {
  const m = montarMotivo({ ...entrada, probModelo: NaN, odd: "abc" }, ctx, AGORA);
  assert.equal(m.prob, null);
  assert.equal(m.odd, null);
});

console.log("camposDoMotivo — o que a tela mostra");

t("lista de campos vem na ordem de leitura", () => {
  const campos = camposDoMotivo(montarMotivo(entrada, ctx, AGORA));
  assert.equal(campos[0].chave, "mercado");
  assert.equal(campos[1].chave, "prob");
  assert.ok(campos.some((c) => c.chave === "xg"));
  assert.ok(campos.some((c) => c.chave === "lambda"));
  assert.ok(campos.some((c) => c.chave === "porque"));
});

t("formata probabilidade, odd, EV e edge em pt-BR", () => {
  const m = montarMotivo(entrada, ctx, AGORA);
  const por = (k) => camposDoMotivo(m).find((c) => c.chave === k).valor;
  assert.equal(por("prob"), "71,2%");
  assert.equal(por("probImplicita"), "48,8%");
  assert.equal(por("edge"), "+22,4 pts");
  assert.equal(por("evPct"), "+12,3%");
  assert.equal(por("odds"), "2,05 / 2,40");
  assert.equal(por("stake"), "3,21% da banca");
  assert.equal(por("trust"), "7,4 · Boa");
  assert.equal(por("amostra"), "10 jogos");
});

t("linha do mercado aparece no rótulo do mercado", () => {
  const por = camposDoMotivo(montarMotivo(entrada, ctx, AGORA)).find((c) => c.chave === "mercado");
  assert.equal(por.valor, "Over 2.5 gols (linha 2,50)");
});

t("xG mostra a fonte quando existe", () => {
  const por = camposDoMotivo(montarMotivo(entrada, ctx, AGORA)).find((c) => c.chave === "xg");
  assert.equal(por.valor, "1,51 / 1,20 · api-football");
});

t("campo sem dado mostra '—' e nunca 0", () => {
  const campos = camposDoMotivo(montarMotivo({ mercado: "btts" }, {}, AGORA));
  const por = (k) => campos.find((c) => c.chave === k).valor;
  assert.equal(por("prob"), "—");
  assert.equal(por("odds"), "—");
  assert.equal(por("trust"), "—");
  assert.equal(por("xg"), "—");
  assert.equal(por("lambda"), "—");
});

t("motivo nulo (pick antigo) devolve lista vazia, sem quebrar", () => {
  assert.deepEqual(camposDoMotivo(null), []);
  assert.deepEqual(camposDoMotivo(undefined), []);
});

t("porque só entra na lista quando existe", () => {
  const sem = camposDoMotivo(montarMotivo({ ...entrada, porque: null }, ctx, AGORA));
  assert.ok(!sem.some((c) => c.chave === "porque"));
});

console.log("motivoEmUmaLinha e data");

t("resumo de uma linha", () => {
  const linha = motivoEmUmaLinha(montarMotivo(entrada, ctx, AGORA));
  assert.equal(linha, "prob 71,2% · odd 2,05 · EV +12,3% · TRUST 7,4");
});

t("sem motivo avisa em vez de inventar", () => {
  assert.equal(motivoEmUmaLinha(null), "Motivo não gravado");
});

t("data do congelamento em horário de Brasília", () => {
  // 23:04 UTC = 20:04 BRT
  assert.equal(quandoCongelou(AGORA), "26/11/2026 20:04");
});

t("data inválida não vira Invalid Date na tela", () => {
  assert.equal(quandoCongelou("nao-e-data"), "—");
  assert.equal(quandoCongelou(null), "—");
});

console.log(`\n${ok} asserções verdes`);
