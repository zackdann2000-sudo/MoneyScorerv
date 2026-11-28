#!/usr/bin/env node
/**
 * Cifra em repouso as chaves de fornecedor já gravadas em `api_keys`.
 *
 * PROBLEMA QUE RESOLVE: até a chegada de `src/lib/encryption.ts`, todo token de
 * fornecedor ia para `api_keys.token` em TEXTO CLARO. O código novo já cifra
 * tudo que `setKey()` gravar daqui para frente; este script trata o acervo que
 * já estava no banco.
 *
 * PRÉ-REQUISITO (obrigatório): `ENCRYPTION_SECRET` definida no ambiente.
 *   local:  echo "ENCRYPTION_SECRET=$(openssl rand -base64 32)" >> .env
 *   Vercel: painel → Settings → Environment Variables (Production e Preview)
 *
 * COMANDOS
 *   npm run keys:encrypt -- --dry-run   # mostra o que faria, sem escrever
 *   npm run keys:encrypt                # aplica
 *
 * GARANTIAS
 *   - IDEMPOTENTE: linha que já tem o prefixo `enc:v1:` é pulada; rodar duas
 *     vezes não cifra o que já está cifrado (o que corromperia o valor).
 *   - ATÔMICO: uma transação; se qualquer UPDATE falhar, rollback total.
 *   - NÃO IMPRIME SEGREDO: nem claro, nem ciphertext. Só provedor e contagem.
 *   - VERIFICA NO FIM: relê as linhas e confirma que todas as chaves não vazias
 *     abrem com a chave mestra atual.
 *
 * ORDEM DE DEPLOY SEGURA (a leitura é tolerante ao texto claro, então não há
 * janela de indisponibilidade):
 *   1. definir ENCRYPTION_SECRET na Vercel (Production + Preview) e no .env;
 *   2. deploy do código novo (lê claro e cifrado);
 *   3. Node com a env: npm run keys:encrypt -- --dry-run  → conferir;
 *   4. npm run keys:encrypt                                → aplicar;
 *   5. testar um fornecedor pagos (ex.: /api/matches/[id]/oracle com Sportmonks).
 */
import "dotenv/config";
import { createCipheriv, createHash, createDecipheriv, randomBytes } from "node:crypto";
import pg from "pg";

const ENV_SECRET = "ENCRYPTION_SECRET";
const PREFIXO = "enc:v1:";
const ALGORITMO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

const dryRun = process.argv.includes("--dry-run");

/** Mesma derivação de `src/lib/encryption.ts` (SHA-256 do segredo → 32 bytes). */
function chaveMestra() {
  const segredo = String(process.env[ENV_SECRET] ?? "").trim();
  if (!segredo) return null;
  return createHash("sha256").update(segredo, "utf8").digest();
}

/** Mesmo formato de `encrypt()`: enc:v1:<iv>.<tag>.<ciphertext> em base64url. */
function encrypt(texto, chave) {
  if (!texto) return "";
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, chave, iv);
  const corpo = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIXO}${iv.toString("base64url")}.${tag.toString("base64url")}.${corpo.toString("base64url")}`;
}

/** Só para a verificação final: prova que o que foi gravado abre. */
function decrypt(armazenado, chave) {
  try {
    const partes = String(armazenado).slice(PREFIXO.length).split(".");
    if (partes.length !== 3) return "";
    const [ivB64, tagB64, corpoB64] = partes;
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const corpo = Buffer.from(corpoB64, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !corpo.length) return "";
    const d = createDecipheriv(ALGORITMO, chave, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(corpo), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

const mascara = (v) => (v.length <= 8 ? "••••" : `${v.slice(0, 4)}••••${v.slice(-2)}`);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

const chave = chaveMestra();
if (!chave) {
  console.error(
    `❌ ${ENV_SECRET} não definida neste ambiente.\n` +
      `   Gere uma: openssl rand -base64 32\n` +
      `   .env local: ${ENV_SECRET}=<valor>\n` +
      `   Vercel: Settings → Environment Variables (Production e Preview)\n` +
      `   Sem ela o script não roda — e gravar em texto claro é o problema que ele existe para corrigir.`,
  );
  process.exit(2);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  console.log(`▶ cifrando chaves de api_keys${dryRun ? " (dry-run)" : ""}`);
  await client.connect();

  const { rows } = await client.query(
    `select provider, token from api_keys order by provider`,
  );
  console.log(`  ${rows.length} linha(s) em api_keys`);

  const paraCifrar = [];
  for (const r of rows) {
    const token = String(r.token ?? "");
    if (!token) {
      console.log(`  · ${r.provider.padEnd(16)} vazio → pulado`);
      continue;
    }
    if (token.startsWith(PREFIXO)) {
      console.log(`  · ${r.provider.padEnd(16)} já cifrado (${mascara(token)}) → pulado`);
      continue;
    }
    paraCifrar.push({ provider: r.provider, claro: token });
    console.log(`  · ${r.provider.padEnd(16)} TEXTO CLARO (${mascara(token)}) → cifrar`);
  }

  if (!paraCifrar.length) {
    console.log("✅ nada a fazer: nenhuma chave em texto claro");
    await client.end();
    return;
  }

  if (dryRun) {
    console.log(`  ${paraCifrar.length} chave(s) seriam cifradas. Nada foi escrito (dry-run).`);
    await client.end();
    return;
  }

  try {
    await client.query("begin");
    for (const { provider, claro } of paraCifrar) {
      const cifrado = encrypt(claro, chave);
      if (decrypt(cifrado, chave) !== claro) throw new Error(`roundtrip falhou em ${provider}`);
      await client.query(`update api_keys set token = $1, updated_at = now() where provider = $2`, [
        cifrado,
        provider,
      ]);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error(`❌ falhou; rollback aplicado: ${e.message}`);
    await client.end();
    process.exit(1);
  }

  /* Verificação pós-commit: relê do banco e confirma que tudo abre. */
  const { rows: depois } = await client.query(`select provider, token from api_keys`);
  const problemas = [];
  for (const r of depois) {
    const token = String(r.token ?? "");
    if (!token) continue;
    if (!token.startsWith(PREFIXO)) problemas.push(`${r.provider}: ainda em texto claro`);
    else if (!decrypt(token, chave)) problemas.push(`${r.provider}: ciphertext não abre com a chave atual`);
  }

  if (problemas.length) {
    console.error("❌ verificação falhou:");
    problemas.forEach((p) => console.error(`   - ${p}`));
    await client.end();
    process.exit(1);
  }

  console.log(`✅ ${paraCifrar.length} chave(s) cifradas e verificadas (todas abrem com a chave mestra atual)`);
  await client.end();
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
