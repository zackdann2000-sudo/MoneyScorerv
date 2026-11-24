#!/usr/bin/env node
/**
 * Aplica drizzle/0021_referees.sql (módulo árbitros, feature #5).
 *
 * Por que existe: o banco de produção estava com as tabelas de 0016–0021
 * ausentes só na parte nova — `hub_referee` e `hub_referee_appearance` nunca
 * foram criadas, e todo upsert do módulo falhava com "relation does not
 * exist". O erro chegava na tela truncado em 200 chars ("insert ... values
 * (default, $1, $2, $3)"), o que parecia bug de mapeamento do Drizzle.
 *
 * Por que não `drizzle-kit migrate` nem `push`: o bookkeeping
 * `drizzle.__drizzle_migrations` tem 15 registros para 22 migrations do
 * journal (o schema foi criado por push + baseline manual), então `migrate`
 * tentaria reaplicar 0000_init. E `push` mexe no schema inteiro. Aqui o alvo
 * é só a 0021, em UMA transação, idempotente (pode rodar de novo sem erro).
 *
 *   npm run db:migrate-referees
 *   npm run db:migrate-referees -- --dry-run
 *
 * Aborta se qualquer statement falhar: rollback total, nada fica pela metade.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0021_referees.sql";
const dryRun = process.argv.includes("--dry-run");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

/** Torna cada statement reexecutável. */
function idempotente(stmt) {
  return stmt
    // cria tabela só se faltar
    .replace(/create table "/i, 'create table if not exists "')
    // índices idem
    .replace(/create index "/i, 'create index if not exists "')
    .replace(/create unique index "/i, 'create unique index if not exists "');
}

/**
 * ADD CONSTRAINT não tem IF NOT EXISTS: vira DO block que só executa quando a
 * constraint ainda não existe (senão a segunda rodada aborta a transação).
 */
function constraintGuardada(stmt) {
  const m = stmt.match(
    /alter table "([a-z_]+)" add constraint "([a-z_]+)" foreign key \("([a-z_]+)"\) references ("[^"]+"(?:\."[^"]+")*)\("([a-z_]+)"\) on delete ([a-z ]+) on update ([a-z ]+)/i,
  );
  if (!m) return stmt;
  const [, tabela, nome, coluna, alvo, alvoCol, del, upd] = m;
  return `do $$ begin
    if not exists (select 1 from pg_constraint where conname = '${nome}') then
      alter table "${tabela}" add constraint "${nome}" foreign key ("${coluna}")
        references ${alvo}("${alvoCol}") on delete ${del} on update ${upd};
    end if;
  end $$`;
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
  .map(idempotente)
  .map(constraintGuardada);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const TABELAS = ["hub_referee", "hub_referee_appearance"];

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

  if (antes.length === TABELAS.length) {
    console.log("✅ tabelas já existem — nada a fazer.");
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
  for (const t of TABELAS) {
    if (!depois.includes(t)) throw new Error(`❌ ${t} não existe depois do commit`);
  }

  // O upsert usa ON CONFLICT (nome_norm): sem o único, o sync falha em runtime.
  const uq = await client.query(
    `select 1 from pg_constraint where conname = 'hub_referee_nome_norm_unique'`,
  );
  if (!uq.rowCount) throw new Error("❌ constraint unique de nome_norm não existe");

  console.log(`✅ depois: ${depois.join(", ")}`);
  console.log("✅ unique(nome_norm) presente (ON CONFLICT do upsert funciona)");
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
