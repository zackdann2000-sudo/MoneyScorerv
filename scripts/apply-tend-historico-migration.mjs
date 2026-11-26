#!/usr/bin/env node
/**
 * Aplica drizzle/0023_team_history_cache.sql (cache do motor de tendências).
 *
 * Por que existe: o motor "bateu X de Y" precisa de 10 jogos por time, e
 * `getTeamHistory()` custa 1 schedule + N summaries. Sem cache persistente,
 * cada cold start da Vercel refaz ~22 requisições por partida. A tabela é o que
 * faz o número deixar de depender da sorte de a instância estar quente.
 *
 * Por que não `drizzle-kit migrate` nem `push`: o bookkeeping do
 * `drizzle.__drizzle_migrations` está fora de sincronia com o journal (mesmo
 * motivo documentado em apply-referees-migration.mjs), e `push` mexe no schema
 * inteiro. Aqui o alvo é só a 0023, em UMA transação e idempotente.
 *
 *   npm run db:migrate-tend-historico
 *   npm run db:migrate-tend-historico -- --dry-run
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0023_team_history_cache.sql";
const TABELAS = ["team_history_cache"];
const dryRun = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

/** Torna cada statement reexecutável. */
function idempotente(stmt) {
  return stmt
    .replace(/create table "/i, 'create table if not exists "')
    .replace(/create index "/i, 'create index if not exists "')
    .replace(/create unique index "/i, 'create unique index if not exists "');
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
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any($1)`,
    [TABELAS],
  );
  return r.rows.map((x) => x.table_name).sort();
}

try {
  await client.connect();
  const antes = await estado();
  console.log(`antes: ${antes.length ? antes.join(", ") : "(nenhuma das tabelas)"}`);

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
  for (const t of TABELAS) {
    if (!depois.includes(t)) throw new Error(`❌ ${t} não existe depois do commit`);
  }

  // O upsert usa ON CONFLICT (id): sem a PK o sync falha em runtime.
  const pk = await client.query(
    `select 1 from pg_constraint where conname = 'team_history_cache_pkey'`,
  );
  if (!pk.rowCount) throw new Error("❌ PK de team_history_cache não existe");

  console.log(`✅ depois: ${depois.join(", ")}`);
  console.log("✅ primary key(id) presente (ON CONFLICT do upsert funciona)");
  await client.end();
} catch (e) {
  try {
    await client.query("rollback");
  } catch {}
  console.error("❌", e.message);
  await client.end();
  process.exit(1);
}
