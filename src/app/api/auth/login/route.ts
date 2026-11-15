import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPass, createSession, getUser } from "@/lib/auth";
import { str } from "@/lib/validate";
import { rateLimit, clientIp } from "@/lib/rateLimit";

const MAX_EMAIL = 254;
// Teto generoso (mas finito): senha enorme faria o scrypt consumir CPU demais.
const MAX_PASS = 1024;

/**
 * Limites de força bruta. Duas camadas complementares:
 *  - por IP: trava quem varre muitas contas de uma origem só.
 *  - por e-mail: trava password spray distribuído (muitos IPs, uma conta).
 * Janela de 5 min para o IP e 15 min para a conta — a conta precisa de uma
 * janela mais longa porque o ataque distribuído é mais lento por natureza.
 */
const IP_LIMIT = { limit: 10, windowSec: 300 };
const EMAIL_LIMIT = { limit: 5, windowSec: 900 };

export const dynamic = "force-dynamic";

/** Resposta 429 com `Retry-After`, sem revelar se a conta existe. */
function tooMany(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Muitas tentativas. Tente novamente em alguns minutos." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const em = (str(body.email, MAX_EMAIL) || "").toLowerCase();
    const pass = typeof body.pass === "string" ? body.pass : "";

    // Rate limiting ANTES de qualquer trabalho caro (scrypt / consulta).
    const ipCheck = await rateLimit("login:ip", clientIp(req), IP_LIMIT);
    if (!ipCheck.ok) return tooMany(ipCheck.retryAfterSec);
    if (em) {
      const emailCheck = await rateLimit("login:email", em, EMAIL_LIMIT);
      if (!emailCheck.ok) return tooMany(emailCheck.retryAfterSec);
    }

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
