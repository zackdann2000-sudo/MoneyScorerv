const assert = require("assert");
const { resumirH2H, divergenciaPlacar, MIN_H2H_CONFIAVEL } = require("./h2hEngine.js");

/* ---------- vazio / sem dado → null (regra de ouro) ---------- */
assert.strictEqual(resumirH2H(null), null);
assert.strictEqual(resumirH2H([]), null);
assert.strictEqual(resumirH2H(undefined), null);
// placar inválido não vira número inventado
assert.strictEqual(resumirH2H([{ golsCasa: NaN, golsFora: 1 }]), null);

/* ---------- 5 confrontos reais ---------- */
const jogos = [
  { golsCasa: 1, golsFora: 0, data: "2026-01-10" },
  { golsCasa: 1, golsFora: 1, data: "2026-02-10" },
  { golsCasa: 2, golsFora: 0, data: "2026-03-10" },
  { golsCasa: 1, golsFora: 2, data: "2026-04-10" },
  { golsCasa: 0, golsFora: 3, data: "2026-05-10" },
];
const r = resumirH2H(jogos);
assert.strictEqual(r.total, 5);
assert.strictEqual(r.confiavel, true);
assert.strictEqual(MIN_H2H_CONFIAVEL, 3);

// Over 1.5: 1,1,2,3,3 gols → 4 de 5 (o 1-0 não passa)
assert.deepStrictEqual(r.over15, { acertos: 4, total: 5, pct: 80 });
// Over 2.5: totais 1,2,2,3,3 → só os dois de 3 gols passam
assert.deepStrictEqual(r.over25, { acertos: 2, total: 5, pct: 40 });
// Over 3.5: 3 gols não passa; 3 gols não passa → 0
assert.deepStrictEqual(r.over35, { acertos: 0, total: 5, pct: 0 });
// BTTS: 1-1, 1-2 → 2 de 5
assert.deepStrictEqual(r.btts, { acertos: 2, total: 5, pct: 40 });
// Clean sheet em qualquer lado: 1-0, 2-0, 0-3 → 3 de 5
assert.deepStrictEqual(r.cleanSheets, { acertos: 3, total: 5, pct: 60 });

/* ---------- placar exato mais repetido ---------- */
// 1-0 aparece 1x, 1-1 1x, 2-0 1x, 1-2 1x, 0-3 1x → empate total, vale o primeiro
assert.ok(r.placarComum);
assert.strictEqual(r.placarComum.vezes, 1);
assert.strictEqual(r.placarComum.oddJusta, 5);

const repetido = resumirH2H([
  { golsCasa: 1, golsFora: 0, data: "2026-01-10" },
  { golsCasa: 1, golsFora: 0, data: "2026-02-10" },
  { golsCasa: 1, golsFora: 0, data: "2026-03-10" },
  { golsCasa: 2, golsFora: 2, data: "2026-04-10" },
]);
assert.strictEqual(repetido.placarComum.placar, "1-0");
assert.strictEqual(repetido.placarComum.vezes, 3);
assert.strictEqual(repetido.placarComum.pct, 75);
assert.strictEqual(repetido.placarComum.oddJusta, 1.33);
assert.ok(Math.abs(repetido.placarComum.prob - 0.75) < 1e-9);

/* ---------- médias só quando a fonte entrega ---------- */
assert.strictEqual(r.medias.cartoes, null);
assert.strictEqual(r.medias.faltas, null);
assert.strictEqual(r.medias.escanteios, null);

const comExtras = resumirH2H([
  { golsCasa: 1, golsFora: 0, cartoes: 4, faltas: 20, escanteios: 9 },
  { golsCasa: 2, golsFora: 1, cartoes: 6, faltas: 26, escanteios: 11 },
]);
assert.strictEqual(comExtras.medias.cartoes, 5);
assert.strictEqual(comExtras.medias.faltas, 23);
assert.strictEqual(comExtras.medias.escanteios, 10);

// mistura: só um jogo tem o dado → média desse jogo, não zero
const parcial = resumirH2H([
  { golsCasa: 1, golsFora: 0, cartoes: 3, faltas: null },
  { golsCasa: 0, golsFora: 0, cartoes: null, faltas: 18 },
]);
assert.strictEqual(parcial.medias.cartoes, 3);
assert.strictEqual(parcial.medias.faltas, 18);

/* ---------- amostra curta ---------- */
const dois = resumirH2H([
  { golsCasa: 1, golsFora: 0 },
  { golsCasa: 2, golsFora: 1 },
]);
assert.strictEqual(dois.total, 2);
assert.strictEqual(dois.confiavel, false);

/* ---------- texto usa só o que existe ---------- */
assert.ok(r.texto.includes("5 confrontos"));
assert.ok(r.texto.includes("Over 1.5 saiu em 4 (80%)"));
assert.ok(!r.texto.includes("NaN"));
assert.ok(!r.texto.toLowerCase().includes("undefined"));

/* ---------- divergência com odd de mercado ---------- */
assert.strictEqual(divergenciaPlacar(r.placarComum, null), null);
assert.strictEqual(divergenciaPlacar(r.placarComum, 0), null);
assert.strictEqual(divergenciaPlacar(null, 10), null);

// placar 1-0 saiu 3 de 4 (75%) → odd justa 1.33; mercado 2.00 = EV +50%
const d = divergenciaPlacar(repetido.placarComum, 2);
assert.ok(d);
assert.strictEqual(d.rotulo, "valor");
assert.strictEqual(d.oddJusta, 1.33);
assert.ok(d.evPct > 40);

// mercado abaixo do justo → evitar
assert.strictEqual(divergenciaPlacar(repetido.placarComum, 1.1).rotulo, "evitar");
// mercado no preço justo (~1.33) → neutro
assert.strictEqual(divergenciaPlacar(repetido.placarComum, 1.4).rotulo, "neutro");

console.log(`✅ h2hEngine ok — ${r.total} jogos, over1.5 ${r.over15.pct}%, placar comum ${repetido.placarComum.placar} ${repetido.placarComum.vezes}x`);
