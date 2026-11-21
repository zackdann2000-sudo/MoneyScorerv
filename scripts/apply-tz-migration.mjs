#!/usr/bin/env node
/**
 * Aplica drizzle/0011_timestamptz.sql (M2/D2) com as travas que o assunto exige.
 *
 * Por que não `drizzle-kit migrate`: o projeto não tem o schema de bookkeeping
 * `drizzle.__drizzle_migrations` (as migrations anteriores foram aplicadas como
 * SQL, ver D5). Sem esse histórico, `migrate` tentaria reaplicar 0000_init.
 * Então o SQL é aplicado aqui, em UMA transação, com verificação antes e depois.
 *
 *   npm run db:migrate-tz            # aplica
 *   npm run db:migrate-tz -- --dry-run
 *
 * Aborta se:
 *  - a pré-checagem de dado falhar (coluna de relógio no futuro => hora local);
 *  - o schema já estiver convertido (nada a fazer) ou fora do esperado;
 *  - qualquer statement falhar (rollback total, nenhuma alteração fica).
 *
 * Rollback (só enquanto ninguém gravar no meio):
 *   alter table <t> alter column <c> set data type timestamp using <c> at time zone 'UTC';
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0011_timestamptz.sql";
const RELOGIO = new Set([
  "created_at",
  "updated_at",
  "fetched_at",
  "sent_at",
  "window_start",
  "atualizado_em",
  "last_seen_at",
  "settled_at",
]);

const dryRun = process.argv.includes("--dry-run");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

const sql = readFileSync(MIGRATION, "utf8");
const declaracoes = sql
  .split("--> statement-breakpoint")
  .map((s) =>
    s
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

const alvos = [];
{
  const re =
    /ALTER TABLE "([a-z_0-9]+)" ALTER COLUMN "([a-z_0-9]+)" SET DATA TYPE timestamp with time zone/g;
  let m;
  while ((m = re.exec(sql)) !== null) alvos.push({ tabela: m[1], coluna: m[2] });
}

const client = new pg.Client({ connectionString: url });
await client.connect();

let falhou = false;
try {
  await client.query("set time zone 'UTC'");
  const { rows: env } = await client.query(
    "select to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as agora",
  );
  console.log(`now(UTC): ${env[0].agora}`);
  console.log(`statements na migration: ${declaracoes.length}`);
  console.log(`colunas a converter    : ${alvos.length} em ${new Set(alvos.map((a) => a.tabela)).size} tabelas`);
  if (dryRun) console.log("modo: DRY-RUN (nada será alterado)\n");

  // ── pré-condição 1: schema no estado "antes"
  const { rows: tipos } = await client.query(
    `select data_type, count(*)::int as n
       from information_schema.columns
      where table_schema='public' and data_type like 'timestamp%'
      group by data_type`,
  );
  const semFuso = tipos.find((r) => r.data_type === "timestamp without time zone")?.n ?? 0;
  const comFuso = tipos.find((r) => r.data_type === "timestamp with time zone")?.n ?? 0;
  console.log(`schema: ${semFuso} sem fuso · ${comFuso} com fuso`);
  if (comFuso > 0 && semFuso === 0) throw new Error("schema já convertido — nada a aplicar");
  if (semFuso !== alvos.length) {
    throw new Error(`schema tem ${semFuso} colunas sem fuso, a migration converte ${alvos.length} — divergência`);
  }

  // ── pré-condição 2: nenhuma coluna de relógio no futuro (dado em hora local)
  const sujas = [];
  for (const { tabela } of new Map(alvos.map((a) => [a.tabela, a])).values()) {
    const cols = alvos.filter((a) => a.tabela === tabela && RELOGIO.has(a.coluna)).map((a) => a.coluna);
    for (const col of cols) {
      const { rows } = await client.query(
        `select count(*)::int as n, round(extract(epoch from (now()-max("${col}")))/3600,2)::float8 as horas
           from "${tabela}"`,
      );
      if (rows[0].n > 0 && rows[0].horas !== null && rows[0].horas < -0.5) {
        sujas.push(`${tabela}.${col} (${Math.abs(rows[0].horas).toFixed(1)}h no futuro)`);
      }
    }
  }
  if (sujas.length > 0) {
    throw new Error(
      `dado gravado em hora local: ${sujas.join(", ")} — rode scripts/db-clean-tz.mjs ou corrija o offset antes`,
    );
  }
  console.log("dado: nenhuma coluna de relógio no futuro ✔");

  if (dryRun) {
    console.log("\nprimeiros statements que rodariam:");
    for (const d of declaracoes.slice(0, 3)) console.log(`  ${d.slice(0, 110)}…`);
    console.log("\n(dry-run: nada foi alterado)");
  } else {
    await client.query("begin");
    // Falha rápido se outra sessão estiver segurando as tabelas.
    await client.query("set local lock_timeout = '5s'");
    let i = 0;
    for (const d of declaracoes) {
      i += 1;
      try {
        await client.query(d);
      } catch (err) {
        throw new Error(`statement ${i}/${declaracoes.length} falhou: ${err.message}\n   ${d.slice(0, 140)}`);
      }
    }
    await client.query("commit");

    const { rows: depois } = await client.query(
      `select data_type, count(*)::int as n
         from information_schema.columns
        where table_schema='public' and data_type like 'timestamp%'
        group by data_type`,
    );
    const restam = depois.find((r) => r.data_type === "timestamp without time zone")?.n ?? 0;
    const agora = depois.find((r) => r.data_type === "timestamp with time zone")?.n ?? 0;
    console.log(`\naplicado: ${declaracoes.length} statements`);
    console.log(`schema depois: ${restam} sem fuso · ${agora} com fuso`);
    if (restam !== 0) {
      throw new Error(`ainda restam ${restam} colunas sem fuso — verificar manualmente`);
    }
    console.log("\n✅ M2/D2 aplicado. Rollback (enquanto ninguém gravar no meio):");
    console.log("   alter table <t> alter column <c> set data type timestamp using <c> at time zone 'UTC';");
  }
} catch (err) {
  falhou = true;
  try {
    await client.query("rollback");
    console.error("\n(rollback executado — nenhuma alteração ficou)");
  } catch {}
  console.error(`❌ ${err.message}`);
} finally {
  await client.end();
}
process.exit(falhou ? 1 : 0);
