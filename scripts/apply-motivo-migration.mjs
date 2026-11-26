#!/usr/bin/env node
/**
 * Aplica drizzle/0024_motivo_pick.sql (motivo congelado do pick).
 *
 * Por que existe: `value_bet_history` precisa da coluna `motivo` (jsonb) para
 * guardar o retrato do cenário no instante do registro — probabilidade, odd,
 * odd justa, edge, EV, stake, TRUST, amostra, λ, xG e a frase do motor.
 *
 * Por que não `drizzle-kit migrate` nem `push`: o bookkeeping
 * `drizzle.__drizzle_migrations` está fora de sincronia com o journal (o schema
 * nasceu por push + baseline manual), então `migrate` tentaria reaplicar
 * 0000_init, e `push` mexeria no schema inteiro para adicionar uma coluna.
 * Aqui o alvo é só a 0024, idempotente (ADD COLUMN IF NOT EXISTS).
 *
 *   npm run db:migrate-motivo
 *   npm run db:migrate-motivo -- --dry-run
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0024_motivo_pick.sql";
const TABELA = "value_bet_history";
const COLUNA = "motivo";
const dryRun = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

const statements = readFileSync(MIGRATION, "utf8")
  .split("--> statement-breakpoint")
  .map((s) =>
    s
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean)
  .map((s) => s.replace(/;+$/, ""));

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function colunaExiste() {
  const r = await client.query(
    `select data_type, is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = $1 and column_name = $2`,
    [TABELA, COLUNA],
  );
  return r.rows[0] ?? null;
}

try {
  await client.connect();
  const antes = await colunaExiste();
  console.log(`\n▶ ${MIGRATION}`);
  console.log(`  ${TABELA}.${COLUNA}: ${antes ? `já existe (${antes.data_type})` : "ausente"}`);

  if (dryRun) {
    console.log(`\n◻ dry-run: ${statements.length} statement(s) NÃO aplicado(s):`);
    statements.forEach((s) => console.log(`   ${s.replace(/\s+/g, " ")}`));
    process.exit(0);
  }

  await client.query("begin");
  for (const s of statements) await client.query(s);
  await client.query("commit");

  const depois = await colunaExiste();
  if (!depois) {
    console.error(`❌ depois do commit a coluna continua ausente — abortando verificação`);
    process.exit(1);
  }
  console.log(`  ✅ ${TABELA}.${COLUNA} = ${depois.data_type} (nullable: ${depois.is_nullable})`);

  const { rows } = await client.query(
    `select
       count(*)::int as total,
       count(${COLUNA})::int as com_motivo
     from ${TABELA}`,
  );
  console.log(`  linhas: ${rows[0].total} · com motivo: ${rows[0].com_motivo} (o resto é anterior à coluna)\n`);
} catch (e) {
  try {
    await client.query("rollback");
  } catch {}
  console.error(`❌ falhou: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
} finally {
  await client.end();
}
