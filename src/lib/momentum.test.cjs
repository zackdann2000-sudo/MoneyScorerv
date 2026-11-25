const assert = require("assert");
const {
  extrairLances,
  pressao,
  sinalPressao,
  seriePressao,
  minutoDoLance,
  minutoDoRelogio,
  appm,
  classificarAppm,
  ehAtaquePerigoso,
  PESOS,
  CORTE_FIRE,
  CORTE_BALL,
  JANELA_GRAFICO,
  JANELA_SINAL,
  APPM_JANELAS,
  APPM_JOGO,
  APPM_CORTES,
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

/* ---------- relógio do jogo → minuto (o card segue o cronômetro, não o lance) ---------- */
assert.strictEqual(minutoDoRelogio("26'"), 26);
assert.strictEqual(minutoDoRelogio("67"), 67);
assert.strictEqual(minutoDoRelogio("45'+2"), 45);
assert.strictEqual(minutoDoRelogio("90+3'"), 90);
assert.strictEqual(minutoDoRelogio("26:14"), 26); // cronômetro mm:ss
assert.strictEqual(minutoDoRelogio(" 12' "), 12);
assert.strictEqual(minutoDoRelogio("HT"), null); // sem relógio de jogo
assert.strictEqual(minutoDoRelogio("FT"), null);
assert.strictEqual(minutoDoRelogio(""), null);
assert.strictEqual(minutoDoRelogio(null), null);
assert.strictEqual(minutoDoRelogio("999'"), 120); // teto do modelo
assert.strictEqual(minutoDoRelogio("0'"), 0);

/* regressão do bug: relógio em 26' com o último lance em 19'.
   Ancorado no último lance, a janela de 15 min fica 4'–19' e mostra a pressão
   errada; ancorada no relógio (26') ela é 11'–26', que é o que o topo mostra. */
const lancesAtrasados = [
  { minuto: 6, tipo: "shot-on-target", lado: "home" },
  { minuto: 24, tipo: "shot-on-target", lado: "away" },
];
const ancoradoNoLance = pressao(lancesAtrasados, { minuto: 19, janela: JANELA_GRAFICO });
const ancoradoNoRelogio = pressao(lancesAtrasados, { minuto: minutoDoRelogio("26'") ?? 0, janela: JANELA_GRAFICO });
assert.strictEqual(ancoradoNoLance.dominante, "home"); // janela 4'–19' pega o chute dos 6'
assert.strictEqual(ancoradoNoRelogio.dominante, "away"); // janela 11'–26' pega o chute dos 24'

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

/* ---------- APPM: ataques perigosos por minuto ---------- */
assert.deepStrictEqual([...APPM_JANELAS], [1, 3, 5, 10]);
assert.strictEqual(APPM_JOGO, 0);
assert.strictEqual(APPM_CORTES.verde, 2);
assert.strictEqual(APPM_CORTES.laranja, 3);
assert.strictEqual(APPM_CORTES.vermelho, 3.9);

/* o que conta como ataque: chute, escanteio, gol, pênalti, gol contra */
for (const t of ["goal", "pen", "own", "shot-on-target", "shot-blocked", "shot-off-target", "corner"]) {
  assert.strictEqual(ehAtaquePerigoso(t), true, `${t} é ataque perigoso`);
}
for (const t of ["yellow", "red", "other"]) {
  assert.strictEqual(ehAtaquePerigoso(t), false, `${t} não é ataque perigoso`);
}

/* cortes de cor: verde ≥ 2 · laranja acima de 3 · vermelho acima de 3,9 */
assert.strictEqual(classificarAppm(null), null);
assert.strictEqual(classificarAppm(undefined), null);
assert.strictEqual(classificarAppm(NaN), null);
assert.strictEqual(classificarAppm(0), null);
assert.strictEqual(classificarAppm(1.99), null);
assert.strictEqual(classificarAppm(2), "verde");
assert.strictEqual(classificarAppm(3), "verde", "3,0 não é \"acima de 3\"");
assert.strictEqual(classificarAppm(3.01), "laranja");
assert.strictEqual(classificarAppm(3.9), "laranja", "3,9 não é \"acima de 3,9\"");
assert.strictEqual(classificarAppm(3.91), "vermelho");
assert.strictEqual(classificarAppm(4.5), "vermelho");

/* cenário: 4' escanteio casa · 8' chute no gol casa · 9' para fora fora
   10' amarelo casa (não conta) · 13' gol casa */
const apmNarracao = [
  { time: { displayValue: "4'" }, play: { type: { type: "corner-awarded" }, team: { id: "90" } } },
  { time: { displayValue: "8'" }, play: { type: { type: "shot-on-target" }, team: { id: "90" } } },
  { time: { displayValue: "9'" }, play: { type: { type: "shot-off-target" }, team: { id: "92" } } },
  { time: { displayValue: "10'" }, play: { type: { type: "yellow-card" }, team: { id: "90" } } },
  { time: { displayValue: "13'" }, play: { type: { type: "goal" }, team: { id: "90" } } },
];
const lancesApm = extrairLances(apmNarracao, casa, fora);
const a = appm(lancesApm, { minuto: 13 });

assert.strictEqual(a.minuto, 13);
assert.strictEqual(a.ataques, 4, "amarelo não entra na conta de ataque");
assert.deepStrictEqual(a.janelas.map((j) => j.janela), [1, 3, 5, 10, 0]);
assert.deepStrictEqual(a.janelas.map((j) => j.minutos), [1, 3, 5, 10, 13]);

const porJanela = Object.fromEntries(a.janelas.map((j) => [j.janela, j]));
// 1 min: só o gol do 13'
assert.strictEqual(porJanela[1].casa, 1);
assert.strictEqual(porJanela[1].fora, 0);
assert.strictEqual(porJanela[1].ataquesCasa, 1);
// 3 min: 11'–13' → gol
assert.strictEqual(porJanela[3].casa, 0.33);
// 5 min: 9'–13' (o lance de 8' caiu na borda) → chute fora 9', gol casa 13'
assert.strictEqual(porJanela[5].casa, 0.2);
assert.strictEqual(porJanela[5].fora, 0.2);
assert.strictEqual(porJanela[5].ataquesCasa + porJanela[5].ataquesFora, 2);
// 10 min: 4'–13' → escanteio + chute + gol (casa), um chute fora
assert.strictEqual(porJanela[10].casa, 0.3);
assert.strictEqual(porJanela[10].fora, 0.1);
// jogo todo: 3 ataques casa em 13 minutos jogados
assert.strictEqual(porJanela[0].casa, 0.23);
assert.strictEqual(porJanela[0].fora, 0.08);

/* nenhum valor aqui chega ao corte de 2 → nada de cor inventada */
assert.ok(a.janelas.every((j) => j.nivelCasa === null && j.nivelFora === null));

/* divisor = minutos jogados de verdade, não o tamanho nominal da janela */
const cedo = extrairLances(
  [
    { time: { displayValue: "2'" }, play: { type: { type: "shot-on-target" }, team: { id: "90" } } },
    { time: { displayValue: "3'" }, play: { type: { type: "corner-awarded" }, team: { id: "90" } } },
  ],
  casa,
  fora,
);
const c3 = appm(cedo, { minuto: 3 });
const j10 = c3.janelas.find((j) => j.janela === 10);
assert.strictEqual(j10.minutos, 3, "aos 3' a janela de 10 min divide por 3");
assert.strictEqual(j10.casa, 0.67);
assert.strictEqual(c3.janelas.find((j) => j.janela === 0).casa, 0.67);

/* cor aplicada pelo valor real */
const enxurrada = extrairLances(
  Array.from({ length: 6 }, () => ({ time: { displayValue: "5'" }, play: { type: { type: "shot-on-target" }, team: { id: "90" } } })),
  casa,
  fora,
);
const cheio = appm(enxurrada, { minuto: 5 });
const j1 = cheio.janelas.find((j) => j.janela === 1);
assert.strictEqual(j1.casa, 6);
assert.strictEqual(j1.nivelCasa, "vermelho");
assert.strictEqual(j1.nivelFora, null);

/* sem lance → nenhuma janela (a UI mostra "Indisponível") */
const vazioApm = appm([], { minuto: 20 });
assert.deepStrictEqual(vazioApm.janelas, []);
assert.strictEqual(vazioApm.ataques, 0);
assert.deepStrictEqual(appm(null, { minuto: 20 }).janelas, []);

/* sem `minuto` explícito usa o último lance visto */
assert.strictEqual(appm(lancesApm).minuto, 13);

/* janelas customizadas */
const so2 = appm(lancesApm, { minuto: 13, janelas: [2] });
assert.deepStrictEqual(so2.janelas.map((j) => j.janela), [2]);
assert.strictEqual(so2.janelas[0].minutos, 2);
assert.strictEqual(so2.janelas[0].casa, 0.5);

console.log(
  `✅ momentum ok — ${lances.length} lances extraídos · pressão casa ${p.pctCasa}% · selo ${fire.rotulo}/${ball.rotulo} · série ${serie.length} fatias · APPM ${a.janelas.length} janelas (${a.ataques} ataques) · vermelho em ${cheio.janelas[0].casa}/min`,
);
