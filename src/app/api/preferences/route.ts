import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { alertPrefs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { str, boolMap, jsonBytes } from "@/lib/validate";

// Chaves aceitas em `alerts` — qualquer outra é descartada.
const ALERT_KEYS = ["goals", "redCards", "yellowCards", "corners", "fouls", "offsides", "matchStart", "matchEnd", "substitutions", "lineups", "MoneyTIPS"] as const;
/** Teto de bytes para o JSON de preferências (proteção contra blob). */
const MAX_PREFS_BYTES = 4096;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ alerts: {} });
  const teamId = req.nextUrl.searchParams.get("teamId") || "*";
  const matchId = req.nextUrl.searchParams.get("matchId") || "";
  const rows = await db.select().from(alertPrefs).where(and(eq(alertPrefs.userId, user.id), eq(alertPrefs.teamId, teamId), eq(alertPrefs.matchId, matchId))).limit(1);
  return NextResponse.json({ alerts: rows[0]?.alerts || {} });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  const body = await req.json();
  if (!user) return NextResponse.json({ ok: true, anon: true });
  // `alerts` precisa ser um mapa raso de booleanos conhecidos, com teto de tamanho.
  const alerts = boolMap(body.alerts, ALERT_KEYS);
  if (!alerts) return NextResponse.json({ error: "Preferências inválidas." }, { status: 400 });
  if (jsonBytes(alerts) > MAX_PREFS_BYTES) return NextResponse.json({ error: "Preferências muito grandes." }, { status: 400 });
  const teamId = str(body.teamId, 64) || "*";
  const matchId = str(body.matchId, 64) || "";
  await db.insert(alertPrefs).values({ userId: user.id, teamId, matchId, alerts })
    .onConflictDoUpdate({ target: [alertPrefs.userId, alertPrefs.teamId, alertPrefs.matchId], set: { alerts } });
  return NextResponse.json({ ok: true });
}