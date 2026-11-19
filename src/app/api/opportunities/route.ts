import { NextRequest, NextResponse } from "next/server";
import { analisarOportunidades } from "@/lib/opportunitiesEngine";
import { getUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/opportunities?date=YYYY-MM-DD&limit=30&minProb=0.65&maxMatches=8&principais=1&xgApi=10
 *
 * `xgApi` limita quantos jogos (top por valor) podem gastar chamada real de xG
 * na API-Football. `xgApi=0` desliga o passo de API (só cache do Neon).
 *
 * COTA: a rota é pública (a UI free depende dela), mas quem NÃO está logado ou
 * está Free roda sempre com `xgApi=0` (zero chamada paga). VIP/admin pode pedir
 * até 2 jogos com xG real; valores maiores são cortados para 2.
 * Devolve as oportunidades de valor (modelo Poisson × odds de mercado) do dia,
 * mais os jogos já avaliados para a UI reaproveitar as probabilidades.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") || undefined;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date inválido, use YYYY-MM-DD" }, { status: 400 });
  }
  const num = (k: string, def?: number) => {
    const v = sp.get(k);
    if (v == null || v === "") return def;
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  // Rate limit por IP (20/h) — protege a cota paga mesmo em rota pública.
  const limite = await rateLimit("opportunities:ip", clientIp(req), { limit: 20, windowSec: 3600 });
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  // Só conta ativa/admin pode gastar xG real (máx. 2 jogos). Anônimo/Free = 0.
  const user = await getUser().catch(() => null);
  const vip = !!user && (user.isAdmin || user.access.active);
  const xgApi = vip ? Math.min(num("xgApi", 2) ?? 2, 2) : 0;

  try {
    const result = await analisarOportunidades({
      date,
      limit: num("limit", 30),
      minProb: num("minProb", 0.65),
      maxMatches: num("maxMatches", 8),
      principais: sp.get("principais") === "1",
      maxXgApi: xgApi,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao calcular oportunidades." }, { status: 502 });
  }
}
