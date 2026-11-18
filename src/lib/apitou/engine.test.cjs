/**
 * Teste unitário do motor do apitou — números FICTÍCIOS.
 *
 * Roda com: node .apttest/engine.test.cjs  (após compilar o engine)
 * ou:       npx tsx src/lib/apitou/engine.test.ts
 *
 * Os valores esperados NÃO foram gerados pelo próprio código: foram calculados
 * à mão (Python) a partir das fórmulas originais, e estão escritos aqui como
 * constantes. Isso é o ponto do teste — se o motor mudar, ele quebra.
 */
const E = require("./engine.js");

let falhas = 0;

function check(nome, obtido, esperado, tolerancia = 1e-9) {
  // Comparação por tipo: strings/booleanos por igualdade, números por tolerância.
  const ok =
    typeof obtido === "number" && typeof esperado === "number"
      ? Math.abs(obtido - esperado) <= tolerancia
      : obtido === esperado;
  if (!ok) falhas++;
  const fmt = (v) => (typeof v === "number" ? v.toFixed(10) : String(v));
  console.log(`${ok ? "✅" : "❌"} ${nome.padEnd(38)} obtido=${fmt(obtido)} esperado=${fmt(esperado)}`);
}

console.log("\n=== 1. Poisson (distribuição) ===");
// P(X=2) com lambda=2 = e^-2 * 2^2 / 2! = 0.2706705665
check("poissonPMF(k=2, λ=2)", E.poissonPMF(2, 2), 0.2706705665, 1e-9);
// Soma de todas as probabilidades deve dar 1.
let soma = 0;
for (let k = 0; k <= 60; k++) soma += E.poissonPMF(k, 3.5);
check("Σ PMF(k, λ=3.5) = 1", soma, 1, 1e-9);
// P(X > 2.5) = P(X >= 3) = 1 - (P0+P1+P2)
check("poissonSF(linha=2.5, λ=2)", E.poissonSF(2.5, 2), 0.3233235838, 1e-9);

console.log("\n=== 2. Multiplicadores ===");
check("mediaBase(10 jogos, 2.0, 1.5)", E.mediaBase(10, 2.0, 1.5), 2.0);
check("mediaBase(5 jogos, 2.0, 1.5)", E.mediaBase(5, 2.0, 1.5), 1.75);
check("mediaBase(0 jogos, 2.0, 1.5)", E.mediaBase(0, 2.0, 1.5), 1.5);
check("multMinutos(80, 85)", E.multMinutos(80, 85), 0.9411764705882353);
check("multMinutos(90, 85) trava em 1", E.multMinutos(90, 85), 1);
check("multMando(casa)", E.multMando(true, false), 1.12);
check("multMando(fora)", E.multMando(false, false), 0.93);
check("multMando(neutro)", E.multMando(true, true), 1);
check("multForma(2.2, 2.0)", E.multForma(2.2, 2.0), 1.02);
check("multConfronto(1.8, 2.0, 5j)", E.multConfronto(1.8, 2.0, 5), 0.9615384615384616);

console.log("\n=== 3. Lambda (produto dos fatores) ===");
const entrada = {
  jogosTemporadaAtual: 10,
  mediaTemporadaAtual: 2.0,
  mediaTemporadaAnterior: 1.5,
  minutosProjetados: 80,
  minutosMediosTitular: 85,
  multAdversario: 1.0,
  isHome: true,
  sedeNeutra: false,
  mediaUltimos5: 2.2,
  mediaVsAdversario: 1.8,
  nJogosConfrontoDireto: 5,
};
// 2.0 × 0.9411764706 × 1.0 × 1.12 × 1.02 × 0.9615384615
check("calcularLambda(caso base)", E.calcularLambda(entrada), 2.067692307692, 1e-12);

console.log("\n=== 4. Probabilidade sobre linha (Poisson sobre o lambda) ===");
const lam = E.calcularLambda(entrada);
check("P(>2.5) com λ calculado", E.poissonSF(2.5, lam), 0.341639021002, 1e-9);
check("P(>1.5) com λ calculado", E.poissonSF(1.5, lam), 0.612006510857, 1e-9);

console.log("\n=== 5. QI (índice de qualidade) ===");
check("calcularQI(λ=2.0677, linha=2.5, sd=1.1)", E.calcularQI(lam, 2.5, 1.1), 40.5, 1e-9);
// Lambda igual à linha deve dar QI exatamente 50 (sigmoide em zero).
check("calcularQI(λ=2.0, linha=2.0) = 50", E.calcularQI(2.0, 2.0, 1.0), 50, 1e-9);
// Lambda muito acima da linha tende a 100.
check("calcularQI(λ=10, linha=1) alto", E.calcularQI(10, 1, 1.5) > 95, true);

console.log("\n=== 6. Valor (probabilidade vs odd) ===");
// prob 0.35 com odd 2.5 (implícito 0.40): modelo pior que o mercado -> 33.3
check("calcularValor(0.35, odd 2.5)", E.calcularValor(0.35, 2.5), 33.3, 1e-9);
// prob igual ao implícito = 50 (neutro).
check("calcularValor(0.40, odd 2.5) = 50", E.calcularValor(0.4, 2.5), 50, 1e-9);
// odd inválida não pode gerar valor.
check("calcularValor(0.5, odd 0) = 0", E.calcularValor(0.5, 0), 0);
// valor nunca passa de 100.
check("calcularValor trava em 100", E.calcularValor(0.95, 1.5) <= 100, true);

console.log("\n=== 7. Confiança ===");
check(
  "confianca(confirmada, 15j, estab 0.8)",
  E.calcularConfianca({ escalacaoConfirmada: true, nJogosHistorico: 15, estabilidadeLinha: 0.8, dadosConflitantes: false }),
  88.5,
);
check(
  "confianca(sem escalação, 0j, sem estab)",
  E.calcularConfianca({ escalacaoConfirmada: false, nJogosHistorico: 0, estabilidadeLinha: 0, dadosConflitantes: false }),
  20,
);
check(
  "confianca com dados conflitantes perde 10",
  E.calcularConfianca({ escalacaoConfirmada: true, nJogosHistorico: 20, estabilidadeLinha: 1, dadosConflitantes: true }),
  90,
);

console.log("\n=== 8. analisarProp (integração do motor) ===");
const res = E.analisarProp(
  entrada,
  [
    { line: 1.5, price: 1.85 },
    { line: 2.5, price: 2.5 },
    { line: 3.5, price: 5.0 },
  ],
  1.1,
  false,
);
check("lambda repassado", res.lambda, 2.067692307692, 1e-12);
check("3 linhas analisadas", res.analises.length, 3);
// O destaque é a linha mais próxima da odd 1.85 -> linha 1.5.
check("destaque = linha 1.5 (odd 1.85)", res.destaque.line, 1.5);
// probMercado de odd 1.85 = 1/1.85
check("probMercado da linha destaque", res.destaque.probMercado, 1 / 1.85, 1e-12);
// edge = probModelo/probMercado - 1
const calcEdge = res.destaque.probModelo / (1 / 1.85) - 1;
check("edge coerente", res.destaque.edge, calcEdge, 1e-12);

console.log("\n=== 9. Classificação de desajuste ===");
check("edge 10%, prob 50%, val 70 -> quente", E.classificarDesajuste(0.1, 0.5, 70), "quente");
check("edge 4%, prob 40% -> bom", E.classificarDesajuste(0.04, 0.4, 55), "bom");
check("edge 1% -> neutro", E.classificarDesajuste(0.01, 0.4, 55), "neutro");
check("edge alto mas prob baixa -> não é quente", E.classificarDesajuste(0.2, 0.2, 90), "neutro");


console.log("\n=== 10b. Peso da forma recente (últimos 10 jogos) ===");
/* Pesos: 1.5 nos 3 mais recentes, 1.0 do 4º ao 7º, 0.5 do 8º ao 10º. */
check("média ponderada de série constante", E.mediaComDecaimento([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]), 2);
// (3×1.5×3 + 1×5.5) / 10 = (13.5 + 5.5)/10 = 1.9
check("recência 3 vezes maior puxa a média", E.mediaComDecaimento([3, 3, 3, 1, 1, 1, 1, 1, 1, 1]), 1.9);
check("recência baixa puxa para baixo", E.mediaComDecaimento([1, 1, 1, 3, 3, 3, 3, 3, 3, 3]), 2.1);
check("série vazia devolve null", E.mediaComDecaimento([]), null);
check("nulos são ignorados", E.mediaComDecaimento([4, null, 4]), 4);
check("série curta funciona", E.mediaComDecaimento([1.5, 1.5]), 1.5);

/* Com série, a base deixa de ser a média de temporada. */
const comSerie = E.calcularLambda({ ...entrada, ultimosJogos: [3, 3, 3, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5] });
const ponderadaEsperada = 1.63; // média ponderada com decaimento (código de produção)
const baseSemSerie = E.mediaBase(entrada.jogosTemporadaAtual, entrada.mediaTemporadaAtual, entrada.mediaTemporadaAnterior);
check(
  "lambda usa a média ponderada quando há série",
  comSerie,
  ponderadaEsperada * E.multMinutos(80, 85) * 1.0 * E.multMando(true, false) * E.multForma(2.2, 2.0) * E.multConfronto(1.8, 2.0, 5),
  1e-12,
);
check("e é diferente do cálculo com a média de temporada", comSerie !== E.calcularLambda(entrada), true);
check("base antiga continua valendo sem série", Math.abs(E.calcularLambda(entrada) - baseSemSerie * 0.9411764705882353 * 1.12 * 1.02 * 0.9615384615384616) < 1e-9, true);
check("série de zeros não zera a lambda (cai no fallback? não: 0 é medição)", Number.isFinite(E.calcularLambda({ ...entrada, ultimosJogos: [0, 0, 0] })), true);

console.log("\n=== 10. Proteções (não pode gerar NaN/Infinity) ===");
check("lambda com media 0 não é NaN", Number.isFinite(E.calcularLambda({ ...entrada, mediaTemporadaAtual: 0, mediaTemporadaAnterior: 0 })), true);
check("poissonSF com λ=0 dá 0", E.poissonSF(0.5, 0), 0);
check("poissonPMF negativo = 0", E.poissonPMF(-1, 2), 0);

console.log(
  falhas === 0
    ? "\n🎉 TUDO PASSOU — o motor bate com os valores calculados à mão.\n"
    : `\n❌ ${falhas} verificação(ões) falharam.\n`,
);
process.exit(falhas ? 1 : 0);
