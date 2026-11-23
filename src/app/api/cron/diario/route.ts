/**
 * Cron diário (06:00 BRT = 09:00 UTC).
 *
 * Faz as duas tarefas de manhã em uma invocação só, porque o plano Hobby da
 * Vercel aceita no máximo 2 cron jobs — e as outras duas rotas já ocupavam a
 * cota quando este job entrou (o track record continua às 13:00 UTC).
 *
 *   1. sincroniza as fontes do apitou  (`sincronizarEGravar`)
 *   2. pré-aquece os rankings das 6 ligas e grava no Neon (`aquecerRankings`)
 *   3. sincroniza o Hub (`runHubSync`): fixtures + context, sem odds
 *
 * Regras: uma etapa que falha não impede a outra; todas são idempotentes.
 *
 * Sobre o Hub: função serverless NÃO continua rodando depois de responder, então
 * "background" aqui é um orçamento de tempo (`budgetMs`) dentro do maxDuration —
 * se o relógio estourar, as etapas seguintes são PULADAS e marcadas em
 * `hub.skipped`, nunca deixamos a função morrer no meio de uma escrita.
 * As odds ficam de fora do cron (a Sportmonks free bloqueia) e continuam na
 * rota manual `/api/hub/sync`. Desligue com `?hub=0`.
 *
 * Autorização (mesmo esquema das outras rotas internas):
 *   - Vercel Cron: `Authorization: Bearer $CRON_SECRET`
 *   - Manual: header `x-cron-secret: <PUSH_CRON_SECRET>` ou `?secret=`
 *   - Fail-closed: sem nenhum segredo configurado → 503.
 */

import { NextRequest, NextResponse } from "next/server";
import { cronConfigurado, motivoCronAutorizado } from "@/lib/cronAuth";
import { aquecerRankings } from "@/lib/rankingsWarm";
import { lerResumo, sincronizarEGravar } from "@/lib/apitou/store";
import { runHubSync } from "@/lib/hub/sync-runner";

export const dynamic = "force-dynamic";
// 300s = teto do Hobby (Fluid Compute). Apitou (~36s) + rankings (~50s) +
// Hub com orçamento de 120s cabem com folga; o orçamento protege o pior caso.
export const maxDuration = 300;

const erro = (e: any) => String(e?.message || e || "falha").slice(0, 200);

export async function GET(req: NextRequest) {
  const motivo = motivoCronAutorizado(req, "PUSH_CRON_SECRET");
  if (!motivo) {
    return NextResponse.json(
      {
        error: cronConfigurado("PUSH_CRON_SECRET")
          ? "não autorizado."
          : "nenhum segredo configurado (CRON_SECRET ou PUSH_CRON_SECRET).",
      },
      { status: cronConfigurado("PUSH_CRON_SECRET") ? 401 : 503 },
    );
  }

  const acao = req.nextUrl.searchParams.get("acao") ?? "tudo";
  const out: Record<string, unknown> = { acao, motivo };

  if (acao === "estado") {
    out.apitou = await lerResumo().catch(() => null);
    return NextResponse.json(out);
  }

  if (acao === "tudo" || acao === "apitou") {
    const t0 = Date.now();
    try {
      const r = await sincronizarEGravar({ origem: "cron" });
      out.apitou = {
        ok: true,
        pulado: r.pulado,
        duracaoMs: Date.now() - t0,
        jogos: r.dados.jogos.length,
        geradoEm: r.dados.geradoEm,
      };
    } catch (e) {
      out.apitou = { ok: false, duracaoMs: Date.now() - t0, erro: erro(e) };
    }
  }

  if (acao === "tudo" || acao === "rankings") {
    const ligas = (req.nextUrl.searchParams.get("ligas") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      out.rankings = await aquecerRankings({ ligas: ligas.length ? ligas : undefined });
    } catch (e) {
      out.rankings = { ok: false, erro: erro(e) };
    }
  }

  if (acao === "tudo" || acao === "hub") {
    const hubAtivo = req.nextUrl.searchParams.get("hub") !== "0";
    if (!hubAtivo) {
      out.hub = { skipped: true, reason: "desligado por ?hub=0" };
    } else {
      // 120s de Hub + apitou (~36s) + rankings (~50s) cabe nos 300s do Hobby.
      // Se os dois primeiros consumirem mais, o orçamento corta as etapas do
      // Hub em vez de a função morrer no teto da Vercel.
      const budgetParam = Number(req.nextUrl.searchParams.get("hubBudget"));
      const budgetMs = Number.isFinite(budgetParam) && budgetParam > 0 ? budgetParam * 1000 : 120_000;
      try {
        out.hub = await runHubSync({
          dates: 1,
          // 3 dias passados: alimenta `recentMatches` e evita a análise igual
          // para todos os jogos da liga (motor sem histórico).
          historyDays: 3,
          context: 24,
          // Odds dependem do plano pago da Sportmonks: ficam na rota manual.
          oddsEnabled: false,
          lineupsEnabled: false,
          analyze: true,
          settle: true,
          maxContext: 20,
          budgetMs,
        });
      } catch (e) {
        out.hub = { ok: false, erro: erro(e) };
      }
    }
  }

  const rankings = out.rankings as { falhas?: number; puladas?: string[] } | undefined;
  const todasOk = acao === "rankings" ? rankings?.falhas === 0 : true;
  return NextResponse.json(out, { status: todasOk ? 200 : 207 });
}

export const POST = GET;
