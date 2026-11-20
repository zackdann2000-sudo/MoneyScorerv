const assert = require("assert");
const { projetarGols, LINHAS_GOLS } = require("./golsLadder.js");

const pct = (v) => Math.round(v * 100);

/* ---------------- formato ---------------- */

assert.deepStrictEqual(LINHAS_GOLS, [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]);

const linhas = projetarGols(2.7);
assert.strictEqual(linhas.length, 7);
assert.deepStrictEqual(linhas.map((l) => l.linha), LINHAS_GOLS);

/* ---------------- matemática (Poisson) ---------------- */

// Over 0.5 = 1 − P(0) = 1 − e^−λ
const o05 = linhas[0].over;
assert.ok(Math.abs(o05 - (1 - Math.exp(-2.7))) < 1e-3, `over0.5 errado: ${o05}`);
// Over + Under = 1 em toda linha
for (const l of linhas) assert.ok(Math.abs(l.over + l.under - 1) < 1e-9, `linha ${l.linha} não soma 1`);
// monotônico: mais gols = menos chance de passar da linha
for (let i = 1; i < linhas.length; i++) {
  assert.ok(linhas[i].over < linhas[i - 1].over, `linha ${linhas[i].linha} deveria ser menor que a anterior`);
}
// ordem de grandeza conhecida: λ 2.7 → over 2.5 perto de 50%
const o25 = linhas.find((l) => l.linha === 2.5).over;
assert.ok(o25 > 0.45 && o25 < 0.58, `over2.5 fora do esperado para λ=2.7: ${o25}`);
// linha alta com λ baixo é quase impossível (≈ 2% em 6.5 com λ 2.7)
assert.ok(linhas.find((l) => l.linha === 6.5).over < 0.03);

/* ---------------- sem dados → nada inventado ---------------- */

assert.deepStrictEqual(projetarGols(0), []);
assert.deepStrictEqual(projetarGols(-1), []);
assert.deepStrictEqual(projetarGols(NaN), []);
assert.deepStrictEqual(projetarGols(2.7, null, []), []);

/* ---------------- odds / de-vig ---------------- */

// mercado publica só a 2.5: 1X2 de odds do par Over/Under
const comOdds = projetarGols(2.7, { ou: 2.5, over: 1.85, under: 1.95 });
const l25 = comOdds.find((l) => l.linha === 2.5);
assert.ok(l25.oddMercado != null, "a linha publicada deve trazer a odd");
assert.ok(l25.oddJusta != null && l25.oddJusta > l25.oddMercado, "a justa é maior que a da casa");
assert.ok(l25.ladoOdd === "over" || l25.ladoOdd === "under");
// as outras linhas não têm odd (a fonte não publica)
for (const l of comOdds.filter((x) => x.linha !== 2.5)) {
  assert.strictEqual(l.oddMercado, null);
  assert.strictEqual(l.oddJusta, null);
  assert.strictEqual(l.ladoOdd, null);
}

// lado destacado = o que o modelo favorece
const overForte = projetarGols(4.2, { ou: 2.5, over: 1.4, under: 2.9 }).find((l) => l.linha === 2.5);
assert.strictEqual(overForte.ladoOdd, "over");
assert.strictEqual(overForte.oddMercado, 1.4);
const underForte = projetarGols(1.6, { ou: 2.5, over: 2.6, under: 1.5 }).find((l) => l.linha === 2.5);
assert.strictEqual(underForte.ladoOdd, "under");
assert.strictEqual(underForte.oddMercado, 1.5);

// linha de mercado em outra linha (3.5) casa só com ela — e destaca o lado que o modelo favorece
const outra = projetarGols(2.7, { ou: 3.5, over: 2.1, under: 1.7 });
assert.strictEqual(outra.find((l) => l.linha === 3.5).oddMercado, 1.7); // λ 2.7 → Under 3.5 é o lado provável
assert.strictEqual(outra.find((l) => l.linha === 3.5).ladoOdd, "under");
assert.strictEqual(outra.find((l) => l.linha === 2.5).oddMercado, null);

// sem ou declarada, nenhuma odd é anexada
assert.ok(projetarGols(2.7, { over: 1.85, under: 1.95 }).every((l) => l.oddMercado === null));
// odd inválida é descartada em vez de virar número inventado
assert.strictEqual(projetarGols(4, { ou: 2.5, over: 0.5, under: 1.2 }).find((l) => l.linha === 2.5).oddMercado, null);

console.log(
  `✅ ladder ok — λ 2.7 · O0.5 ${pct(linhas[0].over)}% · O2.5 ${pct(o25)}% · U2.5 ${pct(linhas[2].under)}% · justa 2.5 ${comOdds[2].oddJusta}`,
);
