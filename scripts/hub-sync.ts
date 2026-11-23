/**
 * Job de sincronização do módulo Hub (CLI) — SISTEMA DE CASCATA.
 *
 *   npx tsx scripts/hub-sync.ts --dates=3 --history=10 --odds=6 --lineups=3 --analyze --settle
 *
 * `--history=N` ingere os N dias PASSADOS (placar finalizado). Sem isso o banco
 * não acumula resultado e o motor publica a média da liga para todo jogo — a
 * análise fica igual em toda a competição.
 *
 * A orquestração vive em `src/lib/hub/sync-runner.ts` e é a MESMA usada pela
 * rota `/api/hub/sync`. Este arquivo só lê os argumentos da linha de comando,
 * chama o runner e imprime o relatório:
 *
 *   1. fixtures      ESPN -> Football-Data.org -> Sportmonks
 *   2. placar        ESPN (jogos de hoje) + Sportmonks inplay
 *   3. odds          Sportmonks -> Bzzoiro -> ESPN   (sem odd = sem "Valor")
 *   4. escalações    Sportmonks -> Bzzoiro -> ESPN
 *   5. stats + H2H   Bzzoiro -> ESPN
 *   6. análise       preview/final (o motor roda com o que existir)
 *   7. liquidação    ledger -> won/lost/void
 *
 * O relatório final mostra POR FORNECEDOR quem respondeu e quem falhou.
 */
import "dotenv/config";
import { runHubSync } from "../src/lib/hub/sync-runner";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split("=")[1];
  if (process.argv.includes(`--${name}`)) return "true";
  return fallback;
}

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

async function main() {
  const report = await runHubSync({
    dates: num(arg("dates"), 3),
    historyDays: num(arg("history"), 7),
    odds: num(arg("odds"), 6),
    lineups: num(arg("lineups"), 3),
    context: num(arg("context"), 24),
    analyze: arg("analyze") === "true" || arg("analyze") === undefined,
    settle: arg("settle") === "true" || arg("settle") === undefined,
    maxOdds: num(arg("max-odds"), 80),
    maxLineups: num(arg("max-lineups"), 60),
    maxContext: num(arg("max-context"), 40),
  });
  console.log(JSON.stringify(report, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
