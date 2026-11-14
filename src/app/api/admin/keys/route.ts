import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { PROVIDERS, getKey, setKey, maskKey } from "@/lib/keys";
import { oneOf, str } from "@/lib/validate";

/** Teto do token que pode ser gravado em api_keys. */
const MAX_TOKEN = 512;

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  const list = await Promise.all(PROVIDERS.map(async (p) => {
    const v = await getKey(p.id);
    return { ...p, configured: p.id === "espn" ? true : !!v, masked: maskKey(v) };
  }));
  return NextResponse.json({ providers: list });
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const body = await req.json();
  const provider = oneOf(body.provider, PROVIDERS.map((p) => p.id));
  if (!provider) return NextResponse.json({ error: "Provedor inválido." }, { status: 400 });
  const token = str(body.token, MAX_TOKEN);
  if (token === null) return NextResponse.json({ error: "Token inválido." }, { status: 400 });
  await setKey(provider, token);
  return NextResponse.json({ ok: true });
}