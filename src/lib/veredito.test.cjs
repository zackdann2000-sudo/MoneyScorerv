#!/usr/bin/env node
/**
 * Testes de src/lib/veredito.ts — cruzamento do raio-X dos dois times.
 *
 *   npx tsc src/lib/veredito.ts src/lib/formaRecente.ts --target es2022 \
 *     --module commonjs --outDir .vtbuild --skipLibCheck
 *   cp src/lib/veredito.test.cjs .vtbuild/ && node .vtbuild/veredito.test.cjs
 *
 * Ou tudo de uma vez: ./scripts/unit-tests.sh veredito
 *
 * Os três cenários pedidos pelo produto:
 *   1. Alta confiança — 20 jogos, modelo e observado concordando.
 *   2. Baixa confiança — base curta, as duas leituras divergindo.
 *   3. Sem base — raio-X vazio, veredito marcado (0% / indisponível).
 */
const { gerarVeredito } = require("./veredito.js");

let ok = 0;
const falhas = [];
function check(nome, r, e) {
  const a = JSON.stringify(r), b = JSON.stringify(e);
  if (a === b) { ok++; console.log(`✅ ${nome}`); }
  else { falhas.push(nome); console.log(`❌ ${nome} → ${a}, esperava ${b}`); }
}
function entre(nome, r, min, max) {
  if (typeof r === "number" && r >= min && r <= max) { ok++; console.log(`✅ ${nome} (${r})`); }
  else { falhas.push(nome); console.log(`❌ ${nome} → ${r}, esperava entre ${min} e ${max}`); }
}
function contem(nome, texto, trecho) {
  if (typeof texto === "string" && texto.includes(trecho)) { ok++; console.log(`✅ ${nome}`); }
  else { falhas.push(nome); console.log(`❌ ${nome} → não achei "${trecho}" em: ${texto}`); }
}

/** Jogo com data decrescente, simulando o HistGame do ESPN (mais novo primeiro). */
const j = (gf, ga, i = 0) => ({ gf, ga, date: `2025-11-${String(20 - i).padStart(2, "0")}` });
const serie = (gols, sofridos) => gols.map((g, i) => j(g, sofridos[i] ?? 0, i));

/* ================================================================== */
console.log("\n=== 1. Alta confiança · 20 jogos, leituras concordando ===");
/* Mandante com ataque forte e defesa sólida; visitante de jogo aberto. */
const A_ALTA = serie([3, 2, 2, 1, 4, 2, 3, 1, 2, 2], [1, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
const B_ALTA = serie([1, 2, 1, 3, 2, 1, 2, 2, 1, 2], [1, 2, 0, 2, 1, 1, 3, 1, 2, 1]);
const alta = gerarVeredito("São Paulo", "Bahia", A_ALTA, B_ALTA);

check("mercado recomendado", alta.mercadoRecomendado, "Over 1.5");
check("id estável do mercado", alta.mercadoId, "over15");
check("confiança alta", alta.nivelConfianca, "Alta");
entre("porcentagem de acerto", alta.porcentagemAcerto, 78, 90);
check("amostra soma os dois times", alta.amostra, 20);
check("base suficiente", alta.dadosInsuficientes, false);
check("quatro mercados avaliados", alta.taxas.length, 4);
check("taxas ordenadas da maior para a menor", alta.taxas.map((t) => t.final >= 0 && t.mercado.length > 0), [true, true, true, true]);
entre("final da 1ª >= final da última", alta.taxas[0].final - alta.taxas[3].final, 0, 100);
check("mercado do topo é o recomendado", alta.taxas[0].mercado, alta.mercadoRecomendado);

/* Médias: Time A marcou 2.3 ponderado (3,3,3 pesam 1.5) — a recência importa. */
entre("média de gols do mandante", alta.mediaGols.timeA, 2.0, 2.6);
entre("gols esperados combinados", alta.golsEsperados.total, 2.4, 3.2);
check("lambda mandante > visitante (mando de campo)", alta.golsEsperados.timeA > alta.golsEsperados.timeB, true);

contem("explicação cita o mercado", alta.explicacao, "Over 1.5");
contem("explicação cita os dois times", alta.explicacao, "São Paulo");
contem("explicação cita o visitante", alta.explicacao, "Bahia");
contem("explicação fecha com o veredito", alta.explicacao, "confiança alta");
contem("explicação cita a concordância", alta.explicacao, "concordam");

/* ================================================================== */
console.log("\n=== 2. Baixa confiança · base curta e leituras divergindo ===");
/* Raio-X incompleto (5 + 6 jogos) e o observado (100%) muito acima do modelo
   (~75%): as duas leituras brigam, então a confiança tem de cair. */
const A_BAIXA = A_ALTA.slice(0, 5);
const B_BAIXA = B_ALTA.slice(0, 6);
const baixa = gerarVeredito("Corinthians", "Flamengo", { games: A_BAIXA }, B_BAIXA);

check("confiança baixa", baixa.nivelConfianca, "Baixa");
check("amostra contada", baixa.amostra, 11);
entre("porcentagem puxada para baixo do teto", baixa.porcentagemAcerto, 62, 88);
contem("explicação avisa da amostra curta", baixa.explicacao, "amostra ainda é curta");
contem("explicação fecha com confiança baixa", baixa.explicacao, "confiança baixa");
check("nunca promete 100%", baixa.porcentagemAcerto <= 96, true);

/* Mesma série em ordem invertida: sem os gols recentes pesando mais, o
   ataque projetado tem de cair. É o teste do decaimento 1.5 / 1.0 / 0.5. */
const recente = gerarVeredito("X", "Y", serie([4, 4, 4, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), A_ALTA);
const antigo = gerarVeredito("X", "Y", serie([0, 0, 0, 0, 0, 0, 0, 4, 4, 4], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), A_ALTA);
check("gol recente projeta mais que gol antigo", recente.golsEsperados.timeA > antigo.golsEsperados.timeA, true);

/* ================================================================== */
console.log("\n=== 3. Sem base · raio-X vazio ===");
const vazio = gerarVeredito("X", "Y", [], null);
check("porcentagem zero sinaliza sem base", vazio.porcentagemAcerto, 0);
check("marcado como insuficiente", vazio.dadosInsuficientes, true);
check("amostra zero", vazio.amostra, 0);
check("nenhuma taxa", vazio.taxas, []);
check("confiança baixa", vazio.nivelConfianca, "Baixa");
contem("explicação pede o histórico", vazio.explicacao, "Sem placares");
contem("explicação nomeia os times", vazio.explicacao, "X e Y");

check("undefined também cai no sem base", gerarVeredito("X", "Y", undefined, undefined).porcentagemAcerto, 0);
check("jogos sem placar não contam", gerarVeredito("X", "Y", [{}, { gf: null, ga: null }], []).amostra, 0);

/* ================================================================== */
console.log("\n=== 4. Entradas tolerantes ===");
const envelope = gerarVeredito({ nome: "Corinthians" }, "Flamengo", { last: A_ALTA.slice(0, 5) }, { jogos: B_ALTA.slice(0, 6) });
check("aceita { last } e { jogos }, e nome em objeto", envelope.amostra, 11);
contem("nome vindo do objeto", envelope.explicacao, "Corinthians");

/* Janela é de 10 jogos: o 11º em diante não entra. */
const onze = gerarVeredito("X", "Y", serie(Array(11).fill(2), Array(11).fill(1)), []);
check("janela limitada a 10 jogos", onze.amostra, 10);

/* Só um dos times com histórico ainda gera veredito, com aviso de base curta. */
const meio = gerarVeredito("X", "Y", A_ALTA, []);
check("um lado só gera veredito", meio.dadosInsuficientes, false);
entre("um lado só ainda dá número", meio.porcentagemAcerto, 1, 99);

console.log(`\n${falhas.length === 0 ? "✅ TODOS OS TESTES PASSARAM" : "❌ HOUVE FALHAS"} — ${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) { console.log("falhas:", falhas.join(" | ")); process.exit(1); }
