const assert = require("assert");
const { mediaDe, indiceDoPapel, montarDuelos } = require("./duelosEngine.js");
const { MIN_AMOSTRA } = require("./playerPropsEngine.js");

/** Jogador sintético: `jogos` é a lista de objetos de estatística. */
const jog = (nome, lado, posicao, jogos) => ({
  id: `${lado}-${nome}`,
  nome,
  time: lado === "home" ? "Time A" : "Time B",
  lado,
  posicao,
  jogos,
});

const casa = [
  jog("Artilheiro", "home", "F", [
    { finalizacoes: 4, chutesNoGol: 2, gols: 1 },
    { finalizacoes: 5, chutesNoGol: 3, gols: 2 },
    { finalizacoes: 3, chutesNoGol: 1, gols: 0 },
    { finalizacoes: 6, chutesNoGol: 3, gols: 1 },
  ]),
  jog("Meia", "home", "M", [
    { finalizacoes: 1, chutesNoGol: 0, gols: 0 },
    { finalizacoes: 2, chutesNoGol: 1, gols: 0 },
    { finalizacoes: 1, chutesNoGol: 1, gols: 1 },
  ]),
];

const fora = [
  jog("Zagueiro Duro", "away", "D", [
    { faltasCometidas: 3, cartoes: 1, faltasSofridas: 1 },
    { faltasCometidas: 2, cartoes: 0, faltasSofridas: 2 },
    { faltasCometidas: 4, cartoes: 1, faltasSofridas: 0 },
    { faltasCometidas: 3, cartoes: 0, faltasSofridas: 1 },
  ]),
  jog("Volante Leve", "away", "M", [
    { faltasCometidas: 0, cartoes: 0, faltasSofridas: 2 },
    { faltasCometidas: 1, cartoes: 0, faltasSofridas: 1 },
    { faltasCometidas: 0, cartoes: 0, faltasSofridas: 3 },
  ]),
];

/* ---------- média por recência ---------- */
const m = mediaDe(casa[0], "finalizacoes");
assert.ok(m, "média existe com 4 jogos");
assert.strictEqual(m.amostra, 4);
// pesos 1..4: (4*1 + 5*2 + 3*3 + 6*4) / 10
assert.ok(Math.abs(m.media - (4 + 10 + 9 + 24) / 10) < 1e-9);

// abaixo do mínimo de amostra → null
const curto = jog("Curto", "home", "F", [{ finalizacoes: 3 }, { finalizacoes: 2 }]);
assert.strictEqual(mediaDe(curto, "finalizacoes"), null);
assert.ok(MIN_AMOSTRA >= 3);

// estatística que o jogador não tem → null
assert.strictEqual(mediaDe(casa[1], "defesas"), null);

/* ---------- índice composto ---------- */
const ia = indiceDoPapel(casa[0], "ameaca");
assert.ok(ia && ia.valor > 0, "atacante tem índice de ameaça");
const id = indiceDoPapel(fora[0], "muralha");
assert.ok(id && id.valor > 0, "zagueiro tem índice de muralha");
// zagueiro leve tem índice menor que o duro
assert.ok(indiceDoPapel(fora[1], "muralha").valor < id.valor);
// jogador ofensivo não tem índice de muralha (sem faltas/cartões na amostra)
assert.strictEqual(indiceDoPapel(casa[1], "muralha"), null);
// goleiro sem dados dos dois papéis → null
assert.strictEqual(indiceDoPapel(jog("GK", "home", "G", [{ defesas: 5 }, { defesas: 4 }, { defesas: 6 }]), "ameaca"), null);

/* ---------- duelos ---------- */
const duelos = montarDuelos([...casa, ...fora], { limite: 6 });
assert.ok(duelos.length > 0, "gera pelo menos um duelo");
assert.ok(duelos.length <= 6, "respeita o limite");

// ninguém aparece duas vezes
const nomes = duelos.flatMap((d) => [d.ameaca.nome, d.muralha.nome]);
assert.strictEqual(new Set(nomes).size, nomes.length, "sem jogador repetido");

// dominância sempre 0..100
for (const d of duelos) {
  assert.ok(d.dominancia >= 0 && d.dominancia <= 100);
  assert.ok(typeof d.leitura === "string" && d.leitura.length > 20);
  assert.ok(d.ameaca.media > 0 && d.muralha.media > 0);
  assert.ok(d.probChuteNoGol == null || (d.probChuteNoGol >= 0 && d.probChuteNoGol <= 1));
}

// o artilheiro contra o zagueiro duro deve aparecer
assert.ok(duelos.some((d) => d.ameaca.nome === "Artilheiro"), "artilheiro entra no confronto");

// jogador sem amostra suficiente nunca entra
const fraco = jog("Novato", "home", "F", [{ finalizacoes: 9, golss: 3 }]);
assert.strictEqual(montarDuelos([fraco, ...fora]).length, 0);

// só um lado → nenhum duelo
assert.strictEqual(montarDuelos(casa).length, 0);

// amostra vazia não quebra
assert.strictEqual(montarDuelos([]).length, 0);

// dominância responde à força: artilheiro forte x muralha fraca > artilheiro x muralha dura
const dueloFraco = montarDuelos([casa[0], fora[1]]);
const dueloDuro = montarDuelos([casa[0], fora[0]]);
if (dueloFraco.length && dueloDuro.length) {
  assert.ok(dueloFraco[0].dominancia > dueloDuro[0].dominancia, "muralha mais dura reduz a dominância");
}

console.log(`✅ duelosEngine ok — ${duelos.length} duelo(s) sintéticos, dominância ${duelos.map((d) => d.dominancia + "%").join(" ")}`);
