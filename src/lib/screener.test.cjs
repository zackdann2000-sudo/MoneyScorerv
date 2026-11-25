const assert = require("assert");
const {
  avaliarJogo,
  avaliarLado,
  MERCADOS,
  mercadosPorEtapa,
  MIN_COBERTURA,
  LIMIAR_PADRAO,
} = require("./screener.js");

/* ---------- fábrica de HistGame mínimo ---------- */
let seq = 0;
const jogo = (o = {}) => ({
  id: String(++seq),
  date: o.date || `2026-01-${String((seq % 28) + 1).padStart(2, "0")}`,
  league: "bra.1",
  home: o.home !== false,
  opp: { id: "9", name: "Adversário", short: "ADV", logo: "" },
  gf: o.gf ?? 1,
  ga: o.ga ?? 1,
  res: o.res || "E",
  htGf: "htGf" in o ? o.htGf : 1,
  htGa: "htGa" in o ? o.htGa : 0,
  corners: "corners" in o ? o.corners : 5,
  fouls: 10,
  yellow: "yellow" in o ? o.yellow : 1,
  red: "red" in o ? o.red : 0,
  offsides: "offsides" in o ? o.offsides : 2,
  sot: 4,
  shots: 12,
  poss: 50,
  xgEst: 1.2,
  oppCorners: "oppCorners" in o ? o.oppCorners : 4,
  oppSot: 3,
  oppFouls: 11,
  oppYellow: 1,
  oppRed: 0,
  oppOffsides: 2,
  events: [],
});

/* ---------- catálogo ---------- */
assert.ok(MERCADOS.length >= 11, "catálogo do screener precisa cobrir os 11 mercados");
// Etapa A vive só de placar: nenhum mercado da A pode depender de cantos/cartões
const usaStats = (m) => m.id.includes("cantos") || m.id.includes("cards") || m.id.includes("impedimentos");
for (const m of mercadosPorEtapa("A")) assert.ok(!usaStats(m), `mercado ${m.id} deveria exigir summary`);
for (const m of mercadosPorEtapa("B")) assert.ok(usaStats(m), `mercado ${m.id} deveria ser de summary`);

/* ---------- BTTS ---------- */
const cincoTodosMarcam = [1, 2, 3, 4, 5].map(() => {
  const j = jogo({ gf: 2, ga: 1 });
  return j;
});
let r = avaliarLado(cincoTodosMarcam, MERCADOS.find((m) => m.id === "btts"), "casa", { mando: "todos" });
assert.strictEqual(r.acertos, 5);
assert.strictEqual(r.total, 5);
assert.strictEqual(r.pct, 100);
// jogo sem gol de um lado não entra como acerto
const umJogo = [jogo({ gf: 2, ga: 0 })];
r = avaliarLado(umJogo, MERCADOS.find((m) => m.id === "btts"), "casa", { mando: "todos" });
assert.strictEqual(r.acertos, 0);

/* ---------- Over 2.5 usa gf+ga ---------- */
const overMercado = MERCADOS.find((m) => m.id === "over_2_5");
const jogosGols = [jogo({ gf: 2, ga: 1 }), jogo({ gf: 1, ga: 1 }), jogo({ gf: 3, ga: 2 }), jogo({ gf: 0, ga: 0 })];
r = avaliarLado(jogosGols, overMercado, "casa", { mando: "todos" });
assert.strictEqual(r.acertos, 2, "2-1 e 3-2 passam; 1-1 e 0-0 não");
assert.deepStrictEqual(r.serie, [1, 0, 1, 0]); // ordem cronológica
assert.strictEqual(r.pct, 50);

/* ---------- cartões: null não vira zero ---------- */
const cardsMercado = MERCADOS.find((m) => m.id === "cards_ambos_1_5");
const semCards = [jogo({ yellow: null, red: null }), jogo({ yellow: null, red: null }), jogo({ yellow: null, red: null })];
r = avaliarLado(semCards, cardsMercado, "casa", { mando: "todos" });
assert.strictEqual(r.cobertura, 0);
assert.strictEqual(r.pct, null, "sem dado de cartão o pct é null, nunca 0%");
// amarelo presente + vermelho ausente conta pelo amarelo (não inventa vermelho)
r = avaliarLado([jogo({ yellow: 2, red: null })], cardsMercado, "casa", { mando: "todos" });
assert.strictEqual(r.acertos, 1);

/* ---------- 1º tempo: htGf null derruba os mercados de 1T ---------- */
const jogosSemHT = [jogo({ htGf: null, htGa: null }), jogo({ htGf: null, htGa: null }), jogo({ htGf: null, htGa: null })];
const j1t = avaliarJogo(jogosSemHT, jogosSemHT, { etapa: "A" });
assert.ok(j1t.semDado.includes("ht_over_0_5"), "1T sem dado precisa ir para semDado");
assert.ok(j1t.semDado.includes("visitante_ht_0_5"));
const j1tOk = avaliarJogo(
  [jogo({ htGf: 1, htGa: 0 }), jogo({ htGf: 2, htGa: 1 }), jogo({ htGf: 1, htGa: 1 })],
  [jogo({ htGf: 1, htGa: 0 }), jogo({ htGf: 1, htGa: 0 }), jogo({ htGf: 1, htGa: 1 })],
  { etapa: "A", limiar: 60 }
);
assert.ok(!j1tOk.semDado.includes("ht_over_0_5"));
assert.ok(j1tOk.aprovados.includes("ht_over_0_5"));

/* ---------- mando: casa filtra só jogos em casa ---------- */
const misto = [
  jogo({ home: true, res: "V" }),
  jogo({ home: true, res: "V" }),
  jogo({ home: true, res: "E" }),
  jogo({ home: false, res: "D" }),
  jogo({ home: false, res: "D" }),
];
r = avaliarLado(misto, MERCADOS.find((m) => m.id === "casa_vence"), "casa", {});
assert.strictEqual(r.total, 3, "só os 3 jogos em casa entram na conta");
assert.strictEqual(r.acertos, 2);
assert.strictEqual(r.semMando, undefined);

/* ---------- mando com menos de MIN_COBERTURA cai para a amostra inteira ---------- */
const poucosEmCasa = [jogo({ home: true, res: "V" }), jogo({ home: false, res: "D" }), jogo({ home: false, res: "D" }), jogo({ home: false, res: "V" })];
r = avaliarLado(poucosEmCasa, MERCADOS.find((m) => m.id === "casa_vence"), "casa", {});
assert.strictEqual(r.semMando, true);
assert.strictEqual(r.total, 4);
assert.strictEqual(r.pct, 50);
assert.ok(MIN_COBERTURA === 3);

/* ---------- cobertura insuficiente ⇒ mercado inteiro semDado ---------- */
const doisJogos = [jogo(), jogo()];
const jDois = avaliarJogo(doisJogos, doisJogos, { etapa: "A" });
assert.strictEqual(jDois.mercados.length, 0);
assert.ok(jDois.semDado.length > 0);
assert.strictEqual(jDois.score, 0);

/* ---------- limiar e score ---------- */
const serieForte = [1, 2, 3, 4].map(() => jogo({ gf: 2, ga: 1, htGf: 1, htGa: 1, res: "V", home: true }));
const jForte = avaliarJogo(serieForte, serieForte, { etapa: "A", limiar: LIMIAR_PADRAO });
assert.ok(jForte.aprovados.includes("btts"));
assert.ok(jForte.aprovados.includes("over_1_5"));
assert.ok(jForte.score > 0);
// limiar 100 aprova, limiar impossível não
const jImpossivel = avaliarJogo(serieForte, serieForte, { etapa: "A", limiar: 101 });
assert.strictEqual(jImpossivel.aprovados.length, 0);
assert.strictEqual(jImpossivel.score, 0);

/* ---------- nenhum valor inventado quando só um lado tem dado ---------- */
const comDado = jogo({ gf: 2, ga: 1 });
const CardsSemDado = [jogo({ yellow: null, red: null }), jogo({ yellow: null, red: null }), jogo({ yellow: null, red: null })];
const jMisto = avaliarJogo([comDado, comDado, comDado], CardsSemDado, { etapa: "B" });
assert.ok(jMisto.semDado.includes("cards_ambos_1_5"), "um lado sem cartões derruba o mercado");
// cantos continuam disponíveis nos dois lados (o lote sem cartão ainda tem escanteio)
assert.ok(jMisto.mercados.some((m) => m.id === "cantos_time_4_5"));
// já impedimentos: um lado com null derruba o mercado inteiro
const impedSemDado = [jogo({ offsides: null }), jogo({ offsides: null }), jogo({ offsides: null })];
const jImp = avaliarJogo([comDado, comDado, comDado], impedSemDado, { etapa: "B" });
assert.ok(jImp.semDado.includes("impedimentos_1_5"));

console.log("screener: ok");
