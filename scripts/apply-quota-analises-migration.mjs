#!/usr/bin/env node
/**
 * Aplica drizzle/0025_quota_analises.sql — tabela `analyses_opened`.
 *
 * Por que existe (mesmo motivo das 0021/0022): o banco de produção foi
 * construído com `db:push` + SQL manual, então `drizzle.__drizzle_migrations`
 * não bate com o journal e `drizzle-kit migrate` tentaria reaplicar `0000_init`.
 * `push` mexe no schema inteiro. Aqui o alvo é só a 0025, em UMA transação,
 * idempotente (CREATE TABLE/INDEX IF NOT EXISTS + constraint condicional).
 *
 * O que entra:
 *   analyses_opened            → quitação da cota diária (user, match, dia)
 *   analyses_opened_uq         → único por (user_id, match_id, dia): garante 1
 *                                débito por partida/dia mesmo com abas paralelas
 *   analyses_opened_dia_idx    → limpeza/consultas por dia
 *
 *   npm run db:migrate-quota-analises
 *   npm run db:migrate-quota-analises -- --dry-run
 *
 * Aborta se qualquer statement falhar: rollback total, nada fica pela metade.
 * Sem esta tabela o app NÃO fica inseguro: `consumirAnaliseDePartida` cai no
 * débito simples (cobra sempre), só perde a idempotência de reabertura.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0025_quota_analises.sql";
const dryRun = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

const TABELA = "analyses_opened";
const INDICES = ["analyses_opened_uq", "analyses_opened_dia_idx"];

/** CREATE TABLE / INDEX já vêm com IF NOT EXISTS no arquivo; reforça. */
function idempotente(stmt) {
  return stmt
    .replace(/create table (?!if not exists)/i, "create table if not exists ")
    .replace(/create index (?!if not exists)/i, "create index if not exists ")
    .replace(/create unique index (?!if not exists)/i, "create unique index if not exists ");
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
  const t = await client.query(
    `select table_name from information_schema.tables where table_schema='public' and table_name=$1`,
    [TABELA],
  );
  const i = await client.query(
    `select indexname from pg_indexes where schemaname='public' and indexname = any($1::text[])`,
    [INDICES],
  );
  const [n] = (
    await client.query(`select count(*)::int as n from pg_class where relname=$1 and relkind='r'`, [TABELA])
  ).rows;
  return { tabela: t.rowCount > 0, indices: i.rows.map((r) => r.indexname), existe: n.n > 0 };
}

async function main() {
  console.log(`▶ ${MIGRATION}${dryRun ? " (dry-run)" : ""}`);
  await client.connect();

  const antes = await estado();
  console.log(`  antes: tabela=${antes.tabela ? "sim" : "não"} índices=[${antes.indices.join(", ") || "—"}]`);

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
  console.log(`  depois: tabela=${depois.tabela ? "sim" : "não"} índices=[${depois.indices.join(", ") || "—"}]`);
  const faltando = INDICES.filter((i) => !depois.indices.includes(i));
  if (!depois.tabela || faltando.length) {
    console.error(`❌ verificação falhou (faltando: ${faltando.join(", ") || "tabela"})`);
    process.exit(1);
  }
  console.log("✅ 0025 aplicada");
  await client.end();
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
