import { NextResponse } from "next/server";
import { smToday } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const matches = await smToday();
    return NextResponse.json({ matches, source: "sportmonks", updatedAt: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ matches: [], error: e?.message || "Sportmonks indisponível. Cole a chave no admin.", source: "sportmonks" });
  }
}