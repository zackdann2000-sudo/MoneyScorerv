const assert = require("assert");
const { cached, idadeMaisAntiga, cacheBust } = require("./cache.js");

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

  console.log(`✅ cache ok — idade mais antiga: ${Math.round(idadeAntiga / 1000)}s · cacheBust limpa por prefixo`);
}

main().catch((e) => {
  console.error("❌ cache:", e.message);
  process.exit(1);
});
