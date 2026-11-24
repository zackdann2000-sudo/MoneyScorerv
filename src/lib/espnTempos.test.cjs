/* Suíte: src/lib/espnTempos.ts + nomesCompativeis (busca do fixture)
 *
 * Contexto real que gerou esta suíte: Chapecoense 3 x 0 Palmeiras.
 * O SportMonks não cobre Brasileirão no plano atual (só Premiership escocesa),
 * então `smFindFixtureId` devolvia null e a tela ficava sem 1º/2º tempo. O
 * ESPN tem o recorte de graça: `linescores` (placar por período) e `keyEvents`
 * (cartão com `period.number`).
 *
 * O que está protegido aqui:
 *  - placar por tempo vem de `linescores`, que já é do período (não cumulativo);
 *  - cartão vai para o lado certo pelo id do time;
 *  - jogo que não começou não publica 1º tempo;
 *  - matching de nome tolera "SE Palmeiras" e "Associação Chapecoense…".
 */
const assert = require("node:assert");
const { splitDoEspn, golsPorTempoEspn, cartoesPorTempoEspn } = require("./espnTempos.js");
const { nomesCompativeis } = require("./smTempos.js");

let ok = 0;
const teste = (nome, fn) => {
  try {
    fn();
    ok++;
    console.log(`✅ ${nome}`);
  } catch (e) {
    console.error(`❌ ${nome}\n   ${e.message}`);
    process.exitCode = 1;
  }
};

/* Resumo do ESPN recortado do jogo real (Chapecoense 3 x 0 Palmeiras, FT).
   `linescores` reais NÃO têm `period`: a ordem é que define o tempo. */
const SUMARIO = {
  header: {
    competitions: [
      {
        status: { type: { state: "post", detail: "FT" } },
        competitors: [
          {
            id: "9318",
            homeAway: "home",
            team: { id: "9318", displayName: "Chapecoense" },
            score: "3",
            linescores: [{ displayValue: "2" }, { displayValue: "1" }],
          },
          {
            id: "2029",
            homeAway: "away",
            team: { id: "2029", displayName: "Palmeiras" },
            score: "0",
            linescores: [{ displayValue: "0" }, { displayValue: "0" }],
          },
        ],
      },
    ],
  },
  keyEvents: [
    { period: { number: 1 }, type: { text: "Kickoff" }, team: { id: "9318" } },
    { period: { number: 1 }, type: { text: "Goal" }, team: { id: "9318" } },
    { period: { number: 1 }, type: { text: "Yellow Card" }, team: { id: "9318" } },
    { period: { number: 1 }, type: { text: "Yellow Card" }, team: { id: "9318" } },
    { period: { number: 2 }, type: { text: "Yellow Card" }, team: { id: "9318" } },
    { period: { number: 2 }, type: { text: "Yellow Card" }, team: { id: "2029" } },
    { period: { number: 2 }, type: { text: "Red Card" }, team: { id: "2029" } },
  ],
};

console.log("=== 1. Gols por tempo (linescores) ===");
teste("1º tempo: 2 x 0", () => {
  const g = golsPorTempoEspn(SUMARIO);
  assert.deepEqual(g.primeiroTempo.map((m) => [m.home, m.away]), [[2, 0]]);
});
teste("2º tempo: 1 x 0", () => {
  const g = golsPorTempoEspn(SUMARIO);
  assert.deepEqual(g.segundoTempo.map((m) => [m.home, m.away]), [[1, 0]]);
});
teste("soma dos tempos bate o placar final 3 x 0", () => {
  const g = golsPorTempoEspn(SUMARIO);
  assert.equal(g.primeiroTempo[0].home + g.segundoTempo[0].home, 3);
  assert.equal(g.primeiroTempo[0].away + g.segundoTempo[0].away, 0);
});
teste("formato com `period` explícito também funciona", () => {
  const comp = SUMARIO.header.competitions[0];
  const comPeriodo = {
    ...SUMARIO,
    header: {
      competitions: [
        {
          ...comp,
          competitors: comp.competitors.map((c) => ({
            ...c,
            linescores: c.linescores.map((l, i) => ({ ...l, period: i + 1 })),
          })),
        },
      ],
    },
  };
  const g = golsPorTempoEspn(comPeriodo);
  assert.equal(g.primeiroTempo[0].home, 2);
  assert.equal(g.segundoTempo[0].home, 1);
});
teste("linescores fora de ordem, mas com period, não trocam os tempos", () => {
  const comp = SUMARIO.header.competitions[0];
  const foraDeOrdem = {
    ...SUMARIO,
    header: {
      competitions: [
        {
          ...comp,
          competitors: comp.competitors.map((c) => ({
            ...c,
            linescores: [
              { displayValue: c.linescores[1].displayValue, period: 2 },
              { displayValue: c.linescores[0].displayValue, period: 1 },
            ],
          })),
        },
      ],
    },
  };
  const g = golsPorTempoEspn(foraDeOrdem);
  assert.equal(g.primeiroTempo[0].home, 2);
  assert.equal(g.segundoTempo[0].home, 1);
});
teste("lado invertido no array não troca o placar", () => {
  const comp = SUMARIO.header.competitions[0];
  const invertido = {
    ...SUMARIO,
    header: { competitions: [{ ...comp, competitors: [...comp.competitors].reverse() }] },
  };
  const g = golsPorTempoEspn(invertido);
  assert.equal(g.primeiroTempo[0].home, 2);
  assert.equal(g.primeiroTempo[0].away, 0);
});

console.log("\n=== 2. Cartões por tempo (keyEvents) ===");
teste("amarelos do 1º tempo: 2 x 0", () => {
  const c = cartoesPorTempoEspn(SUMARIO);
  const am = c.primeiroTempo.find((m) => m.key === "yellow_cards");
  assert.deepEqual([am.home, am.away], [2, 0]);
});
teste("amarelos do 2º tempo: 1 x 1", () => {
  const c = cartoesPorTempoEspn(SUMARIO);
  const am = c.segundoTempo.find((m) => m.key === "yellow_cards");
  assert.deepEqual([am.home, am.away], [1, 1]);
});
teste("vermelho do 2º tempo vai para o visitante", () => {
  const c = cartoesPorTempoEspn(SUMARIO);
  const vm = c.segundoTempo.find((m) => m.key === "red_cards");
  assert.deepEqual([vm.home, vm.away], [0, 1]);
});
teste("1º tempo sem vermelho não inventa a métrica", () => {
  const c = cartoesPorTempoEspn(SUMARIO);
  assert.equal(c.primeiroTempo.some((m) => m.key === "red_cards"), false);
});

console.log("\n=== 3. Split completo ===");
teste("gols vem antes de cartões no 1º tempo", () => {
  const s = splitDoEspn(SUMARIO);
  assert.equal(s.primeiroTempo[0].key, "goals");
});
teste("split completo tem gols e amarelos nos dois tempos", () => {
  const s = splitDoEspn(SUMARIO);
  for (const tempo of [s.primeiroTempo, s.segundoTempo]) {
    assert.ok(tempo.some((m) => m.key === "goals"));
    assert.ok(tempo.some((m) => m.key === "yellow_cards"));
  }
});
teste("jogo agendado (pre) não publica split", () => {
  const s = splitDoEspn({
    ...SUMARIO,
    header: { competitions: [{ ...SUMARIO.header.competitions[0], status: { type: { state: "pre" } } }] },
  });
  assert.equal(s.primeiroTempo.length, 0);
  assert.equal(s.segundoTempo.length, 0);
});
teste("resumo vazio não explode", () => {
  const s = splitDoEspn({});
  assert.equal(s.primeiroTempo.length, 0);
});

console.log("\n=== 4. Matching de nome do fixture (SportMonks) ===");
teste("Palmeiras = SE Palmeiras", () => {
  assert.equal(nomesCompativeis("Palmeiras", "SE Palmeiras"), true);
});
teste("Chapecoense = Associação Chapecoense de Futebol", () => {
  assert.equal(nomesCompativeis("Chapecoense", "Associação Chapecoense de Futebol"), true);
});
teste("acento não atrapalha (São Paulo)", () => {
  assert.equal(nomesCompativeis("Sao Paulo", "São Paulo FC"), true);
});
teste("times diferentes não casam", () => {
  assert.equal(nomesCompativeis("Palmeiras", "Corinthians"), false);
});
teste("prefixo igual de 6 letras casa (Botafogo)", () => {
  assert.equal(nomesCompativeis("Botafogo", "Botafogo FR"), true);
});
teste("nome vazio não casa com nada", () => {
  assert.equal(nomesCompativeis("", "Palmeiras"), false);
});

console.log(`\n${process.exitCode ? "FALHOU" : "OK"} — ${ok} asserção(ões) verde(s)`);
