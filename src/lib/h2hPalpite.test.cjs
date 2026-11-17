/**
 * Teste do "Palpite fixo" H2H.
 *
 * Os placares são fictícios, mas os números esperados foram calculados À MÃO
 * (contagem real das ocorrências), não gerados pelo próprio código. Se a regra
 * mudar, o teste quebra — é esse o ponto.
 *
 * Rodar:
 *   npx tsc src/lib/h2hPalpite.ts --target es2022 --module commonjs --outDir .hbuild
 *   cp src/lib/h2hPalpite.test.cjs .hbuild/ && node .hbuild/h2hPalpite.test.cjs
 */
const { resumoH2H, palpitesH2H, MAX_H2H, MIN_JOGOS } = require("./h2hPalpite.js");

let falhas = 0;
function check(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`❌ ${nome}\n   obtido:   ${JSON.stringify(obtido)}\n   esperado: ${JSON.stringify(esperado)}`);
  } else {
    console.log(`✅ ${nome}`);
  }
}
const g = (c, f) => ({ golsCasa: c, golsFora: f });

// ---------------------------------------------------------------- caso 1
// 7 jogos mistos. Contagem manual:
//   (2,1)(1,1)(3,0)(2,2)(1,0)(0,0)(2,1)
//   over1.5: 3,2,3,4,1,0,3 -> 5 ; over2.5: 4 ; btts: 4 ; casa 2+: 4 ; fora 2+: 1 ; over3.5: 1
const caso1 = [g(2, 1), g(1, 1), g(3, 0), g(2, 2), g(1, 0), g(0, 0), g(2, 1)];
const r1 = resumoH2H(caso1);
console.log("=== caso 1 (7 jogos mistos) ===");
check("principal = over15", r1.principal.id, "over15");
check("acertos over15", r1.principal.acertos, 5);
check("total", r1.total, 7);
check("pct", r1.principal.pct, 71);
check("força (71% = moderado)", r1.principal.forca, "moderado");
check("secundário = over25 (desempate por prioridade)", r1.secundario.id, "over25");
check("média de gols", r1.mediaGols, 2.3);

// ranking completo do caso 1 (ordem por acertos, depois prioridade)
const p1 = palpitesH2H(caso1).map((p) => `${p.id}:${p.acertos}`);
check("ranking caso 1", p1, ["over15:5", "over25:4", "casa15:4", "btts:4", "over35:1", "fora15:1"]);

// ---------------------------------------------------------------- caso 2
// 7x (2,1): over2.5 = 3 gols > 2.5 -> 7/7. over1.5, casa 2+ e btts também 7/7,
// mas o desempate prefere a linha mais alta (over25 tem prio menor).
console.log("\n=== caso 2 (7x 2-1) ===");
const r2 = resumoH2H(Array.from({ length: 7 }, () => g(2, 1)));
check("principal = over25 (desempate pela linha mais alta)", r2.principal.id, "over25");
check("100% = forte", r2.principal.forca, "forte");
check("sem secundário (ninguém tem menos acertos)", r2.secundario, null);

// ---------------------------------------------------------------- caso 3
// Amostra insuficiente (< MIN_JOGOS) não gera palpite.
console.log("\n=== caso 3 (amostra insuficiente) ===");
const r3 = resumoH2H([g(1, 0), g(2, 1)]);
check("principal null", r3.principal, null);
check("total 2", r3.total, 2);
check("média 2.0", r3.mediaGols, 2.0);
check("MIN_JOGOS", MIN_JOGOS, 3);

// ---------------------------------------------------------------- caso 4
// Vazio.
console.log("\n=== caso 4 (vazio) ===");
check("principal null", resumoH2H([]).principal, null);
check("total 0", resumoH2H([]).total, 0);
check("média 0", resumoH2H([]).mediaGols, 0);
check("palpites vazio", palpitesH2H([]).length, 0);

// ---------------------------------------------------------------- caso 5
// (2,1)(3,2)(0,0) -> over1.5 = 2/3 e over2.5 = 2/3 (o 0x0 não passa).
// Empate: o desempate prefere a linha mais alta -> over25. média 8/3 = 2.7
console.log("\n=== caso 5 (3 jogos) ===");
const r5 = resumoH2H([g(2, 1), g(3, 2), g(0, 0)]);
check("principal = over25 (empate 2/3, linha mais alta)", r5.principal.id, "over25");
check("2 de 3 = 67%", r5.principal.pct, 67);
check("média 2.7", r5.mediaGols, 2.7);

// ---------------------------------------------------------------- caso 6
// Só os 7 mais recentes entram na conta (os 3 antigos, goleada, são ignorados).
console.log("\n=== caso 6 (limite de 7) ===");
const dez = [...Array.from({ length: 7 }, () => g(0, 0)), g(5, 5), g(5, 5), g(5, 5)];
const r6 = resumoH2H(dez);
check("total limitado a 7", r6.total, 7);
check("MAX_H2H", MAX_H2H, 7);
check("principal null (os 7 recentes foram 0x0)", r6.principal, null);

// ---------------------------------------------------------------- caso 7
// Ambas marcam 7/7 com over1.5 7/7: desempate prefere btts (prio 4 < 5).
console.log("\n=== caso 7 (empate no topo) ===");
const r7 = resumoH2H(Array.from({ length: 7 }, () => g(1, 1)));
check("principal = btts", r7.principal.id, "btts");
check("força forte", r7.principal.forca, "forte");

console.log(`\n${falhas === 0 ? "✅ TODOS OS TESTES PASSARAM" : `❌ ${falhas} FALHA(S)`}`);
process.exit(falhas === 0 ? 0 : 1);
