#!/usr/bin/env node
/**
 * Cria (ou atualiza) o usuário DONO (owner vitalício) de teste.
 *
 * Uso:
 *   node scripts/seed-admin.mjs
 *   node scripts/seed-admin.mjs --email x@y.com --senha 12345678 --nome "Fulano"
 *   node scripts/seed-admin.mjs --dry-run
 *
 * Por que este script existe: o login usa scrypt com salt (ver src/lib/auth.ts).
 * Gerar o hash "na mão" num SQL qualquer erra o formato `salt:hash` e a senha
 * nunca valida. Aqui reaproveitamos exatamente o mesmo algoritmo.
 *
 * Segurança:
 *   - nunca imprime a senha nem o hash;
 *   - é idempotente: rodar de novo só reescreve o hash/role/plano;
 *   - `expires_at` fica em 2099-12-31 (vitalício) e o email está em OWNER_EMAILS,
 *     então getUser() marca isAdmin=true e o paywall libera (vip=true no app).
 */
import { createRequire } from "node:module";
import { randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const PADRAO = {
  email: "zackdann2000@gmail.com",
  senha: "12345678dan",
  nome: "Zack (Owner)",
  role: "owner",
  plan: "vip",
  /** Vitalício. isLifetime() considera ano >= 2090. */
  expira: "2099-12-31T23:59:59.000Z",
};

function arg(nome, fallback) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return fallback;
}

/** Mesmo formato de src/lib/auth.ts: hashPass(). */
function hashPass(pass) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pass, salt, 64).toString("hex");
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const email = String(arg("email", PADRAO.email)).trim().toLowerCase();
  const senha = String(arg("senha", PADRAO.senha));
  const nome = String(arg("nome", PADRAO.nome));

  if (!email.includes("@") || senha.length < 6) {
    console.error("❌ email inválido ou senha com menos de 6 caracteres.");
    process.exit(1);
  }

  console.log(`→ alvo: ${email} | role=${PADRAO.role} plan=${PADRAO.plan} expira=${PADRAO.expira}`);
  if (dry) {
    console.log("(dry-run) nada foi gravado.");
    return;
  }

  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(RAIZ, ".env") });
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL ausente no .env");
    process.exit(1);
  }

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const client = await pool.connect();
  try {
    const passHash = hashPass(senha);

    // ON CONFLICT garante idempotência: existe -> atualiza, não existe -> cria.
    const { rows } = await client.query(
      `INSERT INTO users (name, email, pass_hash, role, plan, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET
         pass_hash  = EXCLUDED.pass_hash,
         role       = EXCLUDED.role,
         plan       = EXCLUDED.plan,
         expires_at = EXCLUDED.expires_at,
         name       = CASE WHEN users.name IS NULL OR users.name = '' THEN EXCLUDED.name ELSE users.name END
       RETURNING id, email, role, plan, expires_at, created_at`,
      [nome, email, passHash, PADRAO.role, PADRAO.plan, PADRAO.expira],
    );

    const u = rows[0];
    console.log("✅ usuário garantido no banco:");
    console.log(`   id=${u.id} | email=${u.email} | role=${u.role} | plan=${u.plan}`);
    console.log(`   expires_at=${new Date(u.expires_at).toISOString()} (vitalício)`);

    // Confere que o hash gravado valida a senha (mesma checagem do login).
    const chk = await client.query("SELECT pass_hash FROM users WHERE email = $1", [email]);
    const [salt, hash] = String(chk.rows[0].pass_hash).split(":");
    const ok = scryptSync(senha, salt, 64).equals(Buffer.from(hash, "hex"));
    console.log(ok ? "✅ senha confere com o hash gravado" : "❌ senha NÃO confere (bug no seed)");
    if (!ok) process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error("❌ falha:", e?.message || e);
  process.exit(1);
});
