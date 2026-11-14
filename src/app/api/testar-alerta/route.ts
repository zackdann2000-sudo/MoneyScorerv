import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { testarAlerta } from "@/lib/push";
import { str } from "@/lib/validate";

export const dynamic = "force-dynamic";

/**
 * Disparo de alerta de teste.
 *
 * SEGURANÇA: esta rota envia push para TODA a base de inscritos
 * (`testarAlerta` → `dispatch` → `enviarNotificacao(null, ...)`, que faz um
 * SELECT sem WHERE em push_subs). Por isso é restrita ao administrador.
 * Antes era pública: qualquer visitante conseguia notificar todos os usuários
 * e ainda injetar texto arbitrário no título via ?name=.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  const teamId = str(req.nextUrl.searchParams.get("teamId"), 64) || "teste";
  const name = str(req.nextUrl.searchParams.get("name"), 80) || "Seu Time";
  const r = await testarAlerta(teamId, name);
  return NextResponse.json(r);
}
