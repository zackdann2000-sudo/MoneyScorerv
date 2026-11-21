#!/usr/bin/env node
/**
 * Auditoria de fuso dos dados existentes (antes do M2/D2).
 *
 * SOMENTE LEITURA. Mede, por tabela, o maior timestamp gravado e compara com
 * `now()` do banco. O que importa não é o fuso da sessão de quem audita —
 * é se o processo que GRAVOU estava em UTC:
 *
 *   - gravou em UTC  -> max(created_at) <= now() (diferença ~ 0)
 *   - gravou em BRT  -> max(created_at) ~ 3h NO FUTURO em relação a now()
 *
 *   node scripts/audit-tz.mjs
 *
 * Sai com 1 se encontrar coluna no futuro (dado deslocado) na tabela informada.
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

/** Colunas de "quando isto foi escrito": não podem estar no futuro. */
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
/** Colunas legitimamente futuras (expiração, data de jogo). */
const FUTURO_OK = new Set(["expires_at", "match_date"]);

try {
  // A sessão da auditoria é fixada em UTC de propósito: as comparações abaixo
  // só fazem sentido se quem lê estiver em UTC (GMT do Neon = UTC).
  await client.query("set time zone 'UTC'");

  const { rows: env } = await client.query(
    "select now() as agora, current_setting('TimeZone') as tz",
  );
  console.log(`sessão de auditoria (forçada): ${env[0].tz}`);
  console.log(`now() no banco              : ${env[0].agora.toISOString()}`);
  console.log(`TZ do processo Node         : ${process.env.TZ ?? "(sistema)"}`);
  console.log("");

  const { rows: cols } = await client.query(
    `select table_name, column_name, data_type
       from information_schema.columns
      where table_schema = 'public' and data_type like 'timestamp%'
      order by table_name, column_name`,
  );

  const tabelas = [...new Set(cols.map((c) => c.table_name))].sort();
  console.log(`colunas timestamp: ${cols.length} em ${tabelas.length} tabelas\n`);

  const suspeitos = [];
  for (const t of tabelas) {
    const colsT = cols.filter((c) => c.table_name === t);
    const exprs = colsT.map((c) => `max("${c.column_name}") as "${c.column_name}"`).join(", ");
    const { rows } = await client.query(`select count(*)::int as n, ${exprs} from "${t}"`);
    const r = rows[0] ?? {};
    const campos = [];
    for (const c of colsT) {
      const v = r[c.column_name];
      if (!v) continue;
      const futuroH = (new Date(v).getTime() - env[0].agora.getTime()) / 3_600_000;
      const marca =
        futuroH > 1 && RELOGIO.has(c.column_name)
          ? ` ⚠️ FUTURO +${futuroH.toFixed(1)}h`
          : FUTURO_OK.has(c.column_name) && futuroH > 1
            ? " (futuro por natureza)"
            : "";
      if (futuroH > 1 && RELOGIO.has(c.column_name)) {
        suspeitos.push(`${t}.${c.column_name} (+${futuroH.toFixed(1)}h)`);
      }
      campos.push(`${c.column_name}=${new Date(v).toISOString()}${marca}`);
    }
    console.log(`${t.padEnd(28)} n=${String(r.n).padStart(6)}  ${campos.join("  ") || "—"}`);
  }

  console.log("\n════════════════════════════════════════════════════════════");
  if (suspeitos.length === 0) {
    console.log("✅ nenhuma coluna de relógio no futuro: nada indica gravação em hora local");
  } else {
    console.log(`❌ ${suspeitos.length} coluna(s) de relógio no futuro — dado gravado em hora local:`);
    for (const s of suspeitos) console.log(`   - ${s}`);
    console.log("\n   Se o schema AINDA é timestamp sem fuso: NÃO aplicar a 0011 antes de");
    console.log("   limpar (scripts/db-clean-tz.mjs) ou corrigir o offset.");
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
