/**
 * Testes do motor de tendências — dados SINTÉTICOS, nenhuma rede.
 *
 * Roda via `./scripts/unit-tests.sh tendencias`, que transpila src/lib com
 * esbuild e executa este arquivo contra o JS gerado.
 *
 * Os valores esperados foram calculados à mão: se o motor mudar, o teste
 * quebra. A regra de ouro (amostra < 3 ⇒ o mercado some) tem teste próprio,
 * porque é o requisito de produto mais fácil de perder numa refatoração.
 */
const T = require("./tendencias.js");

let falhas = 0;
function check(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "✅" : "❌"} ${nome.padEnd(46)} obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
}
function perto(nome, obtido, esperado, tol = 1e-9) {
  const ok = typeof obtido === "number" && Math.abs(obtido - esperado) <= tol;
  if (!ok) falhas++;
  console.log(`${ok ? "✅" : "❌"} ${nome.padEnd(46)} obtido=${obtido} esperado=${esperado}`);
}

/** Jogo sintético: todo campo começa num valor previsível. */
function jogo(i, over = {}) {
  const dia = String(i + 1).padStart(2, "0");
  return Object.assign(
    {
      date: `2026-01-${dia}`,
      home: true,
      gf: 1, ga: 1,
      htGf: 0, htGa: 1,
      corners: 10, oppCorners: 4,
      fouls: 12, oppFouls: 14,
      yellow: 2, red: 0, oppYellow: 3, oppRed: 0,
      shots: 12, sot: 5, offsides: 2,
    },
    over
  );
}
function serie(n, over = {}) {
  return Array.from({ length: n }, (_, i) => jogo(i, over));
}

console.log("\n=== 1. Mediana ===");
check("mediana ímpar [1,2,3]", T.tendMediana([1, 2, 3]), 2);
check("mediana par [1,2,3,4]", T.tendMediana([1, 2, 3, 4]), 2.5);
check("mediana 1 elemento", T.tendMediana([7]), 7);
check("mediana vazia", T.tendMediana([]), null);
check("mediana ignora NaN/Infinity", T.tendMediana([3, NaN, 5, Infinity]), 4);
check("mediana de 10 (9 e 11 do centro)", T.tendMediana([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]), 5.5);

console.log("\n=== 2. Linhas (mediana ± passo) ===");
check("tendLinhas(9, 1)", T.tendLinhas(9, 1), [8.5, 9.5, 10.5]);
check("tendLinhas(2, 1) p/ gols", T.tendLinhas(2, 1), [1.5, 2.5, 3.5]);
check("tendLinhas(11, 1) p/ cantos", T.tendLinhas(11, 1), [10.5, 11.5, 12.5]);
check("tendLinhas(23, 2) p/ faltas", T.tendLinhas(23, 2), [21.5, 23.5, 25.5]);
check("tendLinhas(0.5, 1) não gera zero", T.tendLinhas(0.5, 1), [0.5, 1.5]);
check("tendLinhas(0, 1) fica na meia-linha mínima", T.tendLinhas(0, 1), [0.5, 1.5]);

console.log("\n=== 3. Contagem 'bateu X de Y' ===");
const p1 = T.tendPontos([3, 5, 7, null, 2], 4.5, "over");
check("over 4.5 → hit", p1.hit, 2);
check("over 4.5 → n (null não conta)", p1.n, 4);
check("over 4.5 → pct", p1.pct, 50);
check("over 4.5 → série", p1.serie, [0, 1, 1, 0]);
const p2 = T.tendPontos([3, 5, 7, null, 2], 4.5, "under");
check("under 4.5 → hit", p2.hit, 2);
check("under 4.5 → série", p2.serie, [1, 0, 0, 1]);
check("n < 3 → pct null (regra de ouro)", T.tendPontos([9, 9], 4.5).pct, null);
check("tudo null → n 0 e pct null", T.tendPontos([null, null, null], 1.5).pct, null);
check("10 de 10 → pct 100", T.tendPontos([2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 1.5).pct, 100);

console.log("\n=== 4. Regra de ouro: amostra < 3 o mercado SOME ===");
const dois = T.gerarTendencias(serie(2), serie(2), {});
check("2 jogos → nenhuma tendência", dois.length, 0);
const tres = T.gerarTendencias(serie(3), serie(3), {});
check("3 jogos → já publica", tres.length > 0, true);
check("3 jogos → pct nunca null", tres.every((t) => t.pct != null), true);
check("3 jogos → nada com amostra 0", tres.every((t) => t.n >= 3), true);

console.log("\n=== 5. Geração completa (10 jogos) ===");
const g10 = T.gerarTendencias(serie(10), serie(10), { amostra: 10 });
check("há tendências", g10.length > 0, true);
check("toda tendência tem amostra >= 3", g10.every((t) => t.n >= 3 && t.pct != null), true);
const cantos = g10.filter((t) => t.metrica === "cantos_time" && t.linha === 9.5 && t.lado === "casa");
check("cantos 10/jogo vs linha 9.5 → 100%", cantos.length === 1 ? cantos[0].pct : "achou " + cantos.length, 100);
check("cantos 100% com n=10 → selo", cantos.length === 1 ? cantos[0].cemPorCento : null, true);
check("cantos: linha 11.5 nunca bate (10/jogo)", g10.find((t) => t.metrica === "cantos_time" && t.linha === 11.5 && t.lado === "casa").pct, 0);

console.log("\n=== 6. selo 100% exige n >= 5 ===");
/* Métrica POR LADO de propósito: a de jogo empilha os dois históricos (4+4=8)
   e aí o selo seria legítimo. Para isolar a regra, usamos cantos_time. */
const g4 = T.gerarTendencias(serie(4), serie(4), { amostra: 4, metricas: ["cantos_time"] });
check("4 jogos: pct 100 existe", g4.some((t) => t.pct === 100), true);
check("4 jogos: selo cemPorCento = false", g4.filter((t) => t.pct === 100).every((t) => !t.cemPorCento), true);
check("4 jogos: amostraCurta = true", g4.every((t) => t.amostraCurta), true);
check("4 jogos: n = 4 (não empilha)", g4.every((t) => t.n === 4), true);
const gJogo = T.gerarTendencias(serie(4), serie(4), { amostra: 4, metricas: ["cantos_jogo"] });
check("4+4 empilhado → n = 8 e selo vale", gJogo.every((t) => t.n === 8) && gJogo.some((t) => t.cemPorCento), true);

console.log("\n=== 7. Dado ausente não vira zero ===");
const semCantos = serie(10, { corners: null, oppCorners: null });
const gSem = T.gerarTendencias(semCantos, semCantos, {});
check("sem escanteio → métrica some", gSem.filter((t) => t.metrica.startsWith("cantos")).length, 0);
check("outras métricas continuam", gSem.length > 0, true);
const parcial = serie(10, {});
parcial[9].corners = null; // 1 de 10 sem dado
const gParc = T.gerarTendencias(parcial, parcial, {});
check("1 de 10 sem dado → n = 9 (não 10)", gParc.find((t) => t.metrica === "cantos_time" && t.lado === "casa").n, 9);

console.log("\n=== 8. Filtros e limites ===");
const g1t = T.gerarTendencias(serie(10), serie(10), { periodo: "1t" });
check("1º tempo: só métricas com suporte", g1t.every((t) => t.metrica === "gols_jogo" || t.metrica === "gols_time"), true);
check("1º tempo: htGf 0 + htGa 1 → 1 gol/jogo = 100%", g1t.find((t) => t.metrica === "gols_jogo" && t.linha === 0.5).pct, 100);
const g2t = T.gerarTendencias(serie(10), serie(10), { periodo: "2t" });
check("2º tempo: total 2 − 1º 1 = 1", g2t.find((t) => t.metrica === "gols_jogo").mediana, 1);
const soCantos = T.gerarTendencias(serie(10), serie(10), { metricas: ["cantos_time"] });
check("filtro de métrica", [...new Set(soCantos.map((t) => t.metrica))], ["cantos_time"]);
const clamp = T.gerarTendencias(serie(10), serie(10), { amostra: 1 });
check("amostra 1 é elevada ao mínimo (3)", [...new Set(clamp.map((t) => t.n))].every((n) => n >= 3), true);

console.log("\n=== 9. Ordenação ===");
check("100% vem antes de 50%", g10[0].pct, 100);
check("cemPorCento primeiro", g10[0].cemPorCento || g10[0].pct === 100, true);
const ordenado = g10.every((t, i) => i === 0 || g10[i - 1].cemPorCento === t.cemPorCento ? true : g10[i - 1].cemPorCento);
check("bloco de 100% é contíguo", ordenado, true);

console.log("\n=== 10. Quentes: forma e sequências ===");
const vitorias = serie(10, { gf: 3, ga: 1 });
check("faixa com 10 vitórias", T.faixaResultados(vitorias, 10).join(""), "VVVVVVVVVV");
const misto = [jogo(0, { gf: 1, ga: 0 }), jogo(1, { gf: 0, ga: 0 }), jogo(2, { gf: 0, ga: 2 })];
check("V/E/D na ordem cronológica", T.faixaResultados(misto, 10), ["V", "E", "D"]);
check("amostra < 3 → sem sequência", T.sequencias(serie(2)).length, 0);
const seq = T.sequencias(vitorias);
check("10 vitórias → 'Venceu os últimos' = 10", seq.find((s) => s.id === "venceu").n, 10);
check("10 vitórias → destaque", seq.find((s) => s.id === "venceu").destaque, true);
check("10 vitórias → 'Não vence há' não aparece", seq.some((s) => s.id === "nao_vence"), false);
const q = T.gerarQuentes(vitorias, 10);
check("aproveitamento 10/10 = 100%", q.aproveitamento, 100);
check("quentes sem amostra → aproveitamento null", T.gerarQuentes(serie(2), 10).aproveitamento, null);

console.log("\n=== 11. Empate 0 gols × 0 gols conta como E ===");
check("0-0 → E", T.faixaResultados([jogo(0, { gf: 0, ga: 0 })], 10), ["E"]);

console.log("");
if (falhas) {
  console.error(`❌ ${falhas} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✅ todas as verificações passaram");
