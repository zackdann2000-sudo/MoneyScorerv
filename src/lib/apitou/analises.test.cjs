/**
 * Teste do bloco de 4 análises do /apitou.
 *
 * As médias são fictícias, mas TODOS os esperados (λ, linha, probabilidade)
 * foram calculados à mão com a fórmula da Poisson, não gerados pelo código:
 *   λ = 3   -> P(X>2.5) = 1 - e^-3 (1 + 3 + 4.5)   = 0.5768
 *   λ = 3.5 -> P(X>2.5) = 1 - e^-3.5 (1 + 3.5 + 6.125) = 0.6792
 *   λ = 0.65 -> P(X>0.5) = 1 - e^-0.65             = 0.4780
 * Se a regra mudar, o teste quebra — é esse o ponto.
 *
 * Rodar:
 *   npx tsc src/lib/apitou/engine.ts src/lib/apitou/analises.ts \
 *     --target es2022 --module commonjs --outDir .abuild --skipLibCheck
 *   cp src/lib/apitou/analises.test.cjs .abuild/ && node .abuild/analises.test.cjs
 */
const { quatroAnalises } = require("./analises.js");

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
const porId = (arr, id) => arr.find((a) => a.id === id);

/* 1. Gols: λ casa 2, λ fora 1 -> total 3, linha 2.5, 57.68% */
{
  const r = quatroAnalises(
    { jogos: 10, gols: 2, golsSof: 1 },
    { jogos: 8, gols: 1, golsSof: 2 },
  );
  const g = porId(r, "gols");
  check("gols lambda", g.lambda, 3);
  check("gols linha", g.linha, 2.5);
  check("gols prob", g.prob, 0.5768);
  check("gols favorito (mandante 2 x 1 visitante)", g.favorito, "casa");
  check("gols medias", [g.mediaCasa, g.mediaFora, g.concedidaCasa, g.concedidaFora], [2, 1, 1, 2]);
  check("gols amostra", [g.amostraCasa, g.amostraFora], [10, 8]);
  check("gols semDados", g.semDados, false);
}

/* 2. Cartões: λ 2 e 1.5 -> total 3.5, linha 2.5, 67.92% */
{
  const r = quatroAnalises(
    { jogos: 12, amarelos: 2, amarelosSof: 1.5 },
    { jogos: 12, amarelos: 1.5, amarelosSof: 2 },
  );
  const c = porId(r, "cartoes");
  check("cartoes lambda", c.lambda, 3.5);
  check("cartoes linha", c.linha, 2.5);
  check("cartoes prob", c.prob, 0.6792);
  check("cartoes favorito", c.favorito, "casa");
}

/* 3. Faltas sem campo `sof` (cache antigo) -> sem dados, nunca zero */
{
  const r = quatroAnalises(
    { jogos: 10, faltas: 14 },
    { jogos: 10, faltas: 12 },
  );
  const f = porId(r, "faltas");
  check("faltas sem dados", f.semDados, true);
  check("faltas lambda nulo", [f.lambda, f.linha, f.prob], [null, null, null]);
}

/* 4. Faltas completas: λ = (12+11)/2 + (9+10)/2 = 21 -> linha 20.5 */
{
  const r = quatroAnalises(
    { jogos: 10, faltas: 12, faltasSof: 10 },
    { jogos: 10, faltas: 9, faltasSof: 11 },
  );
  const f = porId(r, "faltas");
  check("faltas lambda", f.lambda, 21);
  check("faltas linha", f.linha, 20.5);
  check("faltas prob perto de 50%", [f.prob > 0.45, f.prob < 0.55], [true, true]);
}

/* 5. Impedimentos: λ = 0.3 + 0.35 = 0.65 -> linha 0.5, 1 - e^-0.65 = 47.8% */
{
  const r = quatroAnalises(
    { jogos: 10, impedimentos: 0.3, impedimentosSof: 0.5 },
    { jogos: 10, impedimentos: 0.2, impedimentosSof: 0.3 },
  );
  const i = porId(r, "impedimentos");
  check("impedimentos lambda", i.lambda, 0.65);
  check("impedimentos linha", i.linha, 0.5);
  check("impedimentos prob", i.prob, 0.478);
}

/* 6. Equilíbrio: 2 x 1.9 é menos de 15% de diferença */
{
  const r = quatroAnalises(
    { jogos: 5, gols: 2, golsSof: 1.9 },
    { jogos: 5, gols: 1.9, golsSof: 2 },
  );
  check("equilibrio", porId(r, "gols").favorito, "equilibrio");
}

/* 7. Sem stats (time sem histórico) -> 4 itens, todos sem dados */
{
  const r = quatroAnalises(null, undefined);
  check("sempre 4 itens", r.length, 4);
  check("ordem dos mercados", r.map((x) => x.id), ["gols", "cartoes", "faltas", "impedimentos"]);
  check("todos sem dados", r.every((x) => x.semDados === true), true);
  check("amostra zero", r.every((x) => x.amostraCasa === 0 && x.amostraFora === 0), true);
}

/* 8. Lambda zero (time que não finaliza) não vira probabilidade falsa */
{
  const r = quatroAnalises(
    { jogos: 3, gols: 0, golsSof: 0 },
    { jogos: 3, gols: 0, golsSof: 0 },
  );
  const g = porId(r, "gols");
  check("lambda zero -> sem dados", [g.semDados, g.prob, g.linha], [true, null, null]);
}

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
