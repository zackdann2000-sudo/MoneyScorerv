const assert = require("assert");
const { cached, idadeMaisAntiga, cacheBust, MAX_CACHE_SIZE } = require("./cache.js");

async function main() {
  /* sem nada em cache: nenhuma idade para reportar */
  assert.strictEqual(idadeMaisAntiga("/soccer/"), null, "cache vazio devolve null");

  /* popula duas chaves: uma do ESPN, outra de outro assunto */
  await cached("https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard", 60000, async () => ({ ok: 1 }));
  await cached("https://exemplo.com/outra-coisa", 60000, async () => ({ ok: 2 }));

  const idade = idadeMaisAntiga("/soccer/");
  assert.ok(idade != null, "chave do ESPN é encontrada");
  assert.ok(idade >= 0 && idade < 5000, `acabou de ser gravada, idade pequena (${idade}ms)`);
  assert.strictEqual(idadeMaisAntiga("/basquete/"), null, "trecho sem correspondência devolve null");

  /* a idade é a do MAIS ANTIGO (pessimista), não a do mais novo */
  const velho = Date.now() - 3600_000;
  const store = globalThis.__gsCache;
  const chaveVelha = "https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard";
  store.set(chaveVelha, { at: velho, ttl: 60000, data: { ok: 3 } });
  const idadeAntiga = idadeMaisAntiga("/soccer/");
  assert.ok(idadeAntiga >= 3590_000, `deve pegar o payload mais antigo (${idadeAntiga}ms)`);

  /* entrada vencida não é removida só por ser lida (quem decide é o TTL do cached) */
  assert.strictEqual(store.size >= 3, true);

  cacheBust("https://site.api.espn.com");
  assert.strictEqual(idadeMaisAntiga("/soccer/"), null, "cacheBust limpa as chaves do prefixo");

  /* ==========================================================================
   * CICLO DE VIDA (P1-7) — TTL na leitura, teto de tamanho e despejo por uso.
   * Antes: entrada vencida ficava no Map para sempre e não havia teto nenhum.
   * ======================================================================== */
  store.clear();

  /* 1) TTL: ler uma chave vencida apaga a linha do Map e busca de novo */
  const chaveTtl = "https://exemplo.com/ttl";
  await cached(chaveTtl, 10, async () => ({ v: 1 }));
  assert.strictEqual(store.has(chaveTtl), true, "entrada gravada");
  await new Promise((r) => setTimeout(r, 30)); // passa o TTL de 10ms
  const renovado = await cached(chaveTtl, 60000, async () => ({ v: 2 }));
  assert.strictEqual(renovado.v, 2, "TTL vencido busca de novo");
  assert.strictEqual(store.get(chaveTtl).data.v, 2, "a entrada é SUBSTITUÍDA (não duplicada)");
  assert.strictEqual([...store.keys()].filter((k) => k === chaveTtl).length, 1, "sem chave repetida");

  /* 2) Varredura na escrita: inserir uma chave limpa as vencidas de outras */
  const chavePodre = "https://exemplo.com/podre";
  await cached(chavePodre, 10, async () => ({ v: "velho" }));
  await new Promise((r) => setTimeout(r, 30));
  await cached("https://exemplo.com/outra", 60000, async () => ({ v: "novo" }));
  assert.strictEqual(store.has(chavePodre), false, "entrada vencida saiu na varredura do insert");

  /* 3) Stale fallback continua valendo: fornecedor fora do ar devolve o antigo */
  const chaveStale = "https://exemplo.com/stale";
  await cached(chaveStale, 10, async () => ({ v: "antigo" }));
  await new Promise((r) => setTimeout(r, 30));
  const stale = await cached(chaveStale, 60000, async () => {
    throw new Error("fonte fora");
  });
  assert.strictEqual(stale.v, "antigo", "stale fallback preservado");
  assert.strictEqual(store.has(chaveStale), true, "o dado antigo volta ao mapa para as próximas chamadas");

  /* 4) Sem entrada antiga, a falha sobe (não inventa resposta) */
  let subiu = false;
  try {
    await cached("https://exemplo.com/sem-cache", 60000, async () => {
      throw new Error("fonte fora");
    });
  } catch {
    subiu = true;
  }
  assert.strictEqual(subiu, true, "erro sem cache é propagado");

  /* 5) Teto de tamanho: nunca passa de MAX_CACHE_SIZE */
  store.clear();
  for (let i = 0; i < MAX_CACHE_SIZE + 20; i++) {
    await cached(`https://exemplo.com/lru/${i}`, 60000, async () => ({ i }));
  }
  assert.strictEqual(store.size, MAX_CACHE_SIZE, `teto respeitado (${store.size})`);
  assert.strictEqual(store.has("https://exemplo.com/lru/0"), false, "o mais antigo foi despejado");
  assert.strictEqual(store.has(`https://exemplo.com/lru/${MAX_CACHE_SIZE + 19}`), true, "o mais novo ficou");

  /* 6) LRU de verdade: usar a chave antiga a salva do próximo despejo */
  store.clear();
  await cached("https://exemplo.com/lru-a", 60000, async () => ({ a: 1 }));
  for (let i = 0; i < MAX_CACHE_SIZE - 1; i++) {
    await cached(`https://exemplo.com/lru-b${i}`, 60000, async () => ({ i }));
  }
  assert.strictEqual(store.size, MAX_CACHE_SIZE, "cheio");
  await cached("https://exemplo.com/lru-a", 60000, async () => ({ a: 2 })); // hit: marca uso
  await cached("https://exemplo.com/lru-novo", 60000, async () => ({ n: 1 })); // estoura o teto
  assert.strictEqual(store.size, MAX_CACHE_SIZE, "segue no teto");
  assert.strictEqual(store.has("https://exemplo.com/lru-a"), true, "quem foi usado há pouco ficou");
  assert.strictEqual(store.has("https://exemplo.com/lru-b0"), false, "o não usado saiu primeiro");

  store.clear();

  console.log(`✅ cache ok — idade mais antiga: ${Math.round(idadeAntiga / 1000)}s · cacheBust limpa por prefixo`);
}

main().catch((e) => {
  console.error("❌ cache:", e.message);
  process.exit(1);
});
