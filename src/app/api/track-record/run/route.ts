import { NextRequest, NextResponse } from "next/server";
import { registrarOportunidadesDoDia, liquidarPendentes, estatisticas } from "@/lib/trackRecord";
import { motivoCronAutorizado, cronConfigurado } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
// 300s = teto do plano Hobby (Fluid Compute). A liquidação + registro ficam
// bem abaixo disso; a margem é para pior caso (fonte lenta, muitos jogos).
export const maxDuration = 300;

/**
 * Track record — registra oportunidades, liquida jogos encerrados e devolve stats.
 *
 * GET  → roda registro + liquidação + stats (Vercel Cron, diário 13:00 UTC = 10h BRT)
 * GET  ?acao=stats → só as estatísticas (read-only)
 * POST → idem ao GET (curl manual), aceita body { acao, date, dias }
 *
 * Segurança (mesmo esquema das outras rotas internas):
 *   - Vercel Cron: `Authorization: Bearer $CRON_SECRET`
 *   - Manual: header `x-cron-secret: <PUSH_CRON_SECRET>` ou `?secret=`
 */
export async function GET(req: NextRequest) {
  const motivo = motivoCronAutorizado(req, "PUSH_CRON_SECRET");
  if (!motivo) {
    return NextResponse.json(
      cronConfigurado("PUSH_CRON_SECRET")
        ? { error: "não autorizado." }
        : { error: "nenhum segredo configurado (CRON_SECRET ou PUSH_CRON_SECRET)." },
      { status: cronConfigurado("PUSH_CRON_SECRET") ? 401 : 503 },
    );
  }
  const acao = req.nextUrl.searchParams.get("acao") ?? "tudo";
  if (acao === "stats") {
    try {
      return NextResponse.json(await estatisticas());
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Falha ao ler estatísticas." }, { status: 502 });
    }
  }
  try {
    const out: any = { acao, motivo };
    if (acao === "registrar" || acao === "tudo") {
      out.registro = await registrarOportunidadesDoDia({
        date: req.nextUrl.searchParams.get("date") ?? undefined,
      });
    }
    if (acao === "liquidar" || acao === "tudo") {
      out.liquidacao = await liquidarPendentes({ dias: Number(req.nextUrl.searchParams.get("dias") ?? 10) });
    }
    out.estatisticas = await estatisticas();
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no track record." }, { status: 502 });
  }
}

/** POST = curl manual; aceita body { acao, date, dias } igual ao GET. */
export async function POST(req: NextRequest) {
  const motivo = motivoCronAutorizado(req, "PUSH_CRON_SECRET");
  if (!motivo) {
    return NextResponse.json(
      cronConfigurado("PUSH_CRON_SECRET")
        ? { error: "não autorizado." }
        : { error: "nenhum segredo configurado (CRON_SECRET ou PUSH_CRON_SECRET)." },
      { status: cronConfigurado("PUSH_CRON_SECRET") ? 401 : 503 },
    );
  }
  let body: any = {};
  try { body = await req.json(); } catch { /* body opcional */ }
  const sp = req.nextUrl.searchParams;
  const acao = String(body?.acao ?? sp.get("acao") ?? "tudo");

  try {
    const out: any = { acao, motivo };
    if (acao === "registrar" || acao === "tudo") {
      out.registro = await registrarOportunidadesDoDia({
        date: body?.date ?? sp.get("date") ?? undefined,
      });
    }
    if (acao === "liquidar" || acao === "tudo") {
      out.liquidacao = await liquidarPendentes({ dias: Number(body?.dias ?? sp.get("dias") ?? 10) });
    }
    out.estatisticas = await estatisticas();
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no track record." }, { status: 502 });
  }
}