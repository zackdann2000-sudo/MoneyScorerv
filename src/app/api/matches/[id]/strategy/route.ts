import { NextRequest, NextResponse } from "next/server";
import { specificStrategy } from "@/lib/listStrategy";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";
  try {
    const data = await specificStrategy(league, id);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ strategy: null, error: e?.message || "Falha ao ler o histórico." }, { status: 200 });
  }
}