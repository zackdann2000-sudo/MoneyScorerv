import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPass, createSession, getUser } from "@/lib/auth";
import { str } from "@/lib/validate";

const MAX_EMAIL = 254;
// Teto generoso (mas finito): senha enorme faria o scrypt consumir CPU demais.
const MAX_PASS = 1024;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const em = (str(body.email, MAX_EMAIL) || "").toLowerCase();
    const pass = typeof body.pass === "string" ? body.pass : "";
    if (!em || !pass || pass.length > MAX_PASS) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }
    const rows = await db.select().from(users).where(eq(users.email, em)).limit(1);
    if (!rows.length || !verifyPass(pass, rows[0].passHash)) {
      return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
    }
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, rows[0].id));
    await createSession(rows[0].id);
    return NextResponse.json({ user: await getUser() });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no login." }, { status: 500 });
  }
}