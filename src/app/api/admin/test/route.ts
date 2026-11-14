import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { testProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const provider = req.nextUrl.searchParams.get("provider") || "espn";
  const result = await testProvider(provider);
  return NextResponse.json(result);
}