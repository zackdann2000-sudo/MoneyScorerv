/**
 * Track record — registra oportunidades, liquida jogos encerrados e mostra stats.
 *
 *   npx tsx scripts/track-record.ts --register
 *   npx tsx scripts/track-record.ts --settle
 *   npx tsx scripts/track-record.ts --all
 *   npx tsx scripts/track-record.ts --stats
 */
import "dotenv/config";
import { registrarOportunidadesDoDia, liquidarPendentes, estatisticas } from "@/lib/trackRecord";

const flag = (n: string) => process.argv.includes(`--${n}`);
const arg = (n: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
};

async function main() {
  const fazerTudo = flag("all") || (!flag("stats") && !flag("register") && !flag("settle"));

  if (flag("register") || fazerTudo) {
    const r = await registrarOportunidadesDoDia({ date: arg("date") });
    console.log(`Registro: ${r.oportunidades} oportunidades, ${r.registrados} novas.`);
  }
  if (flag("settle") || fazerTudo) {
    const r = await liquidarPendentes({ dias: arg("dias") ? Number(arg("dias")) : 10 });
    console.log(`Liquidação: ${r.liquidados} palpites (${r.resumo.green} green / ${r.resumo.red} red).`);
  }

  const s = await estatisticas();
  console.log("─".repeat(48));
  console.log(`Total gerado : ${s.total} (${s.pendentes} pendentes)`);
  console.log(`Green / Red  : ${s.greens} / ${s.reds}`);
  console.log(`Hit rate     : ${s.hitRate == null ? "—" : s.hitRate.toFixed(1) + "%"}`);
  console.log(`Unidades     : ${s.unidades >= 0 ? "+" : ""}${s.unidades.toFixed(2)} u (stake total ${s.stakeTotal.toFixed(2)} u)`);
  console.log(`ROI          : ${s.roi == null ? "—" : s.roi.toFixed(1) + "%"}`);
  console.log("─".repeat(48));
  process.exit(0);
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});