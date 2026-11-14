import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { favorites } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { str, httpUrl, MAX_STR } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ favorites: [] });
  const rows = await db.select().from(favorites).where(eq(favorites.userId, user.id));
  return NextResponse.json({ favorites: rows.map((r) => ({ id: r.teamId, name: r.teamName, league: r.league, logo: r.logo })) });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: true, anon: true });
  const body = await req.json();
  const team = body?.team;
  // Todos os campos são strings curtas validadas; logo precisa ser URL http(s) válida.
  const teamId = str(team?.id, 64);
  const teamName = str(team?.name ?? "", MAX_STR) ?? "";
  const league = str(team?.league ?? "", 32) ?? "";
  const logo = team?.logo ? httpUrl(team.logo) ?? "" : "";
  if (!teamId) return NextResponse.json({ error: "Time inválido." }, { status: 400 });
  if (body.on) {
    await db.insert(favorites).values({ userId: user.id, teamId, teamName, league, logo })
      .onConflictDoNothing();
  } else {
    await db.delete(favorites).where(and(eq(favorites.userId, user.id), eq(favorites.teamId, teamId)));
  }
  return NextResponse.json({ ok: true });
}