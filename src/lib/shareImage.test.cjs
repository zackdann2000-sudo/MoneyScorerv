const assert = require("assert");
const { nomeArquivo, capturarCard, ATRIBUTO_SEM_IMAGEM } = require("./shareImage.js");

// Slug ASCII: sem acento, sem espaço, sem barra — Android e WhatsApp aceitam.
assert.strictEqual(nomeArquivo("GreenScore Veredito — Over 2.5"), "greenscore-veredito-over-2-5.png");
assert.strictEqual(nomeArquivo("Ambas marcam / Casa"), "ambas-marcam-casa.png");
assert.strictEqual(nomeArquivo("  ...  "), "greenscore.png");
assert.strictEqual(nomeArquivo(""), "greenscore.png");
assert.strictEqual(nomeArquivo("São Paulo x Palmeiras", "jpg"), "sao-paulo-x-palmeiras.jpg");

// Base longa não gera nome infinito.
const longo = nomeArquivo("a".repeat(200));
assert.strictEqual(longo.length, 60 + 4, `tamanho ${longo.length}`);
assert.ok(longo.endsWith(".png"));

// O atributo que mantém o botão fora da imagem é o mesmo que o CSS do card usa.
assert.strictEqual(ATRIBUTO_SEM_IMAGEM, "data-noshare");

// Sem elemento na tela, a captura falha com mensagem clara em vez de gerar
// imagem em branco.
(async () => {
  await assert.rejects(() => capturarCard(null), /Nada para capturar/);
  console.log("shareImage ok");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
