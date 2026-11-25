/**
 * Teste do win-prob ao vivo.
 *
 * Os lances são sintéticos, mas as asserções são invariantes que qualquer
 * modelo honesto precisa cumprir (soma 100, placar manda no fim do jogo, gol
 * contra credita o adversário, pressão desloca a probabilidade). Nenhum valor
 * esperado é copiado da saída do próprio código.
 *
 * Rodar:
 *   ./scripts/unit-tests.sh winProb
 */
const { calcularWinProb, serieWinProb, placarAte, prob1x2, fatorPressao } = require("./winProb.js");

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) console.log(`✅ ${nome}`);
  else {
    falhas++;
    console.log(`❌ ${nome}${detalhe ? `\n   ${detalhe}` : ""}`);
  }
}
const perto = (a, b, tol) => Math.abs(a - b) <= tol;

// 1. Soma sempre 100
const r1 = calcularWinProb([{ minuto: 1, tipo: "shot-off-target", lado: "home" }]);
ok("soma das três probabilidades = 100", perto(r1.casa + r1.empate + r1.fora, 100, 0.3), JSON.stringify(r1));

// 2. Fim de jogo: 0-0 aos 90' é empate quase certo
const empate90 = calcularWinProb([{ minuto: 3, tipo: "corner", lado: "home" }], { minuto: 90 });
ok("0-0 aos 90' → empate ≥ 97%", empate90.empate >= 97, `empate=${empate90.empate}`);

// 3. 2-0 aos 85' → mandante domina
const vencendo = calcularWinProb(
  [
    { minuto: 10, tipo: "goal", lado: "home" },
    { minuto: 50, tipo: "goal", lado: "home" },
  ],
  { minuto: 85 },
);
ok("2-0 aos 85' → mandante ≥ 90%", vencendo.casa >= 90, `casa=${vencendo.casa}`);
ok("2-0 aos 85' → visitante ≤ 2%", vencendo.fora <= 2, `fora=${vencendo.fora}`);

// 4. Gol contra credita o adversário
const contra = placarAte([{ minuto: 20, tipo: "own", lado: "home" }], 30);
ok("gol contra do mandante → 0-1", contra.casa === 0 && contra.fora === 1, JSON.stringify(contra));

// 5. Pressão desloca a probabilidade (mesmo placar, mesmo xG, lados trocados)
const base = [
  { minuto: 12, tipo: "shot-on-target", lado: "home" },
  { minuto: 33, tipo: "shot-off-target", lado: "away" },
];
const pressaoCasa = calcularWinProb([...base, { minuto: 59, tipo: "shot-on-target", lado: "home" }], { minuto: 60 });
const pressaoFora = calcularWinProb([...base, { minuto: 59, tipo: "shot-on-target", lado: "away" }], { minuto: 60 });
ok("pressão do mandante aumenta a chance do mandante", pressaoCasa.casa > pressaoFora.casa, `${pressaoCasa.casa} vs ${pressaoFora.casa}`);

// 6. Fator de pressão é simétrico e neutro aos 50%
ok("fator(50) = 1", perto(fatorPressao(50), 1, 1e-9), String(fatorPressao(50)));
ok("fator(100) = 1,35 e fator(0) = 0,65", perto(fatorPressao(100), 1.35, 1e-9) && perto(fatorPressao(0), 0.65, 1e-9));
ok("fator(null) = 1", fatorPressao(null) === 1);

// 7. Poisson puro: mais gols esperados → mais vitória
const pouco = prob1x2(0, 0.2, 0.2);
const muito = prob1x2(0, 2.5, 0.2);
ok("λ maior aumenta a vitória do lado", muito.casa > pouco.casa, `${pouco.casa} → ${muito.casa}`);
ok("prob1x2 soma 100", perto(muito.casa + muito.empate + muito.fora, 100, 0.3));

// 8. Série termina no número atual e é monotônica em minutos
const lancesSerie = [
  { minuto: 5, tipo: "goal", lado: "home" },
  { minuto: 20, tipo: "shot-on-target", lado: "away" },
  { minuto: 47, tipo: "goal", lado: "away" },
  { minuto: 63, tipo: "shot-on-target", lado: "home" },
];
const serie = serieWinProb(lancesSerie, { passo: 5 });
const atual = calcularWinProb(lancesSerie);
const ultimo = serie[serie.length - 1];
ok("série tem pelo menos 3 pontos", serie.length >= 3, `n=${serie.length}`);
ok("último ponto = minuto atual", ultimo.min === atual.minuto);
ok("último ponto = probabilidade atual", perto(ultimo.casa, atual.casa, 0.05));
ok(
  "minutos crescentes",
  serie.every((p, i) => i === 0 || p.min > serie[i - 1].min),
);

// 9. Sem lance → sem número (nada de gráfico decorativo)
ok("sem lances → null", calcularWinProb([]) === null);
ok("série vazia sem lances", serieWinProb([]).length === 0);

// 10. Relógio à frente da narração: o minuto do relógio manda no cálculo
//     (bug: card travado em 19' com o placar do topo em 26').
const atrasados = [
  { minuto: 6, tipo: "shot-on-target", lado: "home" },
  { minuto: 19, tipo: "shot-on-target", lado: "away" },
];
const semRelogio = calcularWinProb(atrasados); // cai no último lance = 19
const comRelogio = calcularWinProb(atrasados, { minuto: 26 });
ok("minuto explícito substitui o último lance", semRelogio.minuto === 19 && comRelogio.minuto === 26, `${semRelogio.minuto} → ${comRelogio.minuto}`);
ok("minuto do relógio entra na série como último ponto", comRelogio.minuto === 26 && serieWinProb(atrasados, { minuto: 26, passo: 5 }).pop().min === 26);
ok("acréscimo de tempo não estoura o modelo", calcularWinProb(atrasados, { minuto: 92 }).minuto === 92);

// 11. Placar oficial do cabeçalho ganha da narração incompleta
const semGol = calcularWinProb(atrasados, { minuto: 26 });
const comPlacar = calcularWinProb(atrasados, { minuto: 26, placar: { casa: 1, fora: 0 } });
ok("narração sem o gol → placar derivado fica 0-0", semGol.placar.casa === 0 && semGol.placar.fora === 0, JSON.stringify(semGol.placar));
ok("placar informado é usado no card", comPlacar.placar.casa === 1 && comPlacar.placar.fora === 0, JSON.stringify(comPlacar.placar));
ok("placar informado muda a probabilidade", comPlacar.casa > semGol.casa, `${comPlacar.casa} vs ${semGol.casa}`);
ok("série usa o placar informado no ponto atual", serieWinProb(atrasados, { minuto: 26, passo: 5, placar: { casa: 1, fora: 0 } }).pop().casa === comPlacar.casa);

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nwinProb: tudo certo.");
