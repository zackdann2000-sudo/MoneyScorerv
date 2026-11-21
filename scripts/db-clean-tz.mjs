#!/usr/bin/env node
/**
 * Expurgo dos dados de teste antes do M2/D2 (timestamp -> timestamptz).
 *
 * DESTRUTIVO. Só faz sentido num banco de teste. O motivo: as 46 colunas
 * `timestamp` guardam relógio de parede, e não há como provar, linha por linha,
 * se quem gravou estava em UTC (Vercel) ou em America/Sao_Paulo (Termux local).
 * Converter "tudo como UTC" deslocaria em 3h as linhas gravadas em hora local.
 * Linha que não existe não desloca: expurga o volátil e a migration fica
 * correta por construção.
 *
 * Preservadas de propósito: `users` (login), `api_keys` (tokens reais de
 * provedor) e os assets `player_photos` / `team_badges`.
 *
 *   node scripts/db-clean-tz.mjs --dry-run   # só mostra o que sairia
 *   node scripts/db-clean-tz.mjs --yes       # expurga
 */
import "dotenv/config";
import pg from "pg";

const LIMPAR = [
  "alert_state",
  "apitou_cache",
  "apitou_pinned_desajustes",
  "consents",
  "deletion_requests",
  "favorites",
  "fcm_tokens",
  "gameread_cache",
  "gameread_pinned_props",
  "kingstats_cache",
  "match_team_stats_cache",
  "nerdytips_cache",
  "pick_ledger",
  "picks",
  "player_props_cache",
  "player_stats_cache",
  "predictions",
  "push_subs",
  "rankings_cache",
  "rate_limits",
  "sessions",
  "stripe_eventos",
  "team_xg_cache",
  "tickets",
  "tip_comments",
  "tip_likes",
  "tip_votes",
  "value_alert_log",
  "value_bet_history",
  "visits",
];
const PRESERVAR = ["users", "api_keys", "player_photos", "team_badges"];

const dryRun = process.argv.includes("--dry-run");
const confirmado = process.argv.includes("--yes");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("❌ DATABASE_URL não definida");
  process.exit(2);
}
if (!dryRun && !confirmado) {
  console.error("❌ expurgo destrutivo: rode com --dry-run para ver o plano ou --yes para executar");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  await client.query("set time zone 'UTC'");
  const { rows: host } = await client.query(
    "select current_database() as db, to_char(now() at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as agora",
  );
  console.log(`banco: ${host[0].db} · now(UTC): ${host[0].agora} · modo: ${dryRun ? "DRY-RUN" : "EXECUÇÃO"}\n`);

  console.log("linhas a expurgar:");
  let total = 0;
  for (const t of LIMPAR) {
    const { rows } = await client.query(`select count(*)::int as n from "${t}"`);
    total += rows[0].n;
    console.log(`  ${t.padEnd(28)} ${String(rows[0].n).padStart(7)}`);
  }
  console.log(`  ${"TOTAL".padEnd(28)} ${String(total).padStart(7)}`);
  console.log(`  preservadas: ${PRESERVAR.join(", ")}`);

  if (dryRun) {
    console.log("\n(dry-run: nada foi alterado)");
  } else if (total === 0) {
    console.log("\n✅ já está limpo — nada a expurgar");
  } else {
    await client.query("begin");
    // A FK de users -> sessions/favorites/... é `on delete cascade`, mas quem
    // aponta para estas tabelas são filhos delas: TRUNCATE ... CASCADE resolve
    // sem tocar em `users`.
    await client.query(`truncate table ${LIMPAR.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
    await client.query("commit");

    let restante = 0;
    for (const t of LIMPAR) {
      const { rows } = await client.query(`select count(*)::int as n from "${t}"`);
      restante += rows[0].n;
    }
    console.log(`\n✅ expurgadas ${total} linha(s); restam ${restante} nas tabelas alvo`);

    const { rows: keep } = await client.query(
      `select 'users' as t, count(*)::int as n from users
       union all select 'api_keys', count(*)::int from api_keys
       union all select 'player_photos', count(*)::int from player_photos
       union all select 'team_badges', count(*)::int from team_badges`,
    );
    for (const r of keep) console.log(`  preservado ${r.t.padEnd(16)} ${r.n}`);
  }
} catch (err) {
  try {
    await client.query("rollback");
  } catch {}
  console.error("❌ expurgo falhou:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
