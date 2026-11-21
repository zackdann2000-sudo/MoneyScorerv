// Ensaio da 0014 em transação com ROLLBACK — não aplica nada no banco.
// Verifica: DDL roda, é re-executável, os CHECK são NOT VALID mas já barram
// valor inválido em linha nova, e os 10 triggers tocam `updated_at`.
require("dotenv").config();
const fs = require("fs");
const { Pool } = require("pg");

const SQL = fs.readFileSync("drizzle/0014_m4_aditivo.sql", "utf8");
const stmts = SQL.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);

const falhas = [];
const ok = (cond, msg, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${msg}${extra ? `  (${extra})` : ""}`);
  if (!cond) falhas.push(msg);
};

(async () => {
  const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const c = await p.connect();
  try {
    await c.query("BEGIN");
    console.log(`▶ 0014: ${stmts.length} statements numa transação`);

    for (const s of stmts) await c.query(s);
    console.log("✅ 1ª execução passou");

    // idempotência: roda tudo de novo
    for (const s of stmts) await c.query(s);
    console.log("✅ 2ª execução passou (re-executável)");

    const cols = await c.query(
      `select table_name||'.'||column_name as c from information_schema.columns
       where table_schema='public' and column_name in ('public_id','updated_at')
       and table_name in ('users','favorites','tickets','deletion_requests','alert_prefs',
                          'pick_ledger','value_bet_history','fcm_tokens',
                          'gameread_pinned_props','apitou_pinned_desajustes')`
    );
    const nomes = cols.rows.map((r) => r.c);
    ok(nomes.filter((n) => n.endsWith(".public_id")).length === 4, "4 public_id criados", nomes.filter((n) => n.includes("public_id")).join(", "));
    ok(nomes.filter((n) => n.endsWith(".updated_at")).length === 10, "10 updated_at criados", String(nomes.filter((n) => n.includes("updated_at")).length));

    const idx = await c.query(
      `select indexname from pg_indexes where schemaname='public' and indexname like '%_public_id_idx' order by 1`
    );
    ok(idx.rowCount === 4, "4 índices únicos de public_id", idx.rows.map((r) => r.indexname).join(", "));

    const chk = await c.query(
      `select conname, convalidated from pg_constraint
       where conrelid in ('users'::regclass,'pick_ledger'::regclass,'value_bet_history'::regclass,'deletion_requests'::regclass)
       and contype='c' and conname in ('users_plan_chk','users_role_chk','ledger_status_chk','vbh_status_chk','dr_status_chk')
       order by 1`
    );
    ok(chk.rowCount === 5, "5 CHECK criados", chk.rows.map((r) => r.conname).join(", "));
    ok(chk.rows.every((r) => r.convalidated === false), "todos NOT VALID (validate é passo separado)");

    const tg = await c.query(
      `select count(*)::int as n from pg_trigger where not tgisinternal and tgname like 't\\_%\\_touch'`
    );
    ok(tg.rows[0].n === 10, "10 triggers de updated_at", String(tg.rows[0].n));

    // CHECK barra valor inválido em linha NOVA, mesmo sem validate
    await c.query("SAVEPOINT s1");
    let barrou = false;
    try {
      await c.query(`insert into pick_ledger (match_id,date,market_key,payload,status) values ('probe','2026-11-21','x','{}','invalido')`);
    } catch (e) {
      barrou = /ledger_status_chk/.test(e.message);
    }
    await c.query("ROLLBACK TO SAVEPOINT s1");
    ok(barrou, "CHECK bloqueia status inválido em INSERT novo");

    // trigger toca updated_at num UPDATE real.
    // `now()` é constante dentro da transação, então o teste envelhece o valor
    // antes: se o trigger não existir, updated_at continua no passado.
    const u = await c.query("select id from users order by id limit 1");
    if (u.rowCount) {
      // O próprio ato de envelhecer o valor dispara o trigger, então ele é
      // desligado só nesta transação (o rollback devolve tudo) para provar que
      // é ele quem avança o relógio depois.
      await c.query("alter table users disable trigger t_users_touch");
      await c.query("update users set updated_at = now() - interval '2 days' where id = $1", [u.rows[0].id]);
      await c.query("alter table users enable trigger t_users_touch");
      const antes = await c.query("select updated_at from users where id = $1", [u.rows[0].id]);
      await c.query("update users set name = name where id = $1", [u.rows[0].id]);
      const d = await c.query("select updated_at from users where id = $1", [u.rows[0].id]);
      ok(d.rows[0].updated_at > antes.rows[0].updated_at, "trigger avançou users.updated_at", `${antes.rows[0].updated_at.toISOString()} → ${d.rows[0].updated_at.toISOString()}`);
      // e as 10 tabelas têm trigger, uma por uma
      const faltando = [];
      for (const t of ["users","favorites","alert_prefs","tickets","pick_ledger","value_bet_history","deletion_requests","gameread_pinned_props","apitou_pinned_desajustes","fcm_tokens"]) {
        const r = await c.query('select 1 from pg_trigger where tgrelid = $1::regclass and tgname = $2 and not tgisinternal', [t, `t_${t}_touch`]);
        if (r.rowCount === 0) faltando.push(t);
      }
      ok(faltando.length === 0, "trigger presente nas 10 tabelas", faltando.length ? `falta em: ${faltando.join(", ")}` : "10/10");
    } else {
      ok(false, "sem linha em users para testar o trigger");
    }

    const pub = await c.query("select public_id from users limit 1");
    if (pub.rowCount) ok(/^[0-9a-f-]{36}$/.test(pub.rows[0].public_id), "public_id preenchido em linha existente", pub.rows[0].public_id);
  } catch (e) {
    console.error("❌ ERRO NA EXECUÇÃO:", e.message);
    falhas.push("execução");
  } finally {
    await c.query("ROLLBACK");
    // confirma que o rollback devolveu o schema ao estado anterior
    const depois = await c.query(
      `select count(*)::int as n from information_schema.columns
       where table_schema='public' and column_name='public_id'`
    );
    ok(depois.rows[0].n === 0, "ROLLBACK deixou o banco como estava (0 public_id)");
    c.release();
    await p.end();
    console.log(falhas.length === 0 ? "\n✅ ensaio limpo — nada foi aplicado" : `\n❌ ${falhas.length} falha(s)`);
    process.exit(falhas.length ? 1 : 0);
  }
})();
