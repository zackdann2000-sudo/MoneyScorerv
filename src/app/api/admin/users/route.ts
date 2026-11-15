import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, visits, sessions } from "@/db/schema";
import { eq, gte, count, desc } from "drizzle-orm";
import { requireAdmin, deleteUserCascade } from "@/lib/auth";
import { int, oneOf } from "@/lib/validate";

const PATCH_ACTIONS = ["vip", "expire", "role", "delete"] as const;

/** Paginação: teto duro para uma listagem não virar full-table scan. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const limit = int(sp.get("limit"), 1, MAX_LIMIT) ?? DEFAULT_LIMIT;
  const offset = int(sp.get("offset"), 0) ?? 0;

  // Colunas explícitas: antes era `select()` sem projeção, devolvendo
  // `pass_hash` e todo o resto do registro de cada usuário numa única resposta.
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      plan: users.plan,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const now = new Date();
  const list = rows.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    plan: u.plan,
    createdAt: u.createdAt.toISOString(),
  }));

  const dayAgo = new Date(Date.now() - 864e5);
  const [{ c: visitCount }] = await db.select({ c: count() }).from(visits).where(gte(visits.createdAt, dayAgo));
  const [{ c: sessCount }] = await db.select({ c: count() }).from(sessions).where(gte(sessions.expiresAt, now));
  // Total e contagem de ativos vêm do banco: com paginação, contar o array
  // local daria o número da página, não o da base.
  const [{ c: totalUsers }] = await db.select({ c: count() }).from(users);

  return NextResponse.json({
    users: list,
    page: { limit, offset, total: totalUsers, hasMore: offset + list.length < totalUsers },
    stats: {
      total: totalUsers,
      visits24h: visitCount,
      sessions: sessCount,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  const body = await req.json();
  const uid = int(body.id, 1);
  const action = oneOf(body.action, PATCH_ACTIONS);
  if (!uid) return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  if (!action) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const rows = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  if (!rows.length) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  const u = rows[0];
  const d = int(body.days, 1, 3650) ?? 30;
  if (action === "vip") {
    const base = u.expiresAt && u.expiresAt > new Date() ? u.expiresAt : new Date();
    await db.update(users).set({ plan: "vip", expiresAt: new Date(base.getTime() + d * 864e5) }).where(eq(users.id, uid));
  } else if (action === "expire") {
    await db.update(users).set({ expiresAt: new Date(Date.now() - 1000), plan: u.plan === "trial" ? "trial" : u.plan }).where(eq(users.id, uid));
  } else if (action === "role") {
    if (u.role === "owner") return NextResponse.json({ error: "O dono não pode ser rebaixado." }, { status: 400 });
    await db.update(users).set({ role: u.role === "admin" ? "user" : "admin" }).where(eq(users.id, uid));
  } else if (action === "delete") {
    if (u.role === "owner") return NextResponse.json({ error: "O dono não pode ser excluído." }, { status: 400 });
    // Limpeza de TODAS as tabelas dependentes, agora em transação.
    try {
      await deleteUserCascade(uid);
    } catch (e: any) {
      return NextResponse.json(
        { error: "Falha ao excluir; nenhuma alteração foi aplicada.", detail: e?.message },
        { status: 500 },
      );
    }
  } else {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
