#!/usr/bin/env node
/**
 * Testes do Bloco de 4 Análises (src/lib/blocoAnalises.ts).
 *
 * Roda sem rede: só matemática sobre médias sintéticas com números plausíveis
 * (as médias reais do ESPN para um time do Brasileirão ficam nessa faixa:
 * gols 1.6, sofridos 1.7, faltas 14.1, amarelos 2.3).
 *
 *   npx tsc src/lib/blocoAnalises.ts --target es2022 --module commonjs \
 *     --outDir .babuild --skipLibCheck
 *   cp src/lib/blocoAnalises.test.cjs .babuild/ && node .babuild/blocoAnalises.test.cjs
 */
const { blocoAnalises, linhaSugerida, linhaParaAlvo, ALVO_PROB_LINHA, poissonAcima, ORDEM, BASE_ULTIMOS, TEXTO_BASE } = require("./blocoAnalises.js");

let ok = 0;
const falhas = [];
function check(nome, recebido, esperado) {
  const a = JSON.stringify(recebido);
  const b = JSON.stringify(esperado);
  if (a === b) {
    ok++;
    console.log(`✅ ${nome}`);
  } else {
    falhas.push(nome);
    console.log(`❌ ${nome} → recebeu ${a}, esperava ${b}`);
  }
}
function perto(nome, recebido, esperado, tol = 0.01) {
  if (recebido != null && Math.abs(recebido - esperado) <= tol) {
    ok++;
    console.log(`✅ ${nome} (${recebido})`);
  } else {
    falhas.push(nome);
    console.log(`❌ ${nome} → recebeu ${recebido}, esperava ~${esperado}`);
  }
}

/* Times sintéticos com a cara das médias reais do ESPN. */
const CASA = { jogos: 10, gols: 1.6, sofridos: 1.7, faltas: 14.1, amarelos: 2.3, vermelhos: 0.1, impedimentos: 2.0 };
const FORA = { jogos: 8, gols: 2.0, sofridos: 0.9, faltas: 12.5, amarelos: 2.6, vermelhos: 0.1, impedimentos: 1.8 };

console.log("\n=== 1. Poisson ===");
perto("P(X>1.5 | λ=2) = 1 - 3e^-2", poissonAcima(1.5, 2), 1 - 3 * Math.exp(-2));
perto("P(X>1.5 | λ=2.8)", poissonAcima(1.5, 2.8), 1 - Math.exp(-2.8) * (1 + 2.8));
perto("linha 0.5 é P(X>=1)", poissonAcima(0.5, 1.2), 1 - Math.exp(-1.2));
check("λ=0 devolve 0", poissonAcima(1.5, 0), 0);
check("probabilidade nunca passa de 1", poissonAcima(0.5, 40) <= 1, true);
check("probabilidade de λ enorme e linha baixa ~1", poissonAcima(1.5, 40) > 0.999, true);
check("λ grande e linha alta continua entre 0 e 1", poissonAcima(25.5, 27) > 0.3 && poissonAcima(25.5, 27) < 0.7, true);

console.log("\n=== 2. Linha sugerida (meia-linha abaixo do total) ===");
check("2.67 → 1.5", linhaSugerida(2.67), 1.5);
check("26.07 → 25.5", linhaSugerida(26.07), 25.5);
check("3.1 → 2.5", linhaSugerida(3.1), 2.5);
check("1 → 0.5", linhaSugerida(1), 0.5);
check("0.4 → 0.5 (nunca negativa)", linhaSugerida(0.4), 0.5);

console.log("\n=== 3. Ordem e forma dos 4 itens ===");
const itens = blocoAnalises(CASA, FORA);
check("sempre 4 itens", itens.length, 4);
check("ordem fixa", itens.map((i) => i.id), ORDEM);
check("rótulos em pt-BR", itens.map((i) => i.rotulo), ["Cartões", "Faltas", "Gols", "Impedimentos"]);
check("nenhum item sem dados com fonte completa", itens.filter((i) => i.semDados).length, 0);

console.log("\n=== 4. Cartões = amarelos + vermelhos ===");
perto("média casa 2.3 + 0.1", itens[0].mediaCasa, 2.4);
perto("média fora 2.6 + 0.1", itens[0].mediaFora, 2.7);
perto("total do jogo", itens[0].total, 5.1);
check("linha do total 5.1 sobe até o alvo de 80%", itens[0].linha, 2.5);
perto("probabilidade de over 2.5", itens[0].prob, poissonAcima(2.5, 5.1) * 100);

console.log("\n=== 5. Faltas ===");
perto("média casa", itens[1].mediaCasa, 14.1);
perto("total 14.1 + 12.5", itens[1].total, 26.6);
check("linha 21.5 (alvo de 80% para 26.6)", itens[1].linha, 21.5);
perto("probabilidade", itens[1].prob, poissonAcima(21.5, 26.6) * 100);

console.log("\n=== 6. Gols cruzam ataque e defesa ===");
perto("média casa (só os gols marcados)", itens[2].mediaCasa, 1.6);
perto("média fora", itens[2].mediaFora, 2.0);
perto("(1.6+0.9)/2 + (2.0+1.7)/2", itens[2].total, 3.1);
check("linha 1.5 (alvo de 80% para 3.1)", itens[2].linha, 1.5);
perto("probabilidade", itens[2].prob, poissonAcima(1.5, 3.1) * 100);

console.log("\n=== 7. Impedimentos e amostra ===");
perto("total de impedimentos", itens[3].total, 3.8);
check("amostra é a menor entre os times", itens[3].amostra, 8);
check("todos usam a mesma amostra", itens.every((i) => i.amostra === 8), true);

console.log("\n=== 8. Sem dados: nunca zero inventado ===");
const semImp = blocoAnalises(CASA, { ...FORA, impedimentos: null });
check("impedimentos sem fonte", semImp[3].semDados, true);
check("impedimentos sem total", semImp[3].total, null);
check("impedimentos sem linha nem prob", [semImp[3].linha, semImp[3].prob], [null, null]);
check("as outras 3 continuam com dados", semImp.filter((i) => !i.semDados).length, 3);

const vazio = blocoAnalises(null, null);
check("sem os dois times, 4 itens sem dados", vazio.filter((i) => i.semDados).length, 4);
check("amostra 0", vazio[0].amostra, 0);

const soAmarelo = blocoAnalises({ amarelos: 2.3 }, { amarelos: 2.6 });
check("sem vermelhos, cartões = amarelos", soAmarelo[0].total, 4.9);
check("gols sem média de sofridos fica sem dados", blocoAnalises({ gols: 1.2 }, { gols: 1.0 })[2].semDados, true);

console.log("\n=== 9. Fontes velhas / valores sujos ===");
const sujo = blocoAnalises(
  { jogos: 10, gols: "1.6", sofridos: 1.7, faltas: 14.1, amarelos: "2.3", impedimentos: 2 },
  FORA,
);
check("string numérica é aceita", sujo[0].mediaCasa, 2.3);
check("nada vira NaN", sujo.every((i) => !Number.isNaN(i.total ?? 0) && !Number.isNaN(i.prob ?? 0)), true);

const totalZero = blocoAnalises({ amarelos: 0, faltas: 0 }, { amarelos: 0, faltas: 0 });
check("média zero é medição real, não falta de dados", totalZero[0].semDados, false);
check("total 0 fica visível", totalZero[0].total, 0);
check("sem λ não há linha nem probabilidade", [totalZero[0].linha, totalZero[0].prob], [null, null]);
check("média continua visível", [totalZero[0].mediaCasa, totalZero[0].mediaFora], [0, 0]);

console.log("\n=== 10. Coerência ===");
check("todos os itens com dados têm prob entre 0 e 100", itens.every((i) => i.prob >= 0 && i.prob <= 100), true);
check("linha sempre abaixo do total", itens.every((i) => i.linha < i.total), true);

console.log("\n=== 10b. Alvo de elite: linha escolhida para passar de 75% ===");
check("alvo exposto = 0.8", ALVO_PROB_LINHA, 0.8);
check("2.5 → 0.5", linhaParaAlvo(2.5), 0.5);
check("3.1 → 1.5", linhaParaAlvo(3.1), 1.5);
check("5.1 → 2.5", linhaParaAlvo(5.1), 2.5);
check("10.5 → 7.5", linhaParaAlvo(10.5), 7.5);
check("26.6 → 21.5", linhaParaAlvo(26.6), 21.5);
check("nunca desce de 0.5", linhaParaAlvo(0.9), 0.5);
check("total zero não explode", linhaParaAlvo(0), 0.5);
check(
  "cada linha escolhida passa do piso de 75%",
  [2.5, 3.1, 5.1, 10.5, 26.6].every((t) => poissonAcima(linhaParaAlvo(t), t) >= 0.75),
  true,
);
check(
  "média alta: meia-linha colada na média NÃO passaria (motivo da mudança)",
  poissonAcima(linhaSugerida(5.1), 5.1) < 0.75,
  true,
);
check(
  "total maior com a mesma linha dá probabilidade maior",
  poissonAcima(2.5, 3.0) < poissonAcima(2.5, 4.0),
  true,
);


console.log("\n=== 11. H2H travado derruba a probabilidade da MESMA linha ===");
const semH2H = blocoAnalises(CASA, FORA)[2];
const h2hTravado = blocoAnalises(CASA, FORA, { gols: 0.5, cartoes: 3.0, jogos: 7 });
const golsTravado = h2hTravado[2];

check("linha não se move com o H2H", golsTravado.linha, semH2H.linha);
check("total cai com H2H travado", golsTravado.total < semH2H.total, true);
perto("fator no piso 0.85", golsTravado.ajuste.fator, 0.85);
check("ajuste marcado como aplicado", golsTravado.ajuste.aplicado, true);
check("probabilidade cai", golsTravado.prob < semH2H.prob, true);
perto("3.1 x 0.85 = 2.64", golsTravado.total, 2.64);
perto("probabilidade recalculada na linha 1.5", golsTravado.prob, poissonAcima(1.5, 2.64) * 100);

check("cartões também cruzam com o H2H", h2hTravado[0].ajuste.aplicado, true);
check("faltas não cruzam (sem H2H confiável)", h2hTravado[1].ajuste, null);
check("impedimentos não cruzam", h2hTravado[3].ajuste, null);

const h2hAberto = blocoAnalises(CASA, FORA, { gols: 5.0, jogos: 7 })[2];
check("H2H aberto sobe a probabilidade", h2hAberto.prob > semH2H.prob, true);
perto("fator limitado ao teto", h2hAberto.ajuste.fator, 1.1);

const h2hCurto = blocoAnalises(CASA, FORA, { gols: 0.2, jogos: 2 })[2];
check("H2H com 2 jogos não ajusta", h2hCurto.ajuste.aplicado, false);
check("nem muda o total", h2hCurto.total, semH2H.total);

console.log("\n=== 12. Transparência da base ===");
check("BASE_ULTIMOS = 10", BASE_ULTIMOS, 10);
check("TEXTO_BASE cita os 10 jogos", TEXTO_BASE, "baseado nos últimos 10 jogos");

console.log(`\n${falhas.length === 0 ? "✅ TODOS OS TESTES PASSARAM" : "❌ HOUVE FALHAS"} — ${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) {
  console.log("falhas:", falhas.join(" | "));
  process.exit(1);
}
