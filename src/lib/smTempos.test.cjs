/* Suíte: src/lib/smTempos.ts
 *
 * O que está sendo protegido:
 *  - `periods.type_id` 1 = 1º tempo e 2 = 2º tempo (o "split" que a UI usa);
 *  - mando (home/away) vem de `meta.location`, NUNCA da ordem do array — se
 *    isso inverter, a tela mostra o número do time errado;
 *  - gols do 2º tempo por diferença quando só existe o cumulativo;
 *  - métrica não publicada não entra na lista (nada de 0 inventado).
 */
const assert = require("node:assert");
const {
  chaveStatSM,
  valorStatSM,
  mapaDeLado,
  smMetricas,
  smGolsPorTempo,
  splitDoFixture,
} = require("./smTempos.js");

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

/* ------------------------- helpers de fixture ------------------------- */

const PARTICIPANTES = [
  { id: 10, name: "Casa FC", meta: { location: "home" } },
  { id: 20, name: "Fora FC", meta: { location: "away" } },
];

const stat = (participant_id, nome, valor) => ({
  participant_id,
  type: { name: nome, developer_name: nome },
  data: { value: valor },
});

console.log("=== 1. Normalização de nome e valor ===");
teste("nome com espaço e maiúscula vira chave", () => {
  assert.equal(chaveStatSM("Ball Possession"), "ballpossession");
});
teste("nome com underscore vira chave", () => {
  assert.equal(chaveStatSM("ball_possession"), "ballpossession");
});
teste("acento não atrapalha", () => {
  assert.equal(chaveStatSM("Finalizações"), "finalizacoes");
});
teste("valor percentual vira número", () => {
  assert.equal(valorStatSM("54%"), 54);
});
teste("valor com vírgula decimal", () => {
  assert.equal(valorStatSM("1,75"), 1.75);
});
teste("valor nulo continua nulo (não vira 0)", () => {
  assert.equal(valorStatSM(null), null);
});
teste("texto não numérico vira nulo", () => {
  assert.equal(valorStatSM("abc"), null);
});

console.log("\n=== 2. Mando pelo meta.location ===");
teste("mapa de lado usa meta.location", () => {
  const m = mapaDeLado(PARTICIPANTES);
  assert.equal(m.get(10), "home");
  assert.equal(m.get(20), "away");
});
teste("mando invertido na ordem do array é respeitado", () => {
  const m = mapaDeLado([
    { id: 20, meta: { location: "away" } },
    { id: 10, meta: { location: "home" } },
  ]);
  assert.equal(m.get(20), "away");
  assert.equal(m.get(10), "home");
});
teste("participante sem location é ignorado", () => {
  const m = mapaDeLado([{ id: 30, meta: {} }]);
  assert.equal(m.size, 0);
});

console.log("\n=== 3. Métricas de um período ===");
teste("posse vai para o lado certo", () => {
  const m = smMetricas(
    [stat(10, "Ball Possession", 54), stat(20, "Ball Possession", 46)],
    mapaDeLado(PARTICIPANTES)
  );
  const posse = m.find((x) => x.key === "ball_possession");
  assert.equal(posse.home, 54);
  assert.equal(posse.away, 46);
  assert.equal(posse.percent, true);
});
teste("métrica desconhecida não entra", () => {
  const m = smMetricas([stat(10, "Throw Ins", 12)], mapaDeLado(PARTICIPANTES));
  assert.equal(m.length, 0);
});
teste("métrica ausente de um lado vira 0 só porque o outro publicou", () => {
  const m = smMetricas([stat(10, "Corners", 7)], mapaDeLado(PARTICIPANTES));
  const c = m.find((x) => x.key === "corner_kicks");
  assert.equal(c.home, 7);
  assert.equal(c.away, 0);
});
teste("tipo repetido no mesmo período soma", () => {
  const m = smMetricas(
    [stat(10, "Shots Total", 3), stat(10, "Shots Total", 4)],
    mapaDeLado(PARTICIPANTES)
  );
  assert.equal(m.find((x) => x.key === "total_shots").home, 7);
});

console.log("\n=== 4. Gols por tempo (scores) ===");
teste("1º tempo usa type_id 1", () => {
  const g = smGolsPorTempo(
    [
      { type_id: 1, participant_id: 10, score: { goals: 1 } },
      { type_id: 1, participant_id: 20, score: { goals: 0 } },
      { type_id: 2, participant_id: 10, score: { goals: 3 } },
    ],
    mapaDeLado(PARTICIPANTES)
  );
  assert.equal(g.primeiroTempo.home, 1);
  assert.equal(g.primeiroTempo.away, 0);
});
teste("2º tempo por diferença do cumulativo (3 - 1 = 2)", () => {
  const g = smGolsPorTempo(
    [
      { type_id: 1, participant_id: 10, score: { goals: 1 } },
      { type_id: 2, participant_id: 10, score: { goals: 3 } },
    ],
    mapaDeLado(PARTICIPANTES)
  );
  assert.equal(g.segundoTempo.home, 2);
});
teste("2º tempo usa 48996 (2ND_HALF_ONLY) quando existir", () => {
  const g = smGolsPorTempo(
    [
      { type_id: 1, participant_id: 10, score: { goals: 1 } },
      { type_id: 2, participant_id: 10, score: { goals: 3 } },
      { type_id: 48996, participant_id: 10, score: { goals: 2 } },
    ],
    mapaDeLado(PARTICIPANTES)
  );
  assert.equal(g.segundoTempo.home, 2);
});
teste("sem scores não inventa gol", () => {
  const g = smGolsPorTempo([], mapaDeLado(PARTICIPANTES));
  assert.equal(g.primeiroTempo, null);
  assert.equal(g.segundoTempo, null);
});

console.log("\n=== 5. Fixture completo: total + 1º/2º tempo ===");
const FIXTURE = {
  id: 999,
  state_id: 5,
  state: { state: "FT" },
  participants: PARTICIPANTES,
  statistics: [stat(10, "Ball Possession", 54), stat(20, "Ball Possession", 46)],
  periods: [
    {
      type_id: 1,
      statistics: [stat(10, "Ball Possession", 58), stat(20, "Ball Possession", 42)],
    },
    {
      type_id: 2,
      statistics: [stat(10, "Ball Possession", 51), stat(20, "Ball Possession", 49)],
    },
  ],
  scores: [
    { type_id: 1, participant_id: 10, score: { goals: 1 } },
    { type_id: 1, participant_id: 20, score: { goals: 1 } },
    { type_id: 2, participant_id: 10, score: { goals: 2 } },
    { type_id: 2, participant_id: 20, score: { goals: 1 } },
  ],
};

teste("total vem do statistics sem período", () => {
  const r = splitDoFixture(FIXTURE);
  assert.equal(r.metrics.find((m) => m.key === "ball_possession").home, 54);
});
teste("1º tempo usa o período type_id 1", () => {
  const r = splitDoFixture(FIXTURE);
  assert.equal(r.primeiroTempo.find((m) => m.key === "ball_possession").home, 58);
});
teste("2º tempo usa o período type_id 2", () => {
  const r = splitDoFixture(FIXTURE);
  assert.equal(r.segundoTempo.find((m) => m.key === "ball_possession").home, 51);
});
teste("gols do 2º tempo entram na frente da lista", () => {
  const r = splitDoFixture(FIXTURE);
  assert.equal(r.segundoTempo[0].key, "goals");
  assert.equal(r.segundoTempo[0].home, 1); // 2 (cumulativo) - 1 (1º tempo)
  assert.equal(r.segundoTempo[0].away, 0); // 1 - 1
});
teste("gols do 1º tempo corretos", () => {
  const r = splitDoFixture(FIXTURE);
  assert.equal(r.primeiroTempo[0].key, "goals");
  assert.equal(r.primeiroTempo[0].home, 1);
  assert.equal(r.primeiroTempo[0].away, 1);
});
teste("finalizada pelo state_id 5", () => {
  assert.equal(splitDoFixture(FIXTURE).finalizada, true);
});
teste("jogo em andamento não é finalizada", () => {
  assert.equal(splitDoFixture({ ...FIXTURE, state_id: 2, state: { state: "INPLAY" } }).finalizada, false);
});
teste("sem período publicado sobram só os gols por tempo da fonte", () => {
  const r = splitDoFixture({ ...FIXTURE, periods: [] });
  assert.equal(r.primeiroTempo.length, 1);
  assert.equal(r.primeiroTempo[0].key, "goals");
  assert.equal(r.segundoTempo.length, 1);
});

teste("jogo agendado não publica gol por tempo (0-0 viraria número falso)", () => {
  const r = splitDoFixture({
    ...FIXTURE,
    state_id: 1,
    state: { state: "NS" },
    periods: [],
    statistics: [],
    scores: [
      { type_id: 1, participant_id: 10, score: { goals: 0 } },
      { type_id: 1, participant_id: 20, score: { goals: 0 } },
    ],
  });
  assert.equal(r.primeiroTempo.length, 0);
  assert.equal(r.segundoTempo.length, 0);
});
teste("fixture nulo não explode", () => {
  const r = splitDoFixture(null);
  assert.equal(r.metrics.length, 0);
  assert.equal(r.finalizada, false);
});

console.log(`\n${process.exitCode ? "FALHOU" : "OK"} — ${ok} asserção(ões) verde(s)`);
