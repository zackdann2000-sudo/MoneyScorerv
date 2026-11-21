import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { consents, deletionRequests } from "@/db/schema";
import { getUser, destroySession, deleteUserCascade } from "@/lib/auth";
import { str, oneOf, MAX_STR } from "@/lib/validate";

const ACTIONS = ["consent", "excluir"] as const;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = oneOf(body.action, ACTIONS);
    const user = await getUser();
    if (action === "consent") {
      // `voterKey` é um identificador anônimo (sem conta); nunca aceitamos
      // objeto/array aqui, e o tamanho é limitado.
      const voterKey = str(body.voterKey, 64) || null;
      await db.insert(consents).values({
        userId: user?.id ?? null,
        voterKey,
        push: !!body.push,
        terms: !!body.terms,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "excluir") {
      const email = (str(body.email, MAX_STR) || user?.email || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
      if (!body.confirm) return NextResponse.json({ error: "Confirme que deseja excluir os dados." }, { status: 400 });
      const target = user && user.email === email ? user : null;
      if (target && (target.role === "admin" || target.role === "owner")) {
        return NextResponse.json({ error: "Contas administrativas não são excluídas por este canal. Fale com o dono." }, { status: 403 });
      }
      if (target) {
        // Limpeza completa (inclui tickets e consents, antes esquecidos)
        const deleted = await deleteUserCascade(target.id);
        await destroySession();
        await db.insert(deletionRequests).values({ email, userId: null, status: "concluido" });
        return NextResponse.json({ ok: true, immediate: true, deleted, message: "Seus dados foram excluídos desta conta." });
      }
      await db.insert(deletionRequests).values({ email, userId: null, status: "pendente" });
      return NextResponse.json({ ok: true, immediate: false, message: "Pedido registrado. Se o e-mail existir, a exclusão é concluída no próximo acesso do administrador." });
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha." }, { status: 500 });
  }
}