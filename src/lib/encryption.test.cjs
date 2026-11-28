/**
 * Teste da cifragem em repouso (AES-256-GCM) — src/lib/encryption.ts.
 *
 * Módulo puro (só node:crypto), então entra no harness normal de unit tests.
 * O que estes casos travam:
 *   - roundtrip encrypt → decrypt;
 *   - formato `enc:v1:<iv>.<tag>.<ciphertext>` e IV diferente a cada cifragem;
 *   - leitura tolerante: texto claro legado volta intocado (deploy antes da
 *     migração não pode derrubar fornecedor);
 *   - adulteração/vírus de chave: GCM FALHA (devolve "") em vez de lixo;
 *   - `encrypt` sem segredo lança (falha fechada: nunca grava claro);
 *   - PARIDADE com scripts/encrypt-existing-keys.mjs — o script deriva a chave
 *     e monta o formato com outras linhas de código; se divergir, a migração
 *     gravaria valores que o app não abre.
 */
const assert = require("assert");
const { createCipheriv, createDecipheriv, createHash, randomBytes } = require("node:crypto");

const SEGREDO = "segredo-de-teste-32-bytes-aleatorio-abc123";
process.env.ENCRYPTION_SECRET = SEGREDO;

const {
  encrypt,
  decrypt,
  ehCriptografado,
  criptografiaConfigurada,
  PREFIXO,
  ENV_SECRET,
} = require("./encryption.js");

/* Cópia independente do algoritimo usado pelo script de migração. */
const scriptChave = () => createHash("sha256").update(String(process.env[ENV_SECRET] ?? "").trim(), "utf8").digest();
function scriptEncrypt(texto) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scriptChave(), iv);
  const corpo = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIXO}${iv.toString("base64url")}.${tag.toString("base64url")}.${corpo.toString("base64url")}`;
}
function scriptDecrypt(armazenado) {
  const [ivB64, tagB64, corpoB64] = String(armazenado).slice(PREFIXO.length).split(".");
  const d = createDecipheriv("aes-256-gcm", scriptChave(), Buffer.from(ivB64, "base64url"));
  d.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([d.update(Buffer.from(corpoB64, "base64url")), d.final()]).toString("utf8");
}

async function main() {
  const TOKEN = "sk_live_sportmonks_ABCDEFGH1234567890";

  /* 1) roundtrip + formato */
  assert.strictEqual(criptografiaConfigurada(), true, "segredo configurado");
  const cifrado = encrypt(TOKEN);
  assert.ok(cifrado.startsWith(PREFIXO), `prefixo de versão (${cifrado.slice(0, 8)})`);
  assert.strictEqual(ehCriptografado(cifrado), true);
  assert.strictEqual(ehCriptografado(TOKEN), false, "texto claro não é 'criptografado'");
  assert.strictEqual(cifrado.includes(TOKEN), false, "o texto claro não aparece no valor gravado");
  assert.strictEqual(decrypt(cifrado), TOKEN, "roundtrip");

  /* 2) IV aleatório: mesma entrada = valores diferentes, todos abrem */
  const outro = encrypt(TOKEN);
  assert.notStrictEqual(cifrado, outro, "IV aleatório por cifragem");
  assert.strictEqual(decrypt(outro), TOKEN);
  assert.strictEqual(cifrado.split(".").length, 3, "iv.tag.ciphertext");

  /* 3) tolerância ao texto claro legado (pré-migração) */
  assert.strictEqual(decrypt(TOKEN), TOKEN, "texto claro volta como veio");
  assert.strictEqual(decrypt(""), "", "vazio continua vazio");
  assert.strictEqual(encrypt(""), "", "cifrar vazio devolve vazio (apagar chave)");

  /* 4) adulteração e chave errada → "" (GCM autentica) */
  const partes = cifrado.slice(PREFIXO.length).split(".");
  const corpoMexido = `${partes[0]}.${partes[1]}.${Buffer.from("outra coisa").toString("base64url")}`;
  assert.strictEqual(decrypt(`${PREFIXO}${corpoMexido}`), "", "ciphertext adulterado não abre");
  assert.strictEqual(decrypt(`${PREFIXO}invalido`), "", "formato inválido não abre");
  assert.strictEqual(decrypt(`${PREFIXO}a.b`), "", "pedaços faltando não abrem");

  process.env.ENCRYPTION_SECRET = "outro-segredo-completamente-diferente-xyz";
  assert.strictEqual(decrypt(cifrado), "", "chave mestra trocada não abre o acervo antigo");
  process.env.ENCRYPTION_SECRET = SEGREDO;

  /* 5) falha fechada: sem segredo, não grava claro */
  delete process.env.ENCRYPTION_SECRET;
  assert.strictEqual(criptografiaConfigurada(), false, "sem segredo");
  assert.throws(() => encrypt(TOKEN), /ENCRYPTION_SECRET/, "encrypt sem segredo lança");
  process.env.ENCRYPTION_SECRET = SEGREDO;

  /* 6) paridade com o script de migração (as duas direções) */
  const doScript = scriptEncrypt(TOKEN);
  assert.strictEqual(decrypt(doScript), TOKEN, "app decifra o que o script gravou");
  assert.strictEqual(scriptDecrypt(encrypt(TOKEN)), TOKEN, "script decifra o que o app gravou");

  /* 7) unicode e token longo */
  const unicode = "chave-com-acentuação-ção-✓-🔐-e-espaços internos";
  assert.strictEqual(decrypt(encrypt(unicode)), unicode, "unicode preservado");
  const longo = "x".repeat(4096);
  assert.strictEqual(decrypt(encrypt(longo)), longo, "token longo preservado");

  console.log("✅ encryption ok — AES-256-GCM, tolerante a claro legado e com paridade com a migração");
}

main().catch((e) => {
  console.error("❌ encryption:", e.message);
  process.exit(1);
});
