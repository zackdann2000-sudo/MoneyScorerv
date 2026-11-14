import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, visits, sessions } from "@/db/schema";
import { eq, gte, count } from "drizzle-orm";
import { requireAdmin, deleteUserCascade } from "@/lib/auth";
import { int, oneOf } from "@/lib/validate";

const PATCH_ACTIONS = ["vip", "expire", "role", "delete"] as const;

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Acesso restrito ao administrador." }, { status: 403 });
  const rows = await db.select().from(users);
  const now = new Date();
  const list = rows.map((u) => {
    const isAdmin = u.role === "admin" || u.role === "owner";
    const active = isAdmin || ((u.plan === "vip" || u.plan === "trial") && !!u.expiresAt && u.expiresAt > now);
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, plan: u.plan,
      expiresAt: u.expiresAt?.toISOString() || null, createdAt: u.createdAt.toISOString(), lastSeenAt: u.lastSeenAt?.toISOString() || null,
      active, online: !!u.lastSeenAt && now.getTime() - u.lastSeenAt.getTime() < 15 * 60000,
      daysLeft: u.expiresAt ? Math.max(0, Math.ceil((u.expiresAt.getTime() - now.getTime()) / 864e5)) : 0,
      lifetime: !!u.expiresAt && u.expiresAt.getFullYear() >= 2090,
    };
  }).sort((a, b) => (b.lastSeenAt || "").localeCompare(a.lastSeenAt || ""));
  const dayAgo = new Date(Date.now() - 864e5);
  const [{ c: visitCount }] = await db.select({ c: count() }).from(visits).where(gte(visits.createdAt, dayAgo));
  const [{ c: sessCount }] = await db.select({ c: count() }).from(sessions).where(gte(sessions.expiresAt, now));
  return NextResponse.json({
    users: list,
    stats: {
      total: list.length, ativos: list.filter((u) => u.active).length,
      expirados: list.filter((u) => !u.active).length, online: list.filter((u) => u.online).length,
      visits24h: visitCount, sessions: sessCount,
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
    // Limpeza de TODAS as tabelas dependentes (antes só sessions+users)
    await deleteUserCascade(uid);
  } else {
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}