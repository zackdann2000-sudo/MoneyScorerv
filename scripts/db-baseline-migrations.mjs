#!/usr/bin/env node
/**
 * D5 — baseline do journal do drizzle (`drizzle.__drizzle_migrations`).
 *
 * O problema que isto resolve: o banco de produção foi construído com SQL
 * colado no editor + `db:push`, nunca com `drizzle-kit migrate`. Logo a tabela
 * de bookkeeping `drizzle.__drizzle_migrations` NÃO existe. Sem ela, a primeira
 * execução de `drizzle-kit migrate` tentaria aplicar `0000_init` do zero num
 * banco que já tem 35 tabelas — e falharia no meio, deixando o histórico sujo.
 *
 * O que o script faz, nesta ordem (e aborta na primeira falha):
 *   1. lê o journal e o último snapshot;
 *   2. GATE: prova que o banco vivo está igual ao fim do journal (tabelas,
 *      colunas, tipos, not null). Baseline só é honesto se isso for verdade —
 *      se houver drift, marcar como aplicado seria mentira e a `migrate`
 *      seguinte nunca corrigiria a diferença;
 *   3. cria `drizzle.__drizzle_migrations` (mesmo DDL que o migrator do
 *      drizzle-orm usa: id serial, hash text, created_at bigint);
 *   4. insere uma linha por entrada do journal, com
 *      hash = sha256(conteúdo do .sql)   e   created_at = journal.when
 *      exatamente como o migrator calcula, para que `migrate` reconheça tudo
 *      como aplicado e não reexecute nada.
 *
 *   npm run db:baseline                 # aplica
 *   npm run db:baseline -- --dry-run    # só verifica e mostra o que faria
 *   npm run db:baseline -- --force      # reescreve o histórico (apaga e reinsere)
 *
 * Depois disto, o ciclo normal passa a ser:
 *   npm run db:generate   -> gera SQL + snapshot
 *   npx drizzle-kit migrate -> aplica só o que falta
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import pg from "pg";

const PASTA = "drizzle";
const JOURNAL = `${PASTA}/meta/_journal.json`;
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}
if (!existsSync(JOURNAL)) {
  console.error(`❌ ${JOURNAL} não encontrado — rode da raiz do projeto`);
  process.exit(2);
}

// ── 1. journal + hash igual ao do drizzle-orm/migrator.js
const journal = JSON.parse(readFileSync(JOURNAL, "utf8"));
const migrations = journal.entries.map((e) => {
  const caminho = `${PASTA}/${e.tag}.sql`;
  if (!existsSync(caminho)) throw new Error(`journal cita ${e.tag} mas ${caminho} não existe`);
  const conteudo = readFileSync(caminho, "utf8");
  return {
    tag: e.tag,
    when: e.when,
    hash: createHash("sha256").update(conteudo).digest("hex"),
    statements: conteudo.split("--> statement-breakpoint").length,
  };
});
const ultimoSnapshot = `${PASTA}/meta/${String(journal.entries.at(-1).idx)
  .toString()
  .padStart(4, "0")}_snapshot.json`;

const client = new pg.Client({ connectionString: url });
await client.connect();
let falhou = false;

try {
  await client.query("set time zone 'UTC'");
  console.log(`journal: ${migrations.length} migrations (até ${migrations.at(-1).tag})`);
  if (dryRun) console.log("modo: DRY-RUN (nada será alterado)\n");

  // ── 2. GATE de drift: banco vivo × último snapshot
  const snap = JSON.parse(readFileSync(ultimoSnapshot, "utf8"));
  const { rows: cols } = await client.query(
    `select table_name, column_name, data_type, is_nullable, character_maximum_length, column_default
       from information_schema.columns
      where table_schema = 'public'`,
  );
  const porTabela = new Map();
  for (const r of cols) {
    if (!porTabela.has(r.table_name)) porTabela.set(r.table_name, new Map());
    porTabela.get(r.table_name).set(r.column_name, r);
  }

  // `serial` é um apelido de `integer` + sequence: no banco o tipo é integer e a
  // prova de que é serial é o default nextval(...), checado logo abaixo.
  const normaliza = (t) =>
    String(t)
      .replace(/^character varying(\(\d+\))?$/, "varchar")
      .replace("timestamp with time zone", "timestamptz")
      .replace("timestamp without time zone", "timestamp")
      .replace(/ long$/, "");
  const SERIAL = { serial: "integer", smallserial: "smallint", bigserial: "bigint" };
  const tipoSnapshot = (t) => SERIAL[t] ?? (t.startsWith("varchar") ? "varchar" : normaliza(t));

  const drift = [];
  for (const [full, tabela] of Object.entries(snap.tables)) {
    const nome = full.replace("public.", "");
    const vivo = porTabela.get(nome);
    if (!vivo) {
      drift.push(`tabela ausente no banco: ${nome}`);
      continue;
    }
    for (const [col, def] of Object.entries(tabela.columns)) {
      const c = vivo.get(col);
      if (!c) {
        drift.push(`coluna ausente no banco: ${nome}.${col}`);
        continue;
      }
      if (tipoSnapshot(def.type) !== normaliza(c.data_type))
        drift.push(`tipo divergente: ${nome}.${col} snapshot=${def.type} banco=${c.data_type}`);
      if (Boolean(def.notNull) !== (c.is_nullable === "NO"))
        drift.push(`not null divergente: ${nome}.${col}`);
      if (SERIAL[def.type] && !String(c.column_default ?? "").startsWith("nextval("))
        drift.push(`serial sem sequence: ${nome}.${col} (default=${c.column_default ?? "null"})`);
    }
  }
  const esperadas = new Set(Object.keys(snap.tables).map((t) => t.replace("public.", "")));
  for (const nome of porTabela.keys()) {
    if (!esperadas.has(nome)) drift.push(`tabela no banco fora do snapshot: ${nome}`);
  }

  console.log(`schema: ${esperadas.size} tabelas no snapshot · ${porTabela.size} no banco`);
  if (drift.length > 0) {
    throw new Error(
      `banco divergente do fim do journal (${drift.length} problemas) — baseline abortado:\n  - ` +
        drift.slice(0, 20).join("\n  - ") +
        (drift.length > 20 ? `\n  … e mais ${drift.length - 20}` : ""),
    );
  }
  console.log("gate de drift: banco == fim do journal ✔");

  // ── estado atual do bookkeeping
  const temTabela = await client.query(
    `select 1 from information_schema.tables
      where table_schema = 'drizzle' and table_name = '__drizzle_migrations'`,
  );
  let existentes = [];
  if (temTabela.rows.length > 0) {
    const r = await client.query(
      "select id, hash, created_at from drizzle.__drizzle_migrations order by created_at",
    );
    existentes = r.rows;
  }
  console.log(`bookkeeping: ${existentes.length} registro(s) em drizzle.__drizzle_migrations`);

  const noLugar =
    existentes.length === migrations.length &&
    migrations.every((m, i) => Number(existentes[i].created_at) === m.when && existentes[i].hash === m.hash);
  if (noLugar && !force) {
    console.log("\n✅ baseline já está correto — nada a fazer (use --force para reescrever)");
    await client.end();
    process.exit(0);
  }

  if (dryRun) {
    console.log("\nregistros que seriam gravados:");
    for (const m of migrations) console.log(`  ${m.tag.padEnd(24)} when=${m.when} hash=${m.hash.slice(0, 12)}…`);
    console.log("\n(dry-run: nada foi alterado)");
    await client.end();
    process.exit(0);
  }

  // ── 3 e 4. cria o bookkeeping e marca tudo como aplicado, em uma transação
  await client.query("begin");
  await client.query(`create schema if not exists "drizzle"`);
  await client.query(
    `create table if not exists "drizzle"."__drizzle_migrations" (
       id serial primary key,
       hash text not null,
       created_at bigint
     )`,
  );
  if (force) await client.query("delete from drizzle.__drizzle_migrations");
  for (const m of migrations) {
    await client.query(
      `insert into drizzle.__drizzle_migrations ("hash", "created_at") values ($1, $2)`,
      [m.hash, m.when],
    );
  }
  await client.query("commit");

  const { rows: depois } = await client.query(
    "select count(*)::int as n, max(created_at) as ultimo from drizzle.__drizzle_migrations",
  );
  console.log(`\nbookkeeping gravado: ${depois[0].n} registros`);
  if (depois[0].n !== migrations.length || Number(depois[0].ultimo) !== migrations.at(-1).when) {
    throw new Error("contagem ou último created_at não bate com o journal");
  }
  console.log("\n✅ D5 baseline aplicado. Agora `npx drizzle-kit migrate` não tem nada a fazer:");
  console.log("   npm run db:generate     # gera SQL + snapshot de mudanças novas");
  console.log("   npx drizzle-kit migrate # aplica só o que faltar");
} catch (err) {
  falhou = true;
  try {
    await client.query("rollback");
  } catch {}
  console.error(`\n❌ ${err.message}`);
} finally {
  if (!client._ended) await client.end();
}
process.exit(falhou ? 1 : 0);
