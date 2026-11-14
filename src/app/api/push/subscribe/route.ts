import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubs } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { VAPID_PUBLIC } from "@/lib/push";
import { httpUrl, str, plainObject, jsonBytes } from "@/lib/validate";

/** Teto do blob de chaves da subscription (auth + p256dh). */
const MAX_KEYS_BYTES = 1024;

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ publicKey: VAPID_PUBLIC });
}

export async function POST(req: NextRequest) {
  try {
    const { subscription } = await req.json();
    // O endpoint precisa ser uma URL http(s) real: é para onde o servidor
    // enviará o push. Sem isso, dá para injetar destinos arbitrários na base.
    const endpoint = httpUrl(subscription?.endpoint);
    const keys = plainObject(subscription?.keys, 8);
    // `keys` guarda { p256dh, auth } — ambos base64url curtos.
    const p256dh = str(keys?.p256dh, 256);
    const auth = str(keys?.auth, 64);
    if (!endpoint) return NextResponse.json({ error: "Endpoint de push inválido." }, { status: 400 });
    if (!p256dh || !auth) return NextResponse.json({ error: "Chaves da subscription inválidas." }, { status: 400 });
    const safeKeys = { p256dh, auth };
    if (jsonBytes(safeKeys) > MAX_KEYS_BYTES) return NextResponse.json({ error: "Chaves muito grandes." }, { status: 400 });
    const user = await getUser();
    await db.insert(pushSubs).values({ endpoint, userId: user?.id ?? null, keys: safeKeys })
      .onConflictDoUpdate({ target: pushSubs.endpoint, set: { keys: safeKeys, userId: user?.id ?? null } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha ao salvar inscrição." }, { status: 500 });
  }
}