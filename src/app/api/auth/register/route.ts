import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { hashPass, createSession, getUser } from "@/lib/auth";
import { decidirAcesso, TRIAL_HORAS } from "@/lib/trialPolicy";
import { isOwnerEmail } from "@/lib/appConfig";
import { str } from "@/lib/validate";
import { rateLimit, clientIp } from "@/lib/rateLimit";

/** Tetos de entrada: evitam DoS de CPU no scrypt e linhas gigantes no banco. */
const MAX_NAME = 80;
const MAX_EMAIL = 254; // limite prático de e-mail (RFC 5321)
const MAX_PASS = 1024;

/**
 * Criação em massa de contas era o vetor: cada cadastro concede 24h de
 * trial, então um script podia inflar a base e o custo de scrypt.
 * 5 cadastros por IP a cada hora é generoso para uso humano e hostil para
 * automação.
 */
const REGISTER_LIMIT = { limit: 5, windowSec: 3600 };

export const dynamic = "force-dynamic";

/** UUID v4 (aceita também ids de 8–64 chars alfanuméricos com - e _). */
const DEVICE_RE = /^[A-Za-z0-9_-]{8,64}$/;

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

    // ---- Anti-fraude do trial: 24h uma única vez por dispositivo/IP ----
    const deviceId = typeof body.deviceId === "string" && DEVICE_RE.test(body.deviceId) ? body.deviceId : null;
    const ip = clientIp(req);
    const ipValido = /^[0-9a-fA-F.:]{3,64}$/.test(ip) && ip !== "unknown";
    const condicoes = [];
    if (deviceId) condicoes.push(eq(users.deviceId, deviceId));
    if (ipValido) condicoes.push(eq(users.registrationIp, ip));
    let reusado = false;
    if (condicoes.length) {
      const jaUsado = await db
        .select({ id: users.id })
        .from(users)
        .where(condicoes.length > 1 ? or(...condicoes) : condicoes[0])
        .limit(1);
      reusado = jaUsado.length > 0;
    }

    const isOwner = isOwnerEmail(em);
    const acesso = decidirAcesso({ isOwner, reusado });
    const rows = await db.insert(users).values({
      name, email: em, passHash: hashPass(pass),
      role: acesso.role, plan: acesso.plan, expiresAt: acesso.expiresAt,
      deviceId, registrationIp: ipValido ? ip : null,
    }).returning();
    await createSession(rows[0].id);
    const user = await getUser();
    const bonus = isOwner
      ? null
      : reusado
        ? null
        : `Conta criada. Você tem ${TRIAL_HORAS}h de acesso às oportunidades, dicas e estratégias.`;
    return NextResponse.json({ user, bonus, trialReusado: reusado });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no cadastro." }, { status: 500 });
  }
}
