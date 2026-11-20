const assert = require("assert");
const {
  MERCADOS,
  acertou,
  recortarPeriodo,
  ranquear,
  contarElegiveis,
  maiorAmostra,
  mercadoPorId,
  extrairEstatisticasScoreboard,
} = require("./rankingsEngine.js");


const jogo = (o) => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  date: o.date ?? "2026-05-01",
  home: o.home ?? true,
  gf: o.gf,
  ga: o.ga,
  corners: o.corners ?? null,
  cards: o.cards ?? null,
});

const time = (nome, jogos, extra = {}) => ({
  id: nome.toLowerCase().replace(/\s/g, "-"),
  nome,
  escudo: "",
  liga: "Premier League",
  ligaCodigo: "eng.1",
  jogos,
  ...extra,
});

/* ---------- 1) mercados de placar ---------- */
assert.strictEqual(acertou("over15", jogo({ gf: 1, ga: 1 })), true);
assert.strictEqual(acertou("over15", jogo({ gf: 1, ga: 0 })), false);
assert.strictEqual(acertou("over25", jogo({ gf: 2, ga: 1 })), true);
assert.strictEqual(acertou("over25", jogo({ gf: 1, ga: 1 })), false);
assert.strictEqual(acertou("btts", jogo({ gf: 2, ga: 3 })), true);
assert.strictEqual(acertou("btts", jogo({ gf: 3, ga: 0 })), false);
assert.strictEqual(acertou("cleanSheet", jogo({ gf: 0, ga: 0 })), true, "0-0 ainda é clean sheet");
assert.strictEqual(acertou("cleanSheet", jogo({ gf: 2, ga: 1 })), false);

/* ---------- 2) mercados de estatística: sem dado é null, não false ---------- */
assert.strictEqual(acertou("over95corners", jogo({ gf: 1, ga: 1, corners: null })), null);
assert.strictEqual(acertou("over95corners", jogo({ gf: 1, ga: 1, corners: 10 })), true);
assert.strictEqual(acertou("over95corners", jogo({ gf: 1, ga: 1, corners: 9 })), false);
assert.strictEqual(acertou("over35cards", jogo({ gf: 1, ga: 1, cards: 4 })), true);
assert.strictEqual(acertou("over35cards", jogo({ gf: 1, ga: 1, cards: 3 })), false);
assert.strictEqual(acertou("over35cards", jogo({ gf: 1, ga: 1, cards: null })), null);

/* ---------- 3) jogo sem escanteios sai do denominador ---------- */
const semDado = time("Sem Dado", [
  jogo({ gf: 1, ga: 1, corners: 12 }),
  jogo({ gf: 1, ga: 1, corners: null }),
  jogo({ gf: 0, ga: 0, corners: 8 }),
]);
const r = ranquear([semDado], "over95corners", { periodo: 0, minJogos: 0 });
assert.strictEqual(r.length, 1);
assert.strictEqual(r[0].jogos, 2, "o jogo sem dado não conta como erro");
assert.strictEqual(r[0].acertos, 1);
assert.strictEqual(r[0].taxa, 0.5);

/* ---------- 4) período corta pelo mais recente ---------- */
const historico = [
  jogo({ date: "2026-05-10", gf: 3, ga: 0 }), // recente (over2.5 sim)
  jogo({ date: "2026-05-03", gf: 0, ga: 1 }), // over2.5 não
  jogo({ date: "2026-04-26", gf: 4, ga: 2 }), // over2.5 sim (fora dos últimos 2)
];
assert.strictEqual(recortarPeriodo(historico, 2).length, 2);
assert.strictEqual(recortarPeriodo(historico, 2)[0].date, "2026-05-10");
assert.strictEqual(recortarPeriodo(historico, 0).length, 3);
const p2 = ranquear([time("Time A", historico)], "over25", { periodo: 2 });
assert.strictEqual(p2[0].jogos, 2);
assert.strictEqual(p2[0].acertos, 1);

/* ---------- 5) minJogos filtra por amostra VÁLIDA ---------- */
const curto = time("Curto", [jogo({ gf: 2, ga: 2 }), jogo({ gf: 1, ga: 1 })]);
assert.strictEqual(ranquear([curto], "over25", { minJogos: 7 }).length, 0);
assert.strictEqual(ranquear([curto], "over25", { minJogos: 0 }).length, 1);
assert.strictEqual(contarElegiveis([curto], "over25", 10, 7), 0);

/* ---------- 6) ordenação: taxa, depois amostra ---------- */
const ranking = ranquear(
  [
    time("Nove de Dez", Array.from({ length: 10 }, (_, i) => jogo({ gf: 2, ga: 2, date: `2026-05-${10 + i}` }))),
    time("Sete de Sete", Array.from({ length: 7 }, (_, i) => jogo({ gf: 2, ga: 2, date: `2026-05-${10 + i}` }))),
    time(
      "Cinco de Dez",
      Array.from({ length: 10 }, (_, i) => jogo({ gf: i < 5 ? 2 : 0, ga: i < 5 ? 2 : 0, date: `2026-05-${10 + i}` })),
    ),
  ],
  "btts",
  { periodo: 0 },
);
assert.strictEqual(ranking[0].nome, "Nove de Dez", "mesma taxa: quem tem amostra maior vem primeiro");
assert.strictEqual(ranking[1].nome, "Sete de Sete");
assert.strictEqual(ranking[2].nome, "Cinco de Dez");
assert.strictEqual(ranking[2].taxa, 0.5);
assert.strictEqual(maiorAmostra([curto, semDado], 0), 3);

/* ---------- 7) parser do scoreboard (fixture offline) ---------- */
const fixture = {
  events: [
    {
      id: "1",
      competitions: [
        {
          status: { type: { state: "post", completed: true } },
          competitors: [
            { statistics: [{ name: "wonCorners", displayValue: "7" }] },
            { statistics: [{ name: "wonCorners", displayValue: "3" }] },
          ],
          details: [{ yellowCard: true }, { yellowCard: true }, { redCard: true }, { scoringPlay: true }],
        },
      ],
    },
    {
      id: "2", // em andamento: não entra
      competitions: [
        {
          status: { type: { state: "in", completed: false } },
          competitors: [{ statistics: [{ name: "wonCorners", displayValue: "2" }] }],
          details: [],
        },
      ],
    },
    {
      id: "3", // sem estatística publicada: corners null
      competitions: [
        { status: { type: { state: "post", completed: true } }, competitors: [{ statistics: [] }], details: [] },
      ],
    },
  ],
};
const st = extrairEstatisticasScoreboard(fixture);
assert.strictEqual(st.get("1").corners, 10, "escanteios são o total do jogo");
assert.strictEqual(st.get("1").cards, 3, "2 amarelos + 1 vermelho");
assert.strictEqual(st.has("2"), false, "jogo ao vivo fica fora");
assert.strictEqual(st.get("3").corners, null, "sem publicação = null, nunca 0");
assert.strictEqual(st.get("3").cards, null);
assert.strictEqual(extrairEstatisticasScoreboard(null).size, 0);

/* ---------- 8) mercado inválido cai no padrão Over 2.5 ---------- */
assert.strictEqual(mercadoPorId("nao-existe").id, "over25");
assert.strictEqual(mercadoPorId(undefined).id, "over25");
assert.strictEqual(MERCADOS.length, 6);
assert.deepStrictEqual(
  MERCADOS.filter((m) => m.precisaEstat).map((m) => m.id),
  ["over95corners", "over35cards"],
);

console.log(
  `✅ rankingsEngine ok — ${MERCADOS.length} mercados · topo: ${ranking[0].nome} ${(ranking[0].taxa * 100).toFixed(0)}% · parser: ${st.size} jogos`,
);
