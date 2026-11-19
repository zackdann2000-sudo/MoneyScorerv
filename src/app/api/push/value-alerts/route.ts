import { NextRequest, NextResponse } from "next/server";
import { dispararAlertasValor } from "@/lib/valueAlertPush";
import { motivoCronAutorizado, cronConfigurado } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/push/value-alerts
 * Dispara os alertas de valor (EV ≥ 15%) para os VIPs via FCM.
 *
 * Protegida pelo mesmo esquema das outras rotas internas:
 *   - Vercel Cron: `Authorization: Bearer $CRON_SECRET`
 *   - Manual: header `x-cron-secret: <PUSH_CRON_SECRET>` (ou ?secret=)
 *
 * Query/body opcionais: date, minEv, maxXgApi, maxMatches, limite, dryRun.
 * `dryRun=1` calcula tudo e devolve o que SERIA enviado, sem chamar a FCM.
 */
export async function POST(req: NextRequest) {
  if (!motivoCronAutorizado(req, "PUSH_CRON_SECRET")) {
    return NextResponse.json(
      cronConfigurado("PUSH_CRON_SECRET")
        ? { error: "não autorizado." }
        : { error: "nenhum segredo configurado (CRON_SECRET ou PUSH_CRON_SECRET)." },
      { status: cronConfigurado("PUSH_CRON_SECRET") ? 401 : 503 },
    );
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    /* body opcional */
  }
  const sp = req.nextUrl.searchParams;
  const num = (v: any, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  try {
    const resumo = await dispararAlertasValor({
      date: body?.date ?? sp.get("date") ?? undefined,
      minEv: num(body?.minEv ?? sp.get("minEv"), 15),
      maxXgApi: num(body?.maxXgApi ?? sp.get("maxXgApi"), 6),
      maxMatches: num(body?.maxMatches ?? sp.get("maxMatches"), 8),
      limite: num(body?.limite ?? sp.get("limite"), 5),
      dryRun: String(body?.dryRun ?? sp.get("dryRun") ?? "") === "1" ||
        String(body?.dryRun ?? sp.get("dryRun") ?? "").toLowerCase() === "true",
    });
    return NextResponse.json(resumo);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao disparar alertas." }, { status: 502 });
  }
}
