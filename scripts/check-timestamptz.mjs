#!/usr/bin/env node
/**
 * Checagem offline do M2/D2: garante que a migration e o schema Drizzle falam
 * a mesma língua. Não precisa de banco — é o teste que roda em CI/PR.
 *
 *   node scripts/check-timestamptz.mjs
 *
 * Falha (exit 1) se:
 *  - alguma coluna `timestamp(` do schema.ts não estiver com withTimezone: true;
 *  - alguma coluna sem fuso não tiver um ALTER ... USING ... AT TIME ZONE 'UTC';
 *  - a migration contiver CREATE TABLE (as tabelas já existem em produção);
 *  - o USING apontar para coluna diferente da que está sendo alterada.
 */
import { readFileSync } from "node:fs";

const SCHEMA = "src/db/schema.ts";
const MIGRATION = "drizzle/0011_timestamptz.sql";

const erros = [];

// 1. schema.ts: toda coluna timestamp precisa de withTimezone
const schema = readFileSync(SCHEMA, "utf8");
const semFuso = [];
const comFuso = [];
for (const linha of schema.split("\n")) {
  const m = linha.match(/^\s*[a-zA-Z]+:\s*timestamp\("([a-z_]+)"(.*)$/);
  if (!m) continue;
  if (m[2].includes("withTimezone: true")) comFuso.push(m[1]);
  else semFuso.push(m[1]);
}
if (semFuso.length > 0) erros.push(`schema.ts sem withTimezone: ${semFuso.join(", ")}`);

// 2. migration: um ALTER por coluna, sempre com USING ... AT TIME ZONE 'UTC'
const sql = readFileSync(MIGRATION, "utf8");
if (/^\s*CREATE\s+TABLE/im.test(sql)) {
  erros.push("migration contém CREATE TABLE — tabelas já existem em produção");
}

const re = /ALTER TABLE "([a-z_0-9]+)" ALTER COLUMN "([a-z_0-9]+)" SET DATA TYPE timestamp with time zone USING "([a-z_0-9]+)" AT TIME ZONE 'UTC';/g;
const alteradas = [];
let m;
while ((m = re.exec(sql)) !== null) {
  if (m[2] !== m[3]) erros.push(`${m[1]}.${m[2]}: USING aponta para ${m[3]}`);
  alteradas.push(`${m[1]}.${m[2]}`);
}
if (alteradas.length !== comFuso.length) {
  erros.push(`migration converte ${alteradas.length} coluna(s), schema tem ${comFuso.length}`);
}

// 3. nenhum SET DATA TYPE pode ficar sem USING (dependeria do TimeZone da sessão)
const semUsing = sql.split("\n").filter((l) => /SET DATA TYPE/.test(l) && !/USING "/.test(l));
if (semUsing.length > 0) erros.push(`${semUsing.length} ALTER sem USING (conversão depende da TZ da sessão)`);

// 4. journal/snapshot: as duas peças precisam existir no mesmo commit
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
const tag = MIGRATION.split("/").pop().replace(/\.sql$/, "");
if (!journal.entries.some((e) => e.tag === tag)) erros.push(`journal não tem a entrada ${tag}`);
try {
  readFileSync(`drizzle/meta/${tag.split("_")[0]}_snapshot.json`);
} catch {
  erros.push(`snapshot drizzle/meta/${tag.split("_")[0]}_snapshot.json ausente`);
}

console.log(`colunas timestamptz no schema : ${comFuso.length}`);
console.log(`colunas convertidas na migration: ${alteradas.length}`);
console.log(`entrada no journal             : ${tag}`);

if (erros.length > 0) {
  console.error("❌ M2/D2 inconsistente:");
  for (const e of erros) console.error(`   - ${e}`);
  process.exit(1);
}
console.log("✅ M2/D2 consistente (schema + migration + journal)");
