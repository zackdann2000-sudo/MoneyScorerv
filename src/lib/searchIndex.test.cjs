const assert = require("assert");
const { buscar, pontuar, normalizar, agrupar, MIN_BUSCA } = require("./searchIndex.js");

const cand = (tipo, nome, sub, href, aliases) => ({ tipo, id: nome, nome, sub, href, aliases });

/* ---------- normalização ---------- */
assert.strictEqual(normalizar("São  Paulo"), "sao paulo");
assert.strictEqual(normalizar("  BRASILEIRÃO  "), "brasileirao");
assert.strictEqual(normalizar(null), "");

/* ---------- pontuação ---------- */
assert.strictEqual(pontuar("fla", "Flamengo"), 100);
assert.strictEqual(pontuar("fla", "Flacăra Moreni"), 100);
assert.strictEqual(pontuar("moreni", "Flacăra Moreni"), 70);
assert.strictEqual(pontuar("mengo", "Flamengo"), 45);
assert.strictEqual(pontuar("xyz", "Flamengo"), 0);
assert.strictEqual(pontuar("", "Flamengo"), 0);

/* ---------- mínimo de caracteres ---------- */
const base = [
  cand("time", "Flamengo", "Brasil", "/times/1?league=bra.1"),
  cand("time", "Fluminense", "Brasil", "/times/2?league=bra.1"),
  cand("liga", "Brasileirão Série A", "Brasil", "/palpites/bra.1"),
  cand("liga", "Premier League", "Inglaterra", "/palpites/eng.1"),
  cand("jogo", "Flamengo x Palmeiras", "hoje 21:30", "/jogos/9?liga=bra.1"),
];
assert.strictEqual(MIN_BUSCA, 2);
assert.deepStrictEqual(buscar("f", base), [], "1 letra não busca");

/* ---------- prefixo vence substring, time vence liga/jogo ---------- */
let r = buscar("flam", base);
assert.strictEqual(r[0].nome, "Flamengo", "prefixo + tipo time vem primeiro");
assert.ok(r.some((x) => x.nome === "Flamengo x Palmeiras"), "o jogo também aparece");

/* ---------- acento e caixa ---------- */
r = buscar("brasileirao", base);
assert.strictEqual(r[0].nome, "Brasileirão Série A");
r = buscar("BRASIL", base);
assert.ok(r.length >= 3, "aliases/sub casam pelo país");
assert.strictEqual(r[0].tipo, "time", "empate de score: time vem antes");

/* ---------- aliases pesam menos que o nome ---------- */
const comAlias = [cand("time", "Sport Club", "Brasil", "/times/3", ["Leão da Ilha"])];
assert.ok(buscar("leao", comAlias).length === 1);
const nomeExato = buscar("sport", comAlias);
assert.ok(nomeExato[0].score > buscar("leao", comAlias)[0].score, "nome vale mais que alias");

/* ---------- nada encontrado ---------- */
assert.deepStrictEqual(buscar("zzz", base), []);

/* ---------- limite e agrupamento ---------- */
const muitos = Array.from({ length: 30 }, (_, i) => cand("time", `Time ${String(i).padStart(2, "0")} FC`, "Brasil", `/times/${i}`));
assert.strictEqual(buscar("time", muitos).length, 12, "teto padrão de 12");
assert.strictEqual(buscar("time", muitos, { limite: 3 }).length, 3);
const g = agrupar(buscar("fla", base));
assert.ok(g.times.length && g.jogos.length);
assert.strictEqual(g.ligas.length, 0, "nada de liga casando 'fla'");

console.log("searchIndex: ok");
