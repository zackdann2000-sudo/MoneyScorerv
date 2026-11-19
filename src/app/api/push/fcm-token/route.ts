import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { fcmTokens } from "@/db/schema";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/push/fcm-token
 * Body: { token: string, platform?: "android" | "ios" | "web" }
 *
 * Registra/atualiza o token FCM do aparelho. Se houver sessão, associa ao
 * usuário; sem sessão, guarda o token anônimo (será linkado no login).
 *
 * A captura do token no app (Service Worker/SDK) fica para a publicação —
 * esta rota é o ponto de entrada que o app usará.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const token = String(body?.token || "").trim();
  if (token.length < 20 || token.length > 4096) {
    return NextResponse.json({ error: "token inválido." }, { status: 400 });
  }
  const platformRaw = String(body?.platform || "android").toLowerCase();
  const platform = ["android", "ios", "web"].includes(platformRaw) ? platformRaw : "android";

  const user = await getUser().catch(() => null);

  try {
    await db
      .insert(fcmTokens)
      .values({ token, userId: user?.id ?? null, platform, lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: fcmTokens.token,
        set: { userId: user?.id ?? null, platform, lastSeenAt: new Date() },
      });
    return NextResponse.json({ ok: true, vinculado: Boolean(user?.id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao salvar token." }, { status: 500 });
  }
}
