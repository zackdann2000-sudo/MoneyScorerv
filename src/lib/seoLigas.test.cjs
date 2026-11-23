/* Catálogo SEO: URL pública ↔ linhas do banco. Módulo puro, sem rede. */
const assert = require("assert");
const {
  SEO_LIGAS,
  MIN_JOGOS_INDEXAVEIS,
  ligaPorSlug,
  hubSlugsDa,
  caminhoDaLiga,
  tituloSeo,
  descricaoSeo,
  ligasParaListagem,
  idsDeLigaPrincipal,
  analisesDegeneradas,
} = require("./seoLigas.js");

let ok = 0;
const t = (nome, fn) => { fn(); ok++; console.log(`  ok  ${nome}`); };

t("10 ligas no catálogo", () => {
  assert.strictEqual(SEO_LIGAS.length, 10);
  assert.strictEqual(ligasParaListagem().length, 10);
});

t("slug único e em kebab-case", () => {
  const slugs = SEO_LIGAS.map((l) => l.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

t("nenhum hub_league.slug em duas ligas (sem canibalização)", () => {
  const vistos = new Map();
  for (const l of SEO_LIGAS) {
    assert.ok(l.hubSlugs.length > 0, `${l.slug} sem hubSlugs`);
    for (const h of l.hubSlugs) {
      assert.ok(!vistos.has(h), `${h} em ${vistos.get(h)} e ${l.slug}`);
      vistos.set(h, l.slug);
    }
  }
});

t("2. Bundesliga não é reivindicada pela Bundesliga", () => {
  const todos = SEO_LIGAS.flatMap((l) => l.hubSlugs);
  assert.ok(!todos.includes("espn-2-bundesliga"));
  assert.ok(!todos.includes("espn-2-bundesliga "));
});

t("Premier League junta as duas linhas do banco, na ordem de preferência", () => {
  const pl = ligaPorSlug("premier-league");
  assert.deepStrictEqual(hubSlugsDa(pl), ["premier-league", "espn-premier-league"]);
});

t("busca tolera caixa e espaço (link antigo não quebra)", () => {
  assert.strictEqual(ligaPorSlug(" Premier-League ").slug, "premier-league");
  assert.strictEqual(ligaPorSlug("BRASILEIRAO-SERIE-A").slug, "brasileirao-serie-a");
  assert.strictEqual(ligaPorSlug("nao-existe"), undefined);
  assert.strictEqual(ligaPorSlug(""), undefined);
  assert.strictEqual(ligaPorSlug(null), undefined);
});

t("mainLeagueId existe em mainLeagues (ou é null)", () => {
  const ids = idsDeLigaPrincipal();
  for (const l of SEO_LIGAS) {
    if (l.mainLeagueId === null) continue;
    assert.ok(ids.includes(l.mainLeagueId), `${l.slug}: ${l.mainLeagueId} não existe`);
  }
});

t("caminho, título e descrição", () => {
  const l = ligaPorSlug("serie-a");
  assert.strictEqual(caminhoDaLiga(l), "/palpites/serie-a");
  assert.match(tituloSeo(l), /^Palpites Serie A — /);
  // O template do layout já põe a marca; título não pode duplicar.
  assert.ok(!tituloSeo(l).includes("GreenScore"));
  assert.ok(descricaoSeo(l).includes("Serie A"));
  assert.ok(descricaoSeo(l).length <= 300);
});

t("contexto próprio por liga (anti-duplicata)", () => {
  const contextos = SEO_LIGAS.map((l) => l.contexto);
  assert.strictEqual(new Set(contextos).size, contextos.length);
  for (const c of contextos) assert.ok(c.length > 80, "contexto curto demais");
});

t("regra de indexação é 3 jogos", () => {
  assert.strictEqual(MIN_JOGOS_INDEXAVEIS, 3);
});

t("análise degenerada: qualquer resumo repetido bloqueia indexação", () => {
  assert.strictEqual(analisesDegeneradas([]), false);
  assert.strictEqual(analisesDegeneradas(["a"]), false);
  assert.strictEqual(analisesDegeneradas(["a", "a"]), true);
  assert.strictEqual(analisesDegeneradas(["a", "b"]), false);
  // Grupo inteiro repetido (caso real visto no banco antes do fix).
  assert.strictEqual(analisesDegeneradas(["a", "a", "a"]), true);
  // Meio repetido também: 3 jogos, 2 vetores iguais.
  assert.strictEqual(analisesDegeneradas(["a", "b", "b"]), true);
  assert.strictEqual(analisesDegeneradas(["a", "b", "c"]), false);
  // Resumo ausente dos dois lados também é repetição.
  assert.strictEqual(analisesDegeneradas(["null", "null"]), true);
});

console.log(`seoLigas OK — ${ok} teste(s)`);
