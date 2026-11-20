const assert = require("assert");
const {
  extrairLances,
  pressao,
  sinalPressao,
  seriePressao,
  minutoDoLance,
  PESOS,
  CORTE_FIRE,
  CORTE_BALL,
  JANELA_GRAFICO,
  JANELA_SINAL,
} = require("./momentum.js");

const casa = { id: "90", name: "Vasco da Gama" };
const fora = { id: "92", name: "Internacional" };

/* ---------- narração crua → lances ---------- */
const narracao = [
  { time: { displayValue: "4'" }, play: { type: { type: "corner-awarded" }, team: { displayName: "Vasco da Gama" } } },
  { time: { displayValue: "8'" }, play: { type: { type: "shot-on-target" }, team: { id: "90" } } },
  { time: { displayValue: "9'" }, play: { type: { type: "shot-off-target" }, team: { displayName: "Internacional" } } },
  { time: { displayValue: "12'" }, play: { type: { type: "foul" }, team: { displayName: "Vasco da Gama" } } }, // ignorado: fora dos pesos
  { time: { displayValue: "13'" }, play: { type: { type: "goal" }, team: { displayName: "Vasco da Gama" } } },
  { time: { displayValue: "" }, play: { type: { type: "shot-blocked" }, team: { id: "92" } } }, // minuto 0 → fora de janela
  { time: { displayValue: "20'" }, play: { type: { type: "yellow-card" }, team: { displayName: "Sem Time" } } }, // lado desconhecido
];

const lances = extrairLances(narracao, casa, fora);
assert.strictEqual(lances.length, 5);
// o retorno vem ordenado por minuto (o blocked sem minuto cai no 0)
assert.deepStrictEqual(lances.map((l) => l.minuto), [0, 4, 8, 9, 13]);
assert.deepStrictEqual(lances.map((l) => l.tipo), ["shot-blocked", "corner", "shot-on-target", "shot-off-target", "goal"]);
assert.deepStrictEqual(lances.map((l) => l.lado), ["away", "home", "home", "away", "home"]);

/* nome com acento/variação casa normalmente */
const acento = extrairLances(
  [{ time: { displayValue: "10'" }, play: { type: { type: "goal" }, team: { displayName: "Sao Paulo FC" } } }],
  { id: "1", name: "São Paulo" },
  { id: "2", name: "Palmeiras" },
);
assert.strictEqual(acento.length, 1);
assert.strictEqual(acento[0].lado, "home");

/* minuto: displayValue manda; sem ele, cai para os segundos */
assert.strictEqual(minutoDoLance({ time: { displayValue: "44'" } }), 44);
assert.strictEqual(minutoDoLance({ time: { value: 2612 } }), 43);
assert.strictEqual(minutoDoLance({ time: { displayValue: "90+3'" } }), 90);
assert.strictEqual(minutoDoLance({}), 0);

/* ---------- pressão ---------- */
assert.strictEqual(JANELA_GRAFICO, 15);
assert.strictEqual(JANELA_SINAL, 10);
assert.strictEqual(PESOS.goal, 4);

const apenasCasa = extrairLances(
  [
    { time: { displayValue: "70'" }, play: { type: { type: "shot-on-target" }, team: { id: "90" } } },
    { time: { displayValue: "72'" }, play: { type: { type: "corner-awarded" }, team: { id: "90" } } },
    { time: { displayValue: "74'" }, play: { type: { type: "shot-off-target" }, team: { id: "90" } } },
  ],
  casa,
  fora,
);
const p = pressao(apenasCasa, { minuto: 75 });
assert.strictEqual(p.pctCasa, 100);
assert.strictEqual(p.pctFora, 0);
assert.strictEqual(p.dominante, "home");
assert.strictEqual(p.chutesCasa, 2);
assert.strictEqual(p.escanteiosCasa, 1);
assert.strictEqual(p.golsCasa, 0);
assert.strictEqual(p.total, p.casa + p.fora);

/* janela vazia → nada inventado */
const velho = pressao(apenasCasa, { minuto: 120 });
assert.strictEqual(velho.pctCasa, null);
assert.strictEqual(velho.dominante, null);
assert.strictEqual(velho.lances, 0);

/* lance antigo ainda conta dentro da janela de 15, mas pesa menos */
const doisLados = extrairLances(
  [
    { time: { displayValue: "62'" }, play: { type: { type: "shot-on-target" }, team: { id: "90" } } },
    { time: { displayValue: "74'" }, play: { type: { type: "shot-on-target" }, team: { id: "92" } } },
  ],
  casa,
  fora,
);
const p2 = pressao(doisLados, { minuto: 75 });
assert.ok(p2.pctCasa != null && p2.pctFora != null);
assert.ok(p2.pctCasa < 50, "o lance mais recente é do visitante e deve pesar mais");
assert.strictEqual(p2.dominante, "away");

/* escanteios, chutes e cartões contados por lado */
const contagem = extrairLances(
  [
    { time: { displayValue: "80'" }, play: { type: { type: "corner-awarded" }, team: { id: "92" } } },
    { time: { displayValue: "81'" }, play: { type: { type: "yellow-card" }, team: { id: "92" } } },
    { time: { displayValue: "82'" }, play: { type: { type: "shot-blocked" }, team: { id: "92" } } },
  ],
  casa,
  fora,
);
const p3 = pressao(contagem, { minuto: 82 });
assert.strictEqual(p3.escanteiosFora, 1);
assert.strictEqual(p3.cartoesFora, 1);
assert.strictEqual(p3.chutesFora, 1);

/* ---------- selo FIRE / BALL ---------- */
assert.strictEqual(CORTE_FIRE, 80);
assert.strictEqual(CORTE_BALL, 60);
assert.strictEqual(sinalPressao(null).nivel, null);
assert.strictEqual(sinalPressao({ pctCasa: null, pctFora: null }).nivel, null);

const fire = sinalPressao({ pctCasa: 86, pctFora: 14 });
assert.strictEqual(fire.nivel, "fire");
assert.strictEqual(fire.lado, "home");
assert.strictEqual(fire.pct, 86);
assert.strictEqual(fire.rotulo, "FIRE");

const ball = sinalPressao({ pctCasa: 65, pctFora: 35 });
assert.strictEqual(ball.nivel, "ball");
assert.strictEqual(ball.lado, "home");

const morno = sinalPressao({ pctCasa: 55, pctFora: 45 });
assert.strictEqual(morno.nivel, null);
assert.strictEqual(morno.rotulo, "");

/* 80% exato não é FIRE (o corte é "passar de 80") */
assert.strictEqual(sinalPressao({ pctCasa: 80, pctFora: 20 }).nivel, "ball");
/* 60% exato é BALL */
assert.strictEqual(sinalPressao({ pctCasa: 60, pctFora: 40 }).nivel, "ball");

/* sinal olha o lado mais forte, não o mandante */
const foraForte = sinalPressao({ pctCasa: 10, pctFora: 90 });
assert.strictEqual(foraForte.nivel, "fire");
assert.strictEqual(foraForte.lado, "away");

/* ---------- série do gráfico ---------- */
const serie = seriePressao(lances, { minuto: 15, janela: 15, passo: 3 });
assert.strictEqual(serie.length, 5);
assert.deepStrictEqual(serie.map((s) => s.min), [3, 6, 9, 12, 15]);
assert.ok(serie.every((s) => s.casa >= 0 && s.fora >= 0));
// o gol está entre 12' e 15'
assert.ok(serie[serie.length - 1].casa >= PESOS.goal * 0.5);
// janela sem lance → série vazia
assert.deepStrictEqual(seriePressao(lances, { minuto: 200, janela: 15 }), []);

console.log(
  `✅ momentum ok — ${lances.length} lances extraídos · pressão casa ${p.pctCasa}% · selo ${fire.rotulo}/${ball.rotulo} · série ${serie.length} fatias`,
);
