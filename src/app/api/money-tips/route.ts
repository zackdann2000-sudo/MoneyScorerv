import { NextRequest, NextResponse } from "next/server";
import { getPickDoDia } from "@/lib/engine";
import { todayYmd } from "@/lib/espn";
import { db } from "@/db";
import { pickLedger } from "@/db/schema";
import { desc } from "drizzle-orm";
import { pushOneSignal } from "@/lib/push";
import { settleLedger, recordPublished } from "@/lib/credibility";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const date = (req.nextUrl.searchParams.get("date") || todayYmd()).replace(/-/g, "");
  try {
    await settleLedger();
    const data = await getPickDoDia(date);
    const published = [data.pick, ...(data.melhores || [])].filter(Boolean);
    if (date >= todayYmd()) await recordPublished(published, date);
    let historico: any[] = [];
    try {
      const rows = await db.select().from(pickLedger).orderBy(desc(pickLedger.date)).limit(40);
      historico = rows
        .filter((r) => r.status !== "pendente" || r.date < todayYmd())
        .map((r) => ({ id: r.id, date: r.date, status: r.status, isPick: r.isPick, profit: r.profit, oddMercado: r.oddMercado, oddJusta: r.oddJusta, ev: r.ev, jogo: (r.payload as any)?.jogo, oportunidade: (r.payload as any)?.oportunidade, matchId: r.matchId, league: r.league }));
    } catch { historico = []; }
    const g = globalThis as any;
    g.__gsPickNotified = g.__gsPickNotified || {};
    if (data.pick && date === todayYmd() && !g.__gsPickNotified[date]) {
      g.__gsPickNotified[date] = true;
      const p: any = data.pick;
      const n = p.oportunidade.totalJogos;
      pushOneSignal({
        title: "🧙‍️ Bet do Money Tips disponível",
        body: `${p.jogo.timeCasa} x ${p.jogo.timeFora}: ${p.oportunidade.mercado} ${p.oportunidade.linha} (${p.oportunidade.acertos}/${n}). ${n < 10 ? "Amostra pequena — não é garantia." : "Veja o EV antes de decidir."}`,
        url: `/jogos/${p.matchId}?tab=money-tips&league=${p.league}`,
        icon: p.jogo.logoCasa,
        tagKey: "MoneyTIPS",
      }).catch(() => {});
    }
    return NextResponse.json({ ...data, historico });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao calcular o pick do dia.", pick: null, melhores: [], historico: [] }, { status: 200 });
  }
}