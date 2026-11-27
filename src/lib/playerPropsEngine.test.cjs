const assert = require("assert");
const {
  pesosRecencia,
  mediaPonderada,
  poissonOver,
  poissonUnder,
  coefVariacao,
  calcularProp,
  topDoMercado,
  montarCards,
  MERCADOS,
  PESO_H2H,
  acertoDaSerie,
  JANELAS_ACERTO,
  montarDestaques,
  LINHA_DESTAQUE,
} = require("./playerPropsEngine.js");

const perto = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// pesos crescentes: 1..n
assert.deepStrictEqual(pesosRecencia(3), [1, 2, 3]);

// média ponderada ignora jogos sem o dado
assert.ok(perto(mediaPonderada([1, 2, 3], [1, 2, 3]), (1 * 1 + 2 * 2 + 3 * 3) / 6));
assert.strictEqual(mediaPonderada([null, undefined]), null);
assert.ok(perto(mediaPonderada([0, null, 2], [1, 2, 3]), (0 * 1 + 2 * 3) / 4));

// Poisson: P(X>=1 | λ=1) = 1 - e^-1
assert.ok(perto(poissonOver(1, 0.5), 1 - Math.exp(-1), 1e-9));
// P(X>=2 | λ=2.5) = 1 - e^-2.5(1+2.5)
assert.ok(perto(poissonOver(2.5, 1.5), 1 - Math.exp(-2.5) * 3.5, 1e-9));
// P(X>=3 | λ=2.5)
assert.ok(perto(poissonOver(2.5, 2.5), 1 - Math.exp(-2.5) * (1 + 2.5 + 3.125), 1e-9));
// over + under = 1 nas linhas .5
for (const l of [0.5, 1.5, 2.5, 3.5]) {
  assert.ok(perto(poissonOver(1.8, l) + poissonUnder(1.8, l), 1, 1e-9), `linha ${l}`);
}
// lambda 0 → nunca passa (over 0) e sempre fica abaixo (under 1)
assert.strictEqual(poissonOver(0, 0.5), 0);
assert.strictEqual(poissonUnder(0, 0.5), 1);

// dispersão: série constante → cv 0
assert.strictEqual(coefVariacao([2, 2, 2, 2], 2), 0);
assert.ok(coefVariacao([0, 4], 2) > 0.9);

// jogador de amostra
const jogador = {
  id: "p1",
  nome: "Atacante",
  time: "Time A",
  lado: "home",
  posicao: "F",
  jogos: [
    { finalizacoes: 1 },
    { finalizacoes: 2 },
    { finalizacoes: 3 },
    { finalizacoes: 2 },
  ],
};
const mercadoFin = MERCADOS.find((m) => m.id === "finalizacoes");
const prop = calcularProp(jogador, mercadoFin);
// média ponderada = (1*1 + 2*2 + 3*3 + 2*4) / (1+2+3+4) = 22/10 = 2.2
assert.ok(perto(prop.media, 2.2, 1e-3));
assert.ok(perto(prop.lambda, 2.2, 1e-3));
assert.strictEqual(prop.amostra, 4);
assert.ok(prop.probOver > 0.5 && prop.probOver < 0.7, String(prop.probOver));
assert.ok(prop.confianca > 0.4 && prop.confianca <= 0.99);

// blend H2H: media 2.2 e h2h 4.0 → 2.2*(1-0.3) + 4*0.3
const comH2H = calcularProp(jogador, mercadoFin, [4, 4, 4, 4]);
assert.ok(perto(comH2H.lambda, 2.2 * (1 - PESO_H2H) + 4 * PESO_H2H, 1e-3));
assert.ok(perto(comH2H.mediaH2H, 4, 1e-3));
assert.ok(comH2H.probOver > prop.probOver);

// amostra mínima
assert.strictEqual(calcularProp({ ...jogador, jogos: [{ finalizacoes: 3 }, { finalizacoes: 2 }] }, mercadoFin), null);

// mercados com restrição de posição (defesas só para goleiro)
const mercadoDef = MERCADOS.find((m) => m.id === "defesas");
assert.strictEqual(calcularProp({ ...jogador, jogos: [{ defesas: 4 }, { defesas: 5 }, { defesas: 3 }] }, mercadoDef), null);
const gk = calcularProp(
  { ...jogador, id: "gk", posicao: "G", jogos: [{ defesas: 4 }, { defesas: 5 }, { defesas: 3 }] },
  mercadoDef,
);
assert.ok(gk && gk.probOver > 0.6);

// ranking top 3: melhor média primeiro
const elenco = [
  { ...jogador, id: "a", nome: "A", jogos: [{ finalizacoes: 3 }, { finalizacoes: 3 }, { finalizacoes: 3 }] },
  { ...jogador, id: "b", nome: "B", jogos: [{ finalizacoes: 1 }, { finalizacoes: 1 }, { finalizacoes: 1 }] },
  { ...jogador, id: "c", nome: "C", jogos: [{ finalizacoes: 2 }, { finalizacoes: 2 }, { finalizacoes: 2 }] },
  { ...jogador, id: "d", nome: "D", jogos: [{ finalizacoes: 0 }, { finalizacoes: 0 }, { finalizacoes: 0 }] },
];
const top = topDoMercado(elenco, mercadoFin, {}, 3);
assert.deepStrictEqual(top.map((p) => p.nome), ["A", "C", "B"]);

// cards: só mercados com pelo menos 1 jogador elegível
const cards = montarCards([{ ...jogador, posicao: "G", jogos: [{ defesas: 5 }, { defesas: 4 }, { defesas: 6 }] }]);
assert.ok(cards.some((c) => c.mercado.id === "defesas"));
assert.ok(!cards.some((c) => c.mercado.id === "gols"));

// ── Hit rate L3/L5/L10 ────────────────────────────────────────────────────
// `jogador` tem finalizações [1,2,3,2] e a linha do mercado é 1.5 (Over 1.5
// = 2 ou mais). Passaram: 2, 3, 2 → 3 de 4.
assert.deepStrictEqual(JANELAS_ACERTO, [3, 5, 10]);
assert.deepStrictEqual(prop.acerto.l3, { acertos: 3, amostra: 3, taxa: 100 });
assert.deepStrictEqual(prop.acerto.l5, { acertos: 3, amostra: 4, taxa: 75 });
assert.deepStrictEqual(prop.acerto.l10, { acertos: 3, amostra: 4, taxa: 75 });

// null não vira zero e a janela conta JOGOS, não valores: [1,null,2] tem 2
// jogos com dado na L3 → abaixo de MIN_AMOSTRA → null (a UI desenha "—").
const comBuraco = acertoDaSerie([1, null, 2, null, 3], 1.5);
assert.strictEqual(comBuraco.l3, null);
assert.deepStrictEqual(comBuraco.l5, { acertos: 2, amostra: 3, taxa: 67 });

// janela maior que a série não inventa jogo: 10 janela, 3 jogos reais
assert.deepStrictEqual(acertoDaSerie([3, 3, 3], 1.5).l10, { acertos: 3, amostra: 3, taxa: 100 });

// linha vs "pelo menos": Over 0.5 exige 1+, então um jogo de 0 conta como erro
assert.deepStrictEqual(acertoDaSerie([0, 1, 0], 0.5).l3, { acertos: 1, amostra: 3, taxa: 33 });

// série sem nenhum valor → as 3 janelas null (nunca "100% de 1 jogo")
assert.deepStrictEqual(acertoDaSerie([null, null], 1.5), { l3: null, l5: null, l10: null });

// Hit rate também no Scout do Hub (DestaqueJogador), com a mesma conta:
// [3,3,3] contra a linha 1.5 de finalizações → 3 de 3 nas três janelas.
const destaques = montarDestaques([
  { ...jogador, id: "s1", nome: "S1", jogos: [{ finalizacoes: 3 }, { finalizacoes: 3 }, { finalizacoes: 3 }] },
]);
const cardFinalizacoes = destaques.find((g) => g.id === "finalizacoes");
const item = cardFinalizacoes?.itens.find((i) => i.jogadorId === "s1");
assert.ok(item, "destaque de finalizações presente");
assert.strictEqual(item.linhaReferencia, 1.5);
assert.deepStrictEqual(item.acerto.l10, { acertos: 3, amostra: 3, taxa: 100 });
// linha de referência do cartão é 0.5 e a do goleiro 2.5 (iguais às de MERCADOS)
assert.strictEqual(LINHA_DESTAQUE.cartoes, 0.5);
assert.strictEqual(LINHA_DESTAQUE.defesas, 2.5);

console.log("playerPropsEngine ok");