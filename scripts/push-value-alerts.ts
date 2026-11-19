/**
 * Script de disparo dos alertas de valor (VIP) via FCM.
 *
 * Uso (Termux / VPS):
 *   npx tsx scripts/push-value-alerts.ts                # envio real
 *   npx tsx scripts/push-value-alerts.ts --dry          # só simula
 *   npx tsx scripts/push-value-alerts.ts --minEv=20 --limite=3
 *   npx tsx scripts/push-value-alerts.ts --date=2025-01-31
 *
 * Precisa de: DATABASE_URL e as credenciais FCM_* (FCM_PROJECT_ID,
 * FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY). Sem FCM o script roda em modo relatório.
 */
import "dotenv/config";
import { dispararAlertasValor } from "@/lib/valueAlertPush";

function arg(nome: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${nome}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
}
const flag = (nome: string) => process.argv.includes(`--${nome}`);

async function main() {
  const dryRun = flag("dry");
  const resumo = await dispararAlertasValor({
    dryRun,
    date: arg("date"),
    minEv: arg("minEv") ? Number(arg("minEv")) : undefined,
    maxXgApi: arg("maxXgApi") ? Number(arg("maxXgApi")) : undefined,
    maxMatches: arg("maxMatches") ? Number(arg("maxMatches")) : undefined,
    limite: arg("limite") ? Number(arg("limite")) : undefined,
  });

  console.log("─".repeat(56));
  console.log(`Alertas de valor${dryRun ? " (SIMULAÇÃO)" : ""}`);
  console.log(`FCM configurado : ${resumo.fcmConfigurado ? "sim" : "NÃO"}`);
  console.log(`Jogos analisados: ${resumo.analisados}`);
  console.log(`Elegíveis (EV)  : ${resumo.elegiveis.length}`);
  console.log(`Novos (sem dedupe): ${resumo.novos.length}`);
  console.log(`Tokens VIP      : ${resumo.tokens}`);
  console.log(`Enviados / falhas: ${resumo.enviados} / ${resumo.falhas}`);
  if (resumo.invalidosRemovidos) console.log(`Tokens inválidos removidos: ${resumo.invalidosRemovidos}`);
  if (resumo.erro) console.log(`Aviso: ${resumo.erro}`);
  console.log("─".repeat(56));
  for (const o of resumo.novos) {
    console.log(`• ${o.home.name} × ${o.away.name} | ${o.rotulo} | EV ${o.evPct >= 0 ? "+" : ""}${o.evPct.toFixed(1)}% | odd ${o.odd.toFixed(2)}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Falha no disparo:", e instanceof Error ? e.message : e);
  process.exit(1);
});