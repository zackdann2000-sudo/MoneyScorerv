/**
 * Teste da regra de desempate. Roda sem rede e sem banco.
 *
 * Os dois retratos abaixo são DADO REAL, capturado do Football-Data.org por
 * `scripts/probe-tiebreak.mjs` na temporada 2026. Não são inventados: é
 * justamente por isso que eles pegam o bug.
 *
 * O caso central é o Brasileirão: Vitória e Mirassol têm 41 pontos.
 *   - por saldo de gols (regra europeia)  -> Mirassol fica em 14º
 *   - por vitórias    (regra brasileira)  -> Vitória  fica em 14º
 * O fornecedor publica Vitória em 14º. A regra europeia INVERTE a tabela.
 */
const assert = require("node:assert/strict");
const {
  DESEMPATE_PADRAO,
  DESEMPATE_BRASIL,
  regraPara,
  validarLinhas,
  ordenarTabela,
  explicaPosicao,
} = require("./tiebreak.js");

let ok = 0;
const teste = (nome, fn) => {
  try {
    fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (e) {
    console.error(`  FAIL ${nome}`);
    throw e;
  }
};

/* ===== dado real: Brasileirão Série A, temporada 2026 ===== */
const tabelaBrasil = [
  { position: 1, name: "CR Flamengo", points: 80, won: 24, draw: 8, goalDifference: 43, goalsFor: 74 },
  { position: 2, name: "SE Palmeiras", points: 74, won: 21, draw: 11, goalDifference: 38, goalsFor: 64 },
  { position: 3, name: "Cruzeiro EC", points: 66, won: 20, draw: 6, goalDifference: 9, goalsFor: 59 },
  { position: 4, name: "Fluminense FC", points: 60, won: 17, draw: 9, goalDifference: 14, goalsFor: 56 },
  { position: 5, name: "CA Paranaense", points: 54, won: 15, draw: 9, goalDifference: 7, goalsFor: 52 },
  { position: 6, name: "EC Bahia", points: 54, won: 14, draw: 12, goalDifference: 4, goalsFor: 50 },
  { position: 7, name: "CA Mineiro", points: 51, won: 14, draw: 9, goalDifference: 4, goalsFor: 44 },
  { position: 8, name: "Santos FC", points: 50, won: 13, draw: 11, goalDifference: 2, goalsFor: 51 },
  { position: 9, name: "RB Bragantino", points: 47, won: 13, draw: 8, goalDifference: 4, goalsFor: 45 },
  { position: 10, name: "CR Vasco da Gama", points: 47, won: 13, draw: 8, goalDifference: -4, goalsFor: 47 },
  { position: 11, name: "Coritiba FBC", points: 45, won: 12, draw: 9, goalDifference: -11, goalsFor: 41 },
  { position: 12, name: "São Paulo FC", points: 44, won: 12, draw: 8, goalDifference: -1, goalsFor: 39 },
  { position: 13, name: "Botafogo FR", points: 42, won: 11, draw: 9, goalDifference: -11, goalsFor: 46 },
  // ↓ o par que separa as duas regras
  { position: 14, name: "EC Vitória", points: 41, won: 11, draw: 8, goalDifference: -15, goalsFor: 37 },
  { position: 15, name: "Mirassol FC", points: 41, won: 10, draw: 11, goalDifference: -9, goalsFor: 39 },
  { position: 16, name: "SC Corinthians", points: 40, won: 10, draw: 10, goalDifference: -2, goalsFor: 40 },
  { position: 17, name: "SC Internacional", points: 38, won: 9, draw: 11, goalDifference: -5, goalsFor: 39 },
  { position: 18, name: "Grêmio FBPA", points: 38, won: 9, draw: 11, goalDifference: -9, goalsFor: 38 },
  { position: 19, name: "Clube do Remo", points: 32, won: 7, draw: 11, goalDifference: -18, goalsFor: 39 },
  { position: 20, name: "Chapecoense AF", points: 21, won: 4, draw: 9, goalDifference: -40, goalsFor: 34 },
];

/* ===== dado real: Serie A (ITA), temporada 2026 ===== */
const tabelaItalia = [
  { position: 1, name: "SS Lazio", points: 32, won: 10, draw: 2, goalDifference: 19, goalsFor: 28 },
  { position: 2, name: "AS Roma", points: 30, won: 9, draw: 3, goalDifference: 25, goalsFor: 36 },
  { position: 3, name: "FC Internazionale", points: 28, won: 9, draw: 1, goalDifference: 15, goalsFor: 28 },
  { position: 4, name: "AC Milan", points: 27, won: 8, draw: 3, goalDifference: 11, goalsFor: 25 },
  { position: 5, name: "Como 1907", points: 26, won: 8, draw: 2, goalDifference: 10, goalsFor: 20 },
  { position: 6, name: "Juventus FC", points: 21, won: 6, draw: 3, goalDifference: 7, goalsFor: 19 },
  { position: 7, name: "Frosinone Calcio", points: 20, won: 6, draw: 2, goalDifference: 8, goalsFor: 25 },
  { position: 8, name: "SSC Napoli", points: 18, won: 5, draw: 3, goalDifference: 5, goalsFor: 19 },
  { position: 9, name: "Bologna FC 1909", points: 18, won: 5, draw: 3, goalDifference: 2, goalsFor: 17 },
  { position: 10, name: "Genoa CFC", points: 16, won: 5, draw: 1, goalDifference: -3, goalsFor: 13 },
  { position: 11, name: "Cagliari Calcio", points: 16, won: 5, draw: 1, goalDifference: -7, goalsFor: 10 },
  { position: 12, name: "Atalanta BC", points: 14, won: 4, draw: 2, goalDifference: -3, goalsFor: 17 },
  { position: 13, name: "Torino FC", points: 14, won: 4, draw: 2, goalDifference: -3, goalsFor: 15 },
  { position: 14, name: "US Lecce", points: 10, won: 3, draw: 1, goalDifference: -13, goalsFor: 12 },
  { position: 15, name: "ACF Fiorentina", points: 9, won: 2, draw: 3, goalDifference: -8, goalsFor: 17 },
  { position: 16, name: "Parma Calcio", points: 8, won: 2, draw: 2, goalDifference: -12, goalsFor: 10 },
  { position: 17, name: "US Sassuolo", points: 8, won: 2, draw: 2, goalDifference: -15, goalsFor: 16 },
  { position: 18, name: "AC Monza", points: 7, won: 2, draw: 1, goalDifference: -8, goalsFor: 17 },
  // ↓ o par que separa as duas regras (espelho do caso brasileiro)
  { position: 19, name: "Udinese Calcio", points: 6, won: 1, draw: 3, goalDifference: -13, goalsFor: 13 },
  { position: 20, name: "Venezia FC", points: 6, won: 2, draw: 0, goalDifference: -17, goalsFor: 8 },
];

const ordem = (tabela, regra) => ordenarTabela(tabela, regra).map((l) => l.name);
const posicaoDe = (tabela, regra, nome) =>
  ordenarTabela(tabela, regra).find((l) => l.name === nome).position;

console.log("\n── resolução da regra por competição");
teste("BSA usa a regra brasileira (vitórias antes de saldo)", () => {
  assert.deepEqual(regraPara("BSA"), DESEMPATE_BRASIL);
  assert.deepEqual(regraPara("bsa"), DESEMPATE_BRASIL); // case-insensitive
});
teste("SA usa o padrão (saldo antes de vitórias)", () => {
  assert.deepEqual(regraPara("SA"), DESEMPATE_PADRAO);
});
teste("código desconhecido cai no padrão, não explode", () => {
  assert.deepEqual(regraPara("XPTO"), DESEMPATE_PADRAO);
  assert.deepEqual(regraPara(null), DESEMPATE_PADRAO);
});

console.log("\n── Brasileirão: a regra brasileira reproduz o fornecedor");
teste("tabela inteira bate 100% com a position oficial", () => {
  const ordenada = ordenarTabela(tabelaBrasil, DESEMPATE_BRASIL);
  ordenada.forEach((linha, i) => {
    assert.equal(linha.position, i + 1, `posicao sequencial de ${linha.name}`);
    assert.equal(
      linha.position,
      tabelaBrasil.find((t) => t.name === linha.name).position,
      `posicao oficial de ${linha.name}`,
    );
  });
});
teste("Vitória fica em 14º e Mirassol em 15º", () => {
  assert.equal(posicaoDe(tabelaBrasil, DESEMPATE_BRASIL, "EC Vitória"), 14);
  assert.equal(posicaoDe(tabelaBrasil, DESEMPATE_BRASIL, "Mirassol FC"), 15);
});
teste("a regra europeia INVERTE esse par (o bug que evitamos)", () => {
  assert.equal(posicaoDe(tabelaBrasil, DESEMPATE_PADRAO, "Mirassol FC"), 14);
  assert.equal(posicaoDe(tabelaBrasil, DESEMPATE_PADRAO, "EC Vitória"), 15);
});

console.log("\n── Serie A: a regra europeia reproduz o fornecedor");
teste("tabela inteira bate 100% com a position oficial", () => {
  const ordenada = ordenarTabela(tabelaItalia, DESEMPATE_PADRAO);
  ordenada.forEach((linha) => {
    assert.equal(linha.position, tabelaItalia.find((t) => t.name === linha.name).position);
  });
});
teste("Udinese fica em 19º e Venezia em 20º", () => {
  assert.equal(posicaoDe(tabelaItalia, DESEMPATE_PADRAO, "Udinese Calcio"), 19);
  assert.equal(posicaoDe(tabelaItalia, DESEMPATE_PADRAO, "Venezia FC"), 20);
});
teste("a regra brasileira INVERTE esse par", () => {
  assert.equal(posicaoDe(tabelaItalia, DESEMPATE_BRASIL, "Venezia FC"), 19);
  assert.equal(posicaoDe(tabelaItalia, DESEMPATE_BRASIL, "Udinese Calcio"), 20);
});

console.log("\n── o comparador não fica cego");
teste("campo exigido ausente lança em vez de virar zero", () => {
  const semVitorias = [{ name: "X", points: 10, goalDifference: 5, goalsFor: 20 }];
  assert.throws(() => validarLinhas(semVitorias, DESEMPATE_BRASIL), /campo "won"/);
});
teste("campo não numérico lança", () => {
  const sujo = [{ name: "X", points: 10, won: "11", goalDifference: 5, goalsFor: 20 }];
  assert.throws(() => validarLinhas(sujo, DESEMPATE_BRASIL), /não numérico/);
});
teste("ordenarTabela também recusa tabela incompleta", () => {
  const semSaldo = [{ name: "X", points: 10, won: 3, goalsFor: 20 }];
  assert.throws(() => ordenarTabela(semSaldo, DESEMPATE_BRASIL), /goalDifference/);
});

console.log("\n── estabilidade e determinismo");
teste("não muta a entrada", () => {
  const copia = JSON.parse(JSON.stringify(tabelaBrasil));
  ordenarTabela(tabelaBrasil, DESEMPATE_BRASIL);
  assert.deepEqual(tabelaBrasil, copia);
});
teste("empate total cai na position do fornecedor, não no acaso", () => {
  const empatados = [
    { name: "Time B", points: 10, won: 3, goalDifference: 2, goalsFor: 8, position: 12 },
    { name: "Time A", points: 10, won: 3, goalDifference: 2, goalsFor: 8, position: 11 },
  ];
  assert.deepEqual(ordem(empatados, DESEMPATE_BRASIL), ["Time A", "Time B"]);
});
teste("empate total sem position cai no nome (ordem total)", () => {
  const empatados = [
    { name: "Zebra", points: 10, won: 3, goalDifference: 2, goalsFor: 8 },
    { name: "Alfa", points: 10, won: 3, goalDifference: 2, goalsFor: 8 },
  ];
  assert.deepEqual(ordem(empatados, DESEMPATE_BRASIL), ["Alfa", "Zebra"]);
});
teste("ordenação repetida dá a mesma ordem (sem dança na UI)", () => {
  const a = ordem(tabelaBrasil, DESEMPATE_BRASIL);
  const b = ordem(tabelaBrasil, DESEMPATE_BRASIL);
  assert.deepEqual(a, b);
});
teste("empate que sobrou para o fornecedor marca confiavel=false", () => {
  const empatados = [
    { name: "A", points: 10, won: 3, goalDifference: 2, goalsFor: 8, position: 1 },
    { name: "B", points: 10, won: 3, goalDifference: 2, goalsFor: 8, position: 2 },
  ];
  assert.equal(ordenarTabela(empatados, DESEMPATE_BRASIL).confiavel, false);
  assert.equal(ordenarTabela(tabelaBrasil, DESEMPATE_BRASIL).confiavel, true);
});

console.log("\n── rótulo para a UI");
teste("explicaPosicao descreve a regra em português", () => {
  assert.equal(explicaPosicao(DESEMPATE_BRASIL), "pontos › vitórias › saldo de gols › gols pró");
  assert.equal(explicaPosicao(DESEMPATE_PADRAO), "pontos › saldo de gols › gols pró");
});

console.log(`\n${ok} teste(s) ok\n`);
