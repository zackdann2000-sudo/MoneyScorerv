#!/usr/bin/env node
/**
 * Pré-checagem obrigatória do M2/D2 (timestamp -> timestamptz).
 *
 * Roda SOMENTE leitura. A migration drizzle/0011_timestamptz.sql interpreta os
 * valores antigos como UTC; se o processo que gravou não estava em UTC, a
 * conversão desloca tudo em 3h e não dá para desfazer sem backup.
 *
 *   npm run db:precheck-tz
 *
 * Sai com código 1 quando algo indica que o dado NÃO está em UTC.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import pg from "pg";

const MIGRATION = "drizzle/0011_timestamptz.sql";

function colunasDaMigration() {
  const sql = readFileSync(MIGRATION, "utf8");
  const re = /ALTER TABLE "([a-z_0-9]+)" ALTER COLUMN "([a-z_0-9]+)" SET DATA TYPE timestamp with time zone USING "([a-z_0-9]+)" AT TIME ZONE 'UTC'/g;
  const pares = [];
  let m;
  while ((m = re.exec(sql)) !== null) pares.push({ tabela: m[1], coluna: m[2] });
  return pares;
}

async function main() {
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
    console.log("════════════════════════════════════════════════════════════");
    console.log("1. Fuso do servidor e do processo");
    console.log("════════════════════════════════════════════════════════════");

    const { rows: tz } = await client.query("show timezone");
    const fusoBanco = tz[0]?.TimeZone ?? tz[0]?.timezone ?? "?";
    const fusoProcesso = process.env.TZ ?? "(não definido — Node assume o do sistema)";
    const { rows: agora } = await client.query("select now() as agora, current_setting('TimeZone') as tz");
    console.log(`banco (show timezone) : ${fusoBanco}`);
    console.log(`sessão do pg          : ${agora[0].tz}`);
    console.log(`processo (TZ)         : ${fusoProcesso}`);
    console.log(`now() no banco        : ${agora[0].agora.toISOString?.() ?? agora[0].agora}`);

    if (!/^UTC$/i.test(fusoBanco) && !/^Etc\/UTC$/i.test(fusoBanco)) {
      erros.push(
        `timezone da sessão é ${fusoBanco}, não UTC. A migration força 'UTC' no USING, ` +
          "mas um processo que gravou em local já corrompeu o dado — abortar e investigar.",
      );
    }

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("2. Sanidade: as últimas sessões batem com o horário real?");
    console.log("════════════════════════════════════════════════════════════");

    const { rows: sess } = await client.query(
      "select token, created_at, expires_at, now() as agora from sessions order by created_at desc limit 3",
    );
    if (sess.length === 0) {
      avisos.push("sem sessões na tabela — a checagem de sanidade ficou sem amostra");
    }
    for (const s of sess) {
      const criado = new Date(s.created_at);
      const diffH = (Date.now() - criado.getTime()) / 3_600_000;
      console.log(
        `token ${String(s.token).slice(0, 8)}… criado=${criado.toISOString()} ` +
          `expira=${new Date(s.expires_at).toISOString()} idade=${diffH.toFixed(1)}h`,
      );
      // created_at não pode estar no futuro, nem absurdamente no passado.
      if (diffH < -1) erros.push(`sessions.created_at no futuro (${diffH.toFixed(1)}h) — dado deslocado`);
      if (diffH > 24 * 365) erros.push(`sessions.created_at com mais de 1 ano (${diffH.toFixed(0)}h) — suspeito`);
    }

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("3. Tamanho das tabelas afetadas (anote para comparar depois)");
    console.log("════════════════════════════════════════════════════════════");

    const pares = colunasDaMigration();
    const tabelas = [...new Set(pares.map((p) => p.tabela))].sort();
    console.log(`colunas na migration : ${pares.length}`);
    console.log(`tabelas afetadas     : ${tabelas.length}`);

    let totalLinhas = 0;
    for (const t of tabelas) {
      const { rows } = await client.query(`select count(*)::int as n from "${t}"`);
      totalLinhas += rows[0].n;
      console.log(`  ${t.padEnd(28)} ${String(rows[0].n).padStart(8)}`);
    }
    console.log(`  ${"TOTAL".padEnd(28)} ${String(totalLinhas).padStart(8)}`);

    console.log("\n════════════════════════════════════════════════════════════");
    console.log("4. Estado do schema");
    console.log("════════════════════════════════════════════════════════════");

    const { rows: tipos } = await client.query(
      `select data_type, count(*)::int as n
         from information_schema.columns
        where table_schema = 'public' and data_type like 'timestamp%'
        group by data_type order by data_type`,
    );
    for (const r of tipos) console.log(`  ${r.data_type.padEnd(32)} ${r.n}`);

    const { rows: faltando } = await client.query(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = 'public' and data_type = 'timestamp without time zone'
        order by table_name, column_name`,
    );
    if (faltando.length === 0) {
      console.log("\n✅ schema já está convertido (0 colunas sem fuso)");
    } else {
      console.log(`\n→ ${faltando.length} coluna(s) ainda sem fuso (esperado antes da migration)`);
    }

    console.log("\n════════════════════════════════════════════════════════════");
    if (erros.length === 0) {
      console.log("✅ PRÉ-CHECAGEM OK — pode aplicar: npx drizzle-kit migrate");
    } else {
      console.log("❌ PRÉ-CHECAGEM FALHOU — NÃO aplique a migration");
    }
    for (const a of avisos) console.log(`⚠️  ${a}`);
    for (const e of erros) console.log(`❌ ${e}`);
  } finally {
    await client.end();
  }

  process.exit(erros.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("❌ pré-checagem abortou:", err.message);
  process.exit(2);
});
