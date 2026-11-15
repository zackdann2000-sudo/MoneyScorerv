import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPass, createSession, getUser, TRIAL_DAYS } from "@/lib/auth";
import { isOwnerEmail } from "@/lib/appConfig";
import { str } from "@/lib/validate";
import { rateLimit, clientIp } from "@/lib/rateLimit";

/** Tetos de entrada: evitam DoS de CPU no scrypt e linhas gigantes no banco. */
const MAX_NAME = 80;
const MAX_EMAIL = 254; // limite prático de e-mail (RFC 5321)
const MAX_PASS = 1024;

/**
 * Criação em massa de contas era o vetor: cada cadastro concede 2 dias de
 * trial, então um script podia inflar a base e o custo de scrypt.
 * 5 cadastros por IP a cada hora é generoso para uso humano e hostil para
 * automação.
 */
const REGISTER_LIMIT = { limit: 5, windowSec: 3600 };

export const dynamic = "force-dynamic";

function tooMany(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Muitos cadastros nesta origem. Tente novamente mais tarde." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = str(body.name, MAX_NAME);
    const em = (str(body.email, MAX_EMAIL) || "").toLowerCase();
    const pass = typeof body.pass === "string" ? body.pass : "";

    // Rate limiting ANTES do scrypt e do INSERT.
    const ipCheck = await rateLimit("register:ip", clientIp(req), REGISTER_LIMIT);
    if (!ipCheck.ok) return tooMany(ipCheck.retryAfterSec);

    if (!name || name.length < 2) return NextResponse.json({ error: "Informe seu nome." }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    // Mínimo 6 e MÁXIMO MAX_PASS: senha de 1 MB travaria o scrypt (DoS de CPU).
    if (pass.length < 6) return NextResponse.json({ error: "A senha precisa de pelo menos 6 caracteres." }, { status: 400 });
    if (pass.length > MAX_PASS) return NextResponse.json({ error: "A senha é muito longa." }, { status: 400 });
    const exists = await db.select().from(users).where(eq(users.email, em)).limit(1);
    if (exists.length) return NextResponse.json({ error: "Este e-mail já tem conta. Faça login." }, { status: 409 });
    const isOwner = isOwnerEmail(em);
    const expiresAt = isOwner ? new Date("2099-12-31T00:00:00Z") : new Date(Date.now() + TRIAL_DAYS * 864e5);
    const rows = await db.insert(users).values({
      name, email: em, passHash: hashPass(pass),
      role: isOwner ? "owner" : "user", plan: isOwner ? "vip" : "trial", expiresAt,
    }).returning();
    await createSession(rows[0].id);
    const user = await getUser();
    return NextResponse.json({ user, bonus: isOwner ? null : `Conta criada. Você tem ${TRIAL_DAYS} dias de acesso às oportunidades, dicas e estratégias.` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no cadastro." }, { status: 500 });
  }
}
