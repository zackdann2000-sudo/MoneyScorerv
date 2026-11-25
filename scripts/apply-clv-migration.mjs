#!/usr/bin/env node
/**
 * Aplica drizzle/0022_clv_faixas_odd.sql — colunas de CLV no Track Record.
 *
 * Por que existe (mesmo motivo da 0021): o banco de produção foi construído com
 * `db:push` + SQL manual, então `drizzle.__drizzle_migrations` não bate com o
 * journal e `drizzle-kit migrate` tentaria reaplicar `0000_init`. `push` mexe no
 * schema inteiro. Aqui o alvo é só a 0022, em UMA transação, idempotente.
 *
 * O que entra em `value_bet_history`:
 *   odd_abertura   real   odd da Pinnacle no instante do pick
 *   odd_fechamento real   odd da Pinnacle lida no cron de liquidação
 *   clv_pct        real   (abertura / fechamento − 1) × 100
 *   fechamento_em  timestamptz
 *   + índice em clv_pct
 *
 *   npm run db:migrate-clv
 *   npm run db:migrate-clv -- --dry-run
 *
 * Aborta se qualquer statement falhar: rollback total, nada fica pela metade.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0022_clv_faixas_odd.sql";
const dryRun = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

const COLUNAS = ["odd_abertura", "odd_fechamento", "clv_pct", "fechamento_em"];
const INDICE = "vbh_clv_idx";

/** ADD COLUMN / CREATE INDEX já vêm com IF NOT EXISTS no arquivo; reforça. */
function idempotente(stmt) {
  return stmt
    .replace(/add column (?!if not exists)/i, "add column if not exists ")
    .replace(/create index (?!if not exists)/i, "create index if not exists ");
}

const declaracoes = readFileSync(MIGRATION, "utf8")
  .split("--> statement-breakpoint")
  .map((s) =>
    s
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean)
  .map((s) => s.replace(/;+$/, ""))
  .map(idempotente);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function estado() {
  const r = await client.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'value_bet_history'
        and column_name = any($1)`,
    [COLUNAS],
  );
  return r.rows.map((x) => x.column_name).sort();
}

try {
  await client.connect();
  const antes = await estado();
  console.log(`antes: ${antes.length ? antes.join(", ") : "(nenhuma coluna de CLV)"}`);

  if (antes.length === COLUNAS.length) {
    console.log("✅ colunas já existem — nada a fazer.");
    await client.end();
    process.exit(0);
  }

  if (dryRun) {
    console.log(`\n-- dry-run: ${declaracoes.length} statement(s)`);
    for (const d of declaracoes) console.log(`\n${d};`);
    await client.end();
    process.exit(0);
  }

  await client.query("begin");
  for (const [i, d] of declaracoes.entries()) {
    try {
      await client.query(d);
    } catch (e) {
      throw new Error(`statement ${i + 1} falhou: ${e.message}\n--- SQL ---\n${d}`);
    }
  }
  await client.query("commit");

  const depois = await estado();
  const faltando = COLUNAS.filter((c) => !depois.includes(c));
  if (faltando.length) throw new Error(`❌ colunas ausentes depois do commit: ${faltando.join(", ")}`);

  const idx = await client.query(
    `select 1 from pg_indexes where schemaname = 'public' and indexname = $1`,
    [INDICE],
  );
  if (!idx.rowCount) throw new Error(`❌ índice ${INDICE} não existe`);

  console.log(`✅ depois: ${depois.join(", ")}`);
  console.log(`✅ índice ${INDICE} presente`);
  await client.end();
} catch (e) {
  try {
    await client.query("rollback");
  } catch {
    /* conexão já caiu */
  }
  console.error(`❌ ${e.message}`);
  await client.end().catch(() => {});
  process.exit(1);
}
