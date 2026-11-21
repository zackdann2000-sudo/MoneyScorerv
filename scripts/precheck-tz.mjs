#!/usr/bin/env node
/**
 * Pré-checagem obrigatória do M2/D2 (timestamp -> timestamptz).
 *
 * SOMENTE LEITURA. Roda antes de `npm run db:migrate-tz`.
 *
 * Histórico: a primeira versão deste script abortava quando `show timezone` da
 * PRÓPRIA sessão de auditoria não era "UTC". Era um falso negativo — o Neon
 * entrega `GMT` (mesmo offset) e, mais importante, o fuso de quem audita não
 * diz nada sobre quem GRAVOU o dado. A checagem correta é de dado:
 *
 *   - coluna de "relógio de escrita" (created_at, updated_at, ...) com valor
 *     no futuro => alguém gravou hora local; o USING 'UTC' deslocaria a linha;
 *   - coluna de data com significado futuro (expires_at, match_date) é
 *     ignorada de propósito: estar no futuro é o correto para ela.
 *
 * A sessão de auditoria é fixada em UTC e todas as comparações de tempo são
 * feitas em SQL (`now()`), então o resultado não depende do TZ do Node nem do
 * padrão do banco.
 *
 *   npm run db:precheck-tz
 *
 * Sai com 1 quando há dado deslocado (não aplicar a migration).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0011_timestamptz.sql";

/** Colunas que guardam "quando isto foi escrito". Não podem estar no futuro. */
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
/** Colunas legitimamente futuras. */
const FUTURO_OK = new Set(["expires_at", "match_date"]);

function colunasDaMigration() {
  const sql = readFileSync(MIGRATION, "utf8");
  const re =
    /ALTER TABLE "([a-z_0-9]+)" ALTER COLUMN "([a-z_0-9]+)" SET DATA TYPE timestamp with time zone USING "([a-z_0-9]+)" AT TIME ZONE 'UTC'/g;
  const pares = [];
  let m;
  while ((m = re.exec(sql)) !== null) pares.push({ tabela: m[1], coluna: m[2] });
  return pares;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida (use .env ou export)");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const avisos = [];
const erros = [];

try {
  await client.query("set time zone 'UTC'");

  console.log("════════════════════════════════════════════════════════════");
  console.log("1. Relógios (o fuso da AUDITORIA é fixado em UTC)");
  console.log("════════════════════════════════════════════════════════════");
  const { rows: env } = await client.query(
    "select current_setting('TimeZone') as tz, to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as agora",
  );
  console.log(`sessão de auditoria : ${env[0].tz} (forçada)`);
  console.log(`now() no banco      : ${env[0].agora}`);
  console.log(`TZ do processo Node : ${process.env.TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone}`);

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("2. O dado foi gravado em UTC? (relógio de escrita vs now())");
  console.log("════════════════════════════════════════════════════════════");

  const pares = colunasDaMigration();
  const porTabela = new Map();
  for (const p of pares) {
    if (!porTabela.has(p.tabela)) porTabela.set(p.tabela, []);
    porTabela.get(p.tabela).push(p.coluna);
  }

  let verificadas = 0;
  for (const [tabela, colunas] of [...porTabela].sort()) {
    const relogios = colunas.filter((c) => RELOGIO.has(c));
    if (relogios.length === 0) continue;
    for (const col of relogios) {
      const { rows } = await client.query(
        `select count(*)::int as n,
                to_char(max("${col}"), 'YYYY-MM-DD HH24:MI:SS') as pior,
                round(extract(epoch from (now() - max("${col}")))/3600, 2)::float8 as horas
           from "${tabela}"`,
      );
      const r = rows[0];
      if (r.n === 0 || !r.pior) continue;
      verificadas += 1;
      const noFuturo = r.horas < -0.5;
      if (noFuturo) {
        erros.push(
          `${tabela}.${col} no futuro (${Math.abs(r.horas).toFixed(1)}h): ` +
            `o processo que gravou não estava em UTC — purgar ou corrigir antes`,
        );
      }
      console.log(
        `  ${`${tabela}.${col}`.padEnd(46)} n=${String(r.n).padStart(5)} ` +
          `max=${r.pior} idade=${r.horas.toFixed(1)}h${noFuturo ? "  ⚠️ FUTURO" : ""}`,
      );
    }
  }
  console.log(`  (${verificadas} coluna(s) de relógio verificadas; expires_at/match_date ignoradas por natureza)`);

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("3. Tamanho das tabelas afetadas (anote para comparar depois)");
  console.log("════════════════════════════════════════════════════════════");
  let total = 0;
  for (const t of [...porTabela.keys()].sort()) {
    const { rows } = await client.query(`select count(*)::int as n from "${t}"`);
    total += rows[0].n;
    if (rows[0].n > 0) console.log(`  ${t.padEnd(30)} ${String(rows[0].n).padStart(8)}`);
  }
  console.log(`  ${"TOTAL".padEnd(30)} ${String(total).padStart(8)}`);
  console.log(`  colunas na migration: ${pares.length} · tabelas: ${porTabela.size}`);

  console.log("\n════════════════════════════════════════════════════════════");
  console.log("4. Estado do schema");
  console.log("════════════════════════════════════════════════════════════");
  const { rows: tipos } = await client.query(
    `select data_type, count(*)::int as n
       from information_schema.columns
      where table_schema='public' and data_type like 'timestamp%'
      group by data_type order by data_type`,
  );
  for (const r of tipos) console.log(`  ${r.data_type.padEnd(32)} ${r.n}`);
  const semFuso = tipos.find((r) => r.data_type === "timestamp without time zone")?.n ?? 0;
  if (semFuso === 0) avisos.push("schema já convertido (0 colunas sem fuso) — a migration não tem o que fazer");
  else if (semFuso !== pares.length) {
    avisos.push(`schema tem ${semFuso} colunas sem fuso, migration espera ${pares.length}`);
  }
} finally {
  await client.end();
}

console.log("\n════════════════════════════════════════════════════════════");
if (erros.length === 0) {
  console.log("✅ PRÉ-CHECAGEM OK — pode aplicar: npm run db:migrate-tz");
} else {
  console.log("❌ PRÉ-CHECAGEM FALHOU — NÃO aplique a migration");
}
for (const a of avisos) console.log(`⚠️  ${a}`);
for (const e of erros) console.log(`❌ ${e}`);
process.exit(erros.length === 0 ? 0 : 1);
