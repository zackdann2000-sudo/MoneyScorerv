#!/usr/bin/env node
/**
 * Aplica drizzle/0026_team_xg_norm.sql — coluna `team_name_norm` em team_xg_cache.
 *
 * Por que existe (mesmo motivo das 0021/0022/0025): o banco de produção foi
 * construído com `db:push` + SQL manual, então `drizzle.__drizzle_migrations`
 * não bate com o journal e `drizzle-kit migrate` tentaria reaplicar `0000_init`.
 *
 * O que entra:
 *   team_name_norm         nome normalizado (minúsculo, sem acento, [a-z0-9])
 *   team_xg_cache_norm_idx índice da busca por nome — a leitura do cache deixa
 *                          de trazer a tabela inteira para filtrar em JS
 *   UPDATE de backfill     preenche as linhas antigas usando a MESMA regra
 *
 *   npm run db:migrate-xg-norm
 *   npm run db:migrate-xg-norm -- --dry-run
 *
 * Aborta se qualquer statement falhar: rollback total, nada fica pela metade.
 * Sem esta migração o app NÃO quebra: `lerCachePorNome` cai no catch e devolve
 * `null`, e o caminho por `team_id` (que já existia) continua servindo o cache.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0026_team_xg_norm.sql";
const dryRun = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

const COLUNA = "team_name_norm";
const INDICE = "team_xg_cache_norm_idx";

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
  const c = await client.query(
    `select 1 from information_schema.columns where table_schema='public' and table_name='team_xg_cache' and column_name=$1`,
    [COLUNA],
  );
  const i = await client.query(
    `select 1 from pg_indexes where schemaname='public' and indexname=$1`,
    [INDICE],
  );
  const [t] = (
    await client.query(`select count(*)::int as n from team_xg_cache`)
  ).rows;
  const [vazio] = c.rowCount
    ? (await client.query(`select count(*)::int as n from team_xg_cache where team_name_norm = '' and team_name <> ''`)).rows
    : [{ n: 0 }];
  return { coluna: c.rowCount > 0, indice: i.rowCount > 0, linhas: t?.n ?? 0, semNorm: vazio?.n ?? 0 };
}

async function main() {
  console.log(`▶ ${MIGRATION}${dryRun ? " (dry-run)" : ""}`);
  await client.connect();

  const antes = await estado();
  console.log(
    `  antes: coluna=${antes.coluna ? "sim" : "não"} índice=${antes.indice ? "sim" : "não"} linhas=${antes.linhas} sem_norm=${antes.semNorm}`,
  );

  if (dryRun) {
    console.log(`  ${declaracoes.length} statement(s) seriam aplicados:`);
    declaracoes.forEach((d, i) => console.log(`  ${i + 1}. ${d.split("\n")[0].slice(0, 90)}…`));
    await client.end();
    return;
  }

  try {
    await client.query("begin");
    for (const d of declaracoes) await client.query(d);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    console.error(`❌ falhou; rollback aplicado: ${e.message}`);
    await client.end();
    process.exit(1);
  }

  const depois = await estado();
  console.log(
    `  depois: coluna=${depois.coluna ? "sim" : "não"} índice=${depois.indice ? "sim" : "não"} linhas=${depois.linhas} sem_norm=${depois.semNorm}`,
  );
  if (!depois.coluna || !depois.indice) {
    console.error("❌ verificação falhou (coluna ou índice ausente)");
    process.exit(1);
  }
  console.log("✅ 0026 aplicada");
  await client.end();
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
