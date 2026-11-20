/**
 * Cron diário (06:00 BRT = 09:00 UTC).
 *
 * Faz as duas tarefas de manhã em uma invocação só, porque o plano Hobby da
 * Vercel aceita no máximo 2 cron jobs — e as outras duas rotas já ocupavam a
 * cota quando este job entrou (o track record continua às 13:00 UTC).
 *
 *   1. sincroniza as fontes do apitou  (`sincronizarEGravar`)
 *   2. pré-aquece os rankings das 6 ligas e grava no Neon (`aquecerRankings`)
 *
 * Regras: uma etapa que falha não impede a outra; as duas são idempotentes.
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

export const dynamic = "force-dynamic";
// 300s = teto do Hobby (Fluid Compute). Apitou (~36s) + rankings (~50s) cabem com folga.
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
      const resumo = await sincronizarEGravar();
      out.apitou = { ok: true, duracaoMs: Date.now() - t0, ...resumo };
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

  const rankings = out.rankings as { falhas?: number; puladas?: string[] } | undefined;
  const todasOk = acao === "rankings" ? rankings?.falhas === 0 : true;
  return NextResponse.json(out, { status: todasOk ? 200 : 207 });
}

export const POST = GET;
