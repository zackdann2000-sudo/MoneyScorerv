import { NextRequest, NextResponse } from "next/server";
import { registrarOportunidadesDoDia, liquidarPendentes, estatisticas } from "@/lib/trackRecord";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/track-record/run
 * Header: x-cron-secret: <PUSH_CRON_SECRET>  (ou ?secret=)
 * Body/query: { acao: "registrar" | "liquidar" | "tudo", date, dias }
 *
 * - registrar: grava as oportunidades do dia como pendentes (idempotente).
 * - liquidar: marca green/red nos jogos encerrados.
 * - tudo: as duas coisas.
 */
export async function POST(req: NextRequest) {
  const segredo = process.env.PUSH_CRON_SECRET || "";
  if (!segredo) {
    return NextResponse.json({ error: "PUSH_CRON_SECRET não configurado." }, { status: 503 });
  }
  const header = req.headers.get("x-cron-secret") || "";
  const qs = req.nextUrl.searchParams.get("secret") || "";
  if (header !== segredo && qs !== segredo) {
    return NextResponse.json({ error: "não autorizado." }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* body opcional */ }
  const sp = req.nextUrl.searchParams;
  const acao = String(body?.acao ?? sp.get("acao") ?? "tudo");

  try {
    const out: any = { acao };
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

/** GET /api/track-record/run?secret=... → somente as estatísticas consolidadas. */
export async function GET(req: NextRequest) {
  const segredo = process.env.PUSH_CRON_SECRET || "";
  const header = req.headers.get("x-cron-secret") || "";
  const qs = req.nextUrl.searchParams.get("secret") || "";
  if (!segredo || (header !== segredo && qs !== segredo)) {
    return NextResponse.json({ error: "não autorizado." }, { status: 401 });
  }
  try {
    return NextResponse.json(await estatisticas());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao ler estatísticas." }, { status: 502 });
  }
}