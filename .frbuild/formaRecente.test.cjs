#!/usr/bin/env node
/**
 * Testes de src/lib/formaRecente.ts — peso de forma por decaimento e ajuste H2H.
 *
 *   npx tsc src/lib/formaRecente.ts --target es2022 --module commonjs \
 *     --outDir .frbuild --skipLibCheck
 *   cp src/lib/formaRecente.test.cjs .frbuild/ && node .frbuild/formaRecente.test.cjs
 */
const {
  PESOS_FORMA, JANELA_FORMA, pesoDaPosicao,
  mediaPonderada, mediaSimples,
  MIN_H2H, JANELA_H2H, FORCA_H2H, FATOR_H2H_MIN, FATOR_H2H_MAX, ajusteH2H,
} = require("./formaRecente.js");

let ok = 0;
const falhas = [];
function check(nome, r, e) {
  const a = JSON.stringify(r), b = JSON.stringify(e);
  if (a === b) { ok++; console.log(`✅ ${nome}`); }
  else { falhas.push(nome); console.log(`❌ ${nome} → ${a}, esperava ${b}`); }
}
function perto(nome, r, e, tol = 0.001) {
  if (typeof r === "number" && Math.abs(r - e) <= tol) { ok++; console.log(`✅ ${nome} (${r})`); }
  else { falhas.push(nome); console.log(`❌ ${nome} → ${r}, esperava ~${e}`); }
}

console.log("\n=== 1. Pesos por posição ===");
check("1.5/1.0/0.5 por faixa", [...PESOS_FORMA], [1.5, 1.5, 1.5, 1.0, 1.0, 1.0, 1.0, 0.5, 0.5, 0.5]);
check("janela é 10", JANELA_FORMA, 10);
check("posição 0 (mais recente)", pesoDaPosicao(0), 1.5);
check("posição 2", pesoDaPosicao(2), 1.5);
check("posição 3 (início da faixa média)", pesoDaPosicao(3), 1.0);
check("posição 6", pesoDaPosicao(6), 1.0);
check("posição 7 (início da faixa fraca)", pesoDaPosicao(7), 0.5);
check("posição 9", pesoDaPosicao(9), 0.5);
check("além da janela vale o último peso", pesoDaPosicao(25), 0.5);
check("negativa vale 0", pesoDaPosicao(-1), 0);

console.log("\n=== 2. Média ponderada ===");
/* Série constante: média ponderada = o próprio valor, qualquer peso. */
const c = mediaPonderada([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]);
perto("série constante", c.media, 2);
check("amostra 10", c.amostra, 10);

/* O valor mais recente pesa mais: recência deve puxar a média para cima. */
const r = mediaPonderada([3, 3, 3, 1, 1, 1, 1, 1, 1, 1]);
perto("recência 3 puxa a média (3×4.5+1×5.5)/10", r.media, (3 * 4.5 + 1 * 5.5) / 10);
check("soma dos pesos", r.somaPesos, 10);

/* Sem os 3 recentes (peso fraco): média mais baixa. */
const s = mediaPonderada([1, 1, 1, 3, 3, 3, 3, 3, 3, 3]);
perto("recência 1 puxa para baixo", s.media, (1 * 4.5 + 3 * 5.5) / 10);

console.log("\n=== 3. Nulos são pulados e pesos redistribuídos ===");
const comFuro = mediaPonderada([3, null, 3, 1, 1, 1, 1, 1, 1, 1]);
perto("furo no meio", comFuro.media, (3 * 3 + 1 * 5.5) / 8.5, 0.005);
check("amostra 9", comFuro.amostra, 9);
check("soma de pesos com furo", comFuro.somaPesos, 8.5);

const vazio = mediaPonderada([null, null, undefined, NaN]);
check("tudo nulo → media null", vazio.media, null);
check("tudo nulo → amostra 0", vazio.amostra, 0);

/* Série curta não quebra: pondera os que existem. */
const curta = mediaPonderada([2, 2, 2]);
perto("série de 3", curta.media, 2);
check("amostra 3", curta.amostra, 3);

console.log("\n=== 4. Média simples (fallback) ===");
perto("média simples", mediaSimples([1, 2, 3]), 2);
check("média simples nula", mediaSimples([null, "x"]), null);

console.log("\n=== 5. Ajuste H2H — o caso do dossiê ===");
/* Time A marca muito nos últimos 10, mas o H2H é travado. */
const travado = ajusteH2H(0.33, 2.2, 7);
check("H2H travado aplica ajuste", travado.aplicado, true);
check("fator 0.85 (piso) quando H2H muito abaixo", travado.fator, FATOR_H2H_MIN);
check("jogos", travado.jogos, 7);
check("texto marca direção para baixo", travado.texto.includes("para baixo"), true);
check("texto explica a origem", travado.texto.includes("0.33") && travado.texto.includes("2.2"), true);

/* H2H na mesma faixa: neutro. */
const neutro = ajusteH2H(2.1, 2.2, 6);
check("H2H na média não mexe (desvio < 2%)", neutro.aplicado, false);
check("fator 1", neutro.fator, 1);

/* H2H muito aberto: ajuste pequeno para cima (teto 1.10). */
const aberto = ajusteH2H(4.0, 2.0, 7);
check("H2H aberto aplica", aberto.aplicado, true);
check("fator limitado ao teto", aberto.fator, FATOR_H2H_MAX);

/* Desvio parcial: 35% do desvio. */
const parcial = ajusteH2H(1.8, 2.0, 5);
perto("35% do desvio (2.0→1.8)", parcial.fator, 1 + (1.8 / 2.0 - 1) * FORCA_H2H);

console.log("\n=== 6. H2H com amostra insuficiente ===");
check("2 jogos não ajustam", ajusteH2H(0.5, 2.0, 2).aplicado, false);
check("0 jogos → fator 1", ajusteH2H(0.5, 2.0, 0).fator, 1);
check("1 jogo texto de aviso", ajusteH2H(0.5, 2.0, 1).texto.includes("insuficiente"), true);
check("sem média do H2H não ajusta", ajusteH2H(null, 2.0, 5).aplicado, false);
check("sem média do modelo não ajusta", ajusteH2H(1.0, null, 5).aplicado, false);
check("constante 7", JANELA_H2H, 7);

console.log("\n=== 7. Constantes exportadas ===");
check("MIN_H2H 3", MIN_H2H, 3);
check("FORCA_H2H 0.35", FORCA_H2H, 0.35);
check("pisos e tetos", [FATOR_H2H_MIN, FATOR_H2H_MAX], [0.85, 1.1]);

console.log(`\n${falhas.length === 0 ? "✅ TODOS OS TESTES PASSARAM" : "❌ HOUVE FALHAS"} — ${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) { console.log("falhas:", falhas.join(" | ")); process.exit(1); }