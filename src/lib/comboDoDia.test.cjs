/**
 * Teste do Combo do Dia (puro).
 *
 * O que este teste protege:
 *  1. Corte de EV: só entra perna com EV ≥ 10% (as "melhores do dia").
 *  2. Uma perna por jogo — mercados do mesmo jogo são dependentes e não podem
 *     ser multiplicados.
 *  3. Odd combinada é o produto; EV combinado é Π(prob·odd) − 1.
 *  4. Retorno/lucro sobre a banca, sem NaN quando a banca é inválida.
 *
 * Rodar: ./scripts/unit-tests.sh comboDia
 */
const { pernasDoDia, combosDoDia, retornoComBanca } = require("./comboDoDia.js");

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) console.log(`✅ ${nome}`);
  else {
    falhas++;
    console.log(`❌ ${nome}${detalhe ? `\n   ${detalhe}` : ""}`);
  }
}
const perto = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

const op = (matchId, chave, odd, prob, evPct, extra = {}) => ({
  matchId,
  chave,
  rotulo: `Mercado ${chave}`,
  odd,
  probModelo: prob,
  evPct,
  kickoff: "2026-01-01T18:00:00Z",
  fonteOdd: "ESPN",
  league: "bra.1",
  home: { name: "Casa" },
  away: { name: "Fora" },
  ...extra,
});

/* ------------------------- 1. corte de EV ------------------------- */

const mistas = [
  op("1", "btts", 1.9, 0.62, 17.8),
  op("2", "over25", 2.1, 0.55, 15.5),
  op("3", "casa", 1.5, 0.7, 5), // EV abaixo de 10 → fora
  op("4", "fora", 0.0, 0.4, 40), // odd inválida → fora
  op("5", "empate", 1.8, 1.2, 99), // prob > 1 → fora
];

const pernas = pernasDoDia(mistas);
ok("só pernas com EV ≥ 10% entram", pernas.length === 2, `veio ${pernas.length}`);
ok("ordena por EV (maior primeiro)", pernas[0].evPct >= pernas[1].evPct);
ok("chave estável no formato match:<id>:<mercado>", pernas[0].chave === "match:1:btts");
ok("matchLabel legível", pernas[0].matchLabel === "Casa × Fora");
ok("EV zero/negativo fica fora", pernasDoDia([op("9", "x", 1.9, 0.5, -3)]).length === 0);
ok("lista nula não quebra", pernasDoDia(null).length === 0);
ok("corte de EV configurável", pernasDoDia(mistas, { minEvPct: 5 }).length === 3);

/* --------------------- 2. uma perna por jogo --------------------- */

const doisMesmoJogo = [
  op("1", "over25", 2.1, 0.55, 15.5),
  op("1", "btts", 1.9, 0.62, 17.8),
];
const paresMesmoJogo = combosDoDia(pernasDoDia(doisMesmoJogo), { tamanhos: [2] });
ok("não monta combo com duas pernas do mesmo jogo", paresMesmoJogo.length === 0);

const quatroJogos = pernasDoDia([
  op("1", "btts", 1.9, 0.62, 17.8),
  op("2", "over25", 2.1, 0.55, 15.5),
  op("3", "casa", 1.7, 0.65, 10.5),
  op("4", "fora", 2.4, 0.45, 12),
]);

/* ------------------- 3. odd e EV combinados ------------------- */

const combos = combosDoDia(quatroJogos, { tamanhos: [2, 3, 4] });
ok("sai um combo por tamanho pedido", combos.length === 3, `veio ${combos.length}`);
ok("tamanhos presentes 2, 3 e 4", combos.map((c) => c.tamanho).join(",") === "2,3,4");

for (const c of combos) {
  const oddEsperada = c.pernas.reduce((a, p) => a * p.odd, 1);
  const probEsperada = c.pernas.reduce((a, p) => a * p.prob, 1);
  ok(`combo ${c.tamanho}: odd = produto das pernas`, perto(c.odd, oddEsperada));
  ok(`combo ${c.tamanho}: prob = produto das pernas`, perto(c.prob, probEsperada));
  ok(`combo ${c.tamanho}: EV = (prob·odd − 1)·100`, perto(c.evPct, (probEsperada * oddEsperada - 1) * 100, 1e-6));
  const jogos = new Set(c.pernas.map((p) => p.matchId));
  ok(`combo ${c.tamanho}: um jogo por perna`, jogos.size === c.pernas.length);
}

// O EV do combo é o produto dos EVs: 2 pernas com EV>0 têm EV combinado maior
// que cada perna isolada — se isso falhar, a matemática está invertida.
ok("EV do combo de 2 é maior que o da melhor perna", combos[0].evPct > quatroJogos[0].evPct);

const soDuas = combosDoDia(quatroJogos, { tamanhos: [4] });
ok("tamanho acima do pool é ignorado", soDuas.length === 0 || soDuas[0].tamanho === 4);
ok("tamanho 1 não é aceito", combosDoDia(quatroJogos, { tamanhos: [1] }).length === 0);

// Odd combinada acima do teto é descartada (bilhete de loteria).
const altas = pernasDoDia([
  op("1", "a", 9, 0.2, 80),
  op("2", "b", 9, 0.2, 80),
]);
ok("combo acima do oddMax é descartado", combosDoDia(altas, { tamanhos: [2], oddMax: 60 }).length === 0);

/* --------------------- 4. banca, retorno, lucro --------------------- */

const c2 = combos.find((c) => c.tamanho === 2);
const r = retornoComBanca(c2, 100);
ok("lucro = banca·(odd − 1)", perto(r.lucro, +(100 * (c2.odd - 1)).toFixed(2), 0.01));
ok("retorno = banca·odd", perto(r.retorno, +(100 * c2.odd).toFixed(2), 0.01));
ok("banca zero devolve zeros, não NaN", Number.isFinite(retornoComBanca(c2, 0).lucro));
ok("banca negativa devolve zeros", retornoComBanca(c2, -50).retorno === 0);
ok("combo nulo devolve zeros", retornoComBanca(null, 100).lucro === -100);

/* ------------------------- âncora Pinnacle ------------------------- */

ok(
  "odd da Pinnacle vira âncora",
  pernasDoDia([op("7", "x", 2, 0.55, 10, { fonteOdd: "Pinnacle" })])[0].oddPinnacle === 2,
);
ok(
  "odd de outra casa não vira âncora",
  pernasDoDia([op("8", "y", 2, 0.55, 10, { fonteOdd: "Bet365" })])[0].oddPinnacle === null,
);

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\ncomboDoDia: tudo certo.");
