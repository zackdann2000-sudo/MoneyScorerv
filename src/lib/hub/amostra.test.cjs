/**
 * Testes de `src/lib/hub/amostra.ts` — as regras puras que impedem a análise
 * degenerada (mesmo número para todos os jogos da liga).
 *
 *   ./scripts/unit-tests.sh amostra
 */
const assert = require("node:assert/strict");
const {
  amostraUtilizavel,
  resumoDeGenerado,
  mediaLiga,
  ESTADOS_FINALIZADOS,
  MIN_JOGOS_MEDIA_LIGA,
  MEDIA_LIGA_PADRAO,
  MEDIA_MANDANTE_PADRAO,
} = require("./amostra.js");

let ok = 0;
const test = (nome, fn) => {
  try {
    fn();
    ok += 1;
    console.log(`  ✓ ${nome}`);
  } catch (e) {
    console.error(`  ✗ ${nome}`);
    throw e;
  }
};

test("0/0 de histórico não é amostra utilizável", () => {
  assert.equal(amostraUtilizavel({ home: 0, away: 0 }), false);
});

test("um lado com histórico já permite publicar", () => {
  assert.equal(amostraUtilizavel({ home: 3, away: 0 }), true);
  assert.equal(amostraUtilizavel({ home: 0, away: 2 }), true);
});

test("resumo salvo com 0/0 é marcado como degenerado", () => {
  assert.equal(resumoDeGenerado({ sampleHome: 0, sampleAway: 0 }), true);
});

test("resumo sem marcador (análise antiga) é regerado: sem isso fica eterno", () => {
  // Antes devolvia false: o resumo placeholder gravado antes dos marcadores
  // existirem nunca era substituído, e a liga ficava em revisao (noindex) para
  // sempre. Regerar é seguro — `amostraUtilizavel` barra a publicação sem dado.
  assert.equal(resumoDeGenerado({}), true);
  assert.equal(resumoDeGenerado({ kind: "balanced", xgHome: 1.42, xgAway: 1.28 }), true);
  assert.equal(resumoDeGenerado({ sampleHome: 4 }), true);
  assert.equal(resumoDeGenerado(null), false);
  assert.equal(resumoDeGenerado(undefined), false);
  // Com os dois marcadores e amostra em pelo menos um lado, está saudável.
  assert.equal(resumoDeGenerado({ sampleHome: 4, sampleAway: 0 }), false);
  assert.equal(resumoDeGenerado({ sampleHome: 4, sampleAway: 3 }), false);
});

test("média da liga recusa amostra pequena", () => {
  assert.equal(mediaLiga(9, MIN_JOGOS_MEDIA_LIGA - 1), null);
});

test("média da liga recusa liga sem gol nenhum (evita o 0,6 degenerado)", () => {
  assert.equal(mediaLiga(0, 20), null);
});

test("média da liga recusa entrada inválida", () => {
  assert.equal(mediaLiga(Number.NaN, 10), null);
  assert.equal(mediaLiga(10, 0), null);
});

test("média da liga confiável é a razão gols/jogos", () => {
  assert.equal(mediaLiga(28, 10), 2.8);
});

test("os padrões neutros não são degenerados", () => {
  assert.ok(MEDIA_LIGA_PADRAO > 1);
  assert.ok(MEDIA_MANDANTE_PADRAO > MEDIA_LIGA_PADRAO);
});

test("jogo finalizado inclui prorrogação e pênaltis", () => {
  assert.deepEqual([...ESTADOS_FINALIZADOS], ["FT", "AET", "PEN"]);
});

console.log(`\n${ok} asserção(ões) verde(s) em amostra`);
