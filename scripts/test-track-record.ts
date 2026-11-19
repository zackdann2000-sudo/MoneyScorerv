/**
 * Teste rápido do Track Record (dashboard /forebet → "Desempenho histórico").
 *
 * Insere 3 palpites de teste no banco, simula a liquidação (2 GREEN + 1 RED)
 * e confere se a matemática do dashboard (ROI, hit rate, unidades, stake)
 * bate com o esperado. No fim, apaga os palpites de teste (a menos que --keep).
 *
 *   npx tsx scripts/test-track-record.ts
 *   npx tsx scripts/test-track-record.ts --keep
 *
 * Não faz build. Só usa o banco (Neon) e o módulo puro `trackStats`.
 */
import "dotenv/config";
import assert from "node:assert";
import { db } from "@/db";
import { valueBetHistory } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calcularStats } from "@/lib/trackStats";
import { estatisticas } from "@/lib/trackRecord";

const MANTER = process.argv.includes("--keep");
const LOTE = `TEST-TR-${Date.now()}`;

// Cenário: 2 green + 1 red. Unidade = % da banca apostada.
const CASOS = [
  { mercado: "over25", odd: 1.85, stake: 0.05, esperado: "green" as const }, // +4.25 u
  { mercado: "btts", odd: 2.1, stake: 0.025, esperado: "green" as const }, // +2.75 u
  { mercado: "home", odd: 1.6, stake: 0.05, esperado: "red" as const }, //   -5.00 u
];

const ESPERADO = {
  green: 2,
  red: 1,
  total: 3,
  hitRate: 66.666666,
  unidades: 2.0, // 4.25 + 2.75 - 5.00
  stakeTotal: 12.5, // 5 + 2.5 + 5
  roi: 16.0, // 2.0 / 12.5
};

const perto = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

async function main() {
  console.log(`Lote de teste: ${LOTE}`);
  const antes = await estatisticas();

  // 1) registra 3 oportunidades pendentes
  await db.insert(valueBetHistory).values(
    CASOS.map((c, i) => ({
      matchId: `${LOTE}-${i + 1}`,
      mercado: c.mercado,
      rotulo: `TESTE ${c.mercado}`,
      odd: c.odd,
      evPct: 18 + i,
      stake: c.stake,
      probModelo: 0.7,
      matchDate: new Date().toISOString().slice(0, 10),
      homeName: "Time A",
      awayName: "Time B",
      leagueName: "Liga Teste",
      status: "pendente",
    })),
  );

  // 2) simula a liquidação (mesmos campos que `liquidarPendentes` grava)
  for (let i = 0; i < CASOS.length; i++) {
    await db
      .update(valueBetHistory)
      .set({
        status: CASOS[i].esperado,
        homeScore: CASOS[i].esperado === "green" ? 2 : 0,
        awayScore: CASOS[i].esperado === "green" ? 1 : 1,
        settledAt: new Date(),
      })
      .where(eq(valueBetHistory.matchId, `${LOTE}-${i + 1}`));
  }

  // 3) confere a matemática no subconjunto de teste
  const linhas = await db.select().from(valueBetHistory).where(eq(valueBetHistory.matchId, `${LOTE}-1`));
  const todas = await db
    .select()
    .from(valueBetHistory)
    .then((r) => r.filter((x) => x.matchId.startsWith(LOTE)));
  assert.strictEqual(linhas.length, 1, "palpite de teste não encontrado");
  const m = calcularStats(todas);

  assert.strictEqual(m.total, ESPERADO.total, "total");
  assert.strictEqual(m.greens, ESPERADO.green, "greens");
  assert.strictEqual(m.reds, ESPERADO.red, "reds");
  assert.ok(perto(m.hitRate!, ESPERADO.hitRate), `hit rate ${m.hitRate}`);
  assert.ok(perto(m.unidades, ESPERADO.unidades), `unidades ${m.unidades}`);
  assert.ok(perto(m.stakeTotal, ESPERADO.stakeTotal), `stake ${m.stakeTotal}`);
  assert.ok(perto(m.roi!, ESPERADO.roi), `ROI ${m.roi}`);

  // 4) confere que o agregado do dashboard subiu exatamente o esperado
  const depois = await estatisticas();
  assert.strictEqual(depois.total - antes.total, 3, "delta total");
  assert.strictEqual(depois.greens - antes.greens, 2, "delta greens");
  assert.strictEqual(depois.reds - antes.reds, 1, "delta reds");
  assert.ok(perto(depois.unidades - antes.unidades, ESPERADO.unidades), "delta unidades");
  assert.ok(perto(depois.stakeTotal - antes.stakeTotal, ESPERADO.stakeTotal), "delta stake");

  console.log("\n── Resultado do cenário (2 green + 1 red) ──");
  console.log(`Total        : ${m.total}  (esperado ${ESPERADO.total})`);
  console.log(`Hit rate     : ${m.hitRate!.toFixed(2)}%  (esperado ${ESPERADO.hitRate.toFixed(2)}%)`);
  console.log(`Unidades     : ${m.unidades.toFixed(2)} u  (esperado ${ESPERADO.unidades.toFixed(2)} u)`);
  console.log(`Stake total  : ${m.stakeTotal.toFixed(2)} u  (esperado ${ESPERADO.stakeTotal.toFixed(2)} u)`);
  console.log(`ROI          : ${m.roi!.toFixed(2)}%  (esperado ${ESPERADO.roi.toFixed(2)}%)`);
  console.log(`\nDashboard antes → depois: total ${antes.total}→${depois.total}, greens ${antes.greens}→${depois.greens}, unidades ${antes.unidades}→${depois.unidades}`);

  // 5) limpeza
  if (MANTER) {
    console.log(`\n--keep: lote ${LOTE} mantido no banco.`);
  } else {
    const del = await db.delete(valueBetHistory).where(eq(valueBetHistory.matchId, `${LOTE}-1`));
    for (let i = 2; i <= CASOS.length; i++) {
      await db.delete(valueBetHistory).where(eq(valueBetHistory.matchId, `${LOTE}-${i}`));
    }
    const fim = await estatisticas();
    assert.strictEqual(fim.total, antes.total, "limpeza não restaurou o total");
    console.log(`Limpeza ok — ${del?.rowCount ?? 0}+ linhas de teste removidas; dashboard de volta a ${fim.total} palpites.`);
  }

  console.log("\n✅ TRACK RECORD OK — ROI, hit rate, unidades e stake conferem.");
  process.exit(0);
}

main().catch((e) => {
  console.error("\n❌ FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});