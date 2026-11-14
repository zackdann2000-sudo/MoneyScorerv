import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  users, sessions, favorites, alertPrefs, pushSubs, tipComments, visits, tickets, consents,
} from "@/db/schema";
import { eq } from "drizzle-orm";

import { isLifetime, isOwnerEmail, TRIAL_DAYS } from "@/lib/appConfig";

export const OWNER_EMAIL = "admin@greenscore.app";
export { TRIAL_DAYS };
export const COOKIE = "gs_session";

export function hashPass(pass: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(pass, salt, 64).toString("hex");
}
export function verifyPass(pass: string, stored: string) {
  try {
    const [salt, hash] = stored.split(":");
    const test = scryptSync(pass, salt, 64);
    return timingSafeEqual(test, Buffer.from(hash, "hex"));
  } catch { return false; }
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 864e5);
  await db.insert(sessions).values({ token, userId, expiresAt });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    // o cookie de sessão só pode trafegar por HTTPS em produção
    secure: process.env.NODE_ENV === "production",
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) { try { await db.delete(sessions).where(eq(sessions.token, token)); } catch {} }
  jar.set(COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export type SessionUser = {
  id: number; name: string; email: string; role: string; plan: string;
  expiresAt: string | null; isAdmin: boolean; access: { active: boolean; daysLeft: number; label: string };
};

export async function getUser(): Promise<SessionUser | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (!token) return null;
    const rows = await db.select({ u: users, s: sessions }).from(sessions).innerJoin(users, eq(sessions.userId, users.id)).where(eq(sessions.token, token)).limit(1);
    const row = rows[0];
    if (!row || row.s.expiresAt < new Date()) return null;
    const u = row.u;
    const owner = isOwnerEmail(u.email) || u.role === "owner";
    const isAdmin = owner || u.role === "admin";
    const lifetime = isLifetime(u.expiresAt) || owner;
    const active = isAdmin || lifetime || ((u.plan === "vip" || u.plan === "trial") && !!u.expiresAt && u.expiresAt > new Date());
    const daysLeft = u.expiresAt ? Math.max(0, Math.ceil((u.expiresAt.getTime() - Date.now()) / 864e5)) : 0;
    const label = isAdmin ? "Administrador vitalício" : active ? `Acesso · ${daysLeft} dia${daysLeft === 1 ? "" : "s"}` : "Acesso encerrado";
    return { id: u.id, name: u.name, email: u.email, role: u.role, plan: u.plan, expiresAt: u.expiresAt ? u.expiresAt.toISOString() : null, isAdmin, access: { active, daysLeft, label } };
  } catch { return null; }
}

export async function requireAdmin() {
  const u = await getUser();
  return u && u.isAdmin ? u : null;
}

/**
 * Exclusão de usuário com limpeza de TODAS as tabelas dependentes.
 *
 * Fonte única de verdade, usada tanto pelo fluxo LGPD do próprio usuário
 * (/api/conta) quanto pela exclusão feita no painel admin (/api/admin/users).
 * Antes desta função os dois caminhos limpavam listas diferentes — o admin
 * deixava órfãos em 7 tabelas e o usuário deixava em `tickets` e `consents`.
 *
 * As FKs com ON DELETE CASCADE em schema.ts já fazem isso no banco; esta
 * função mantém o comportamento correto mesmo em bancos ainda não migrados.
 * `deletionRequests` NÃO é apagada: é registro legal (FK com SET NULL).
 *
 * Retorna a contagem por tabela para auditoria/log.
 */
export async function deleteUserCascade(userId: number): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  // Ordem: filhos antes do pai. Cada delete é isolado para que uma tabela
  // ausente/legada não interrompa a limpeza das demais.
  const steps: [string, () => Promise<unknown>][] = [
    ["sessions", () => db.delete(sessions).where(eq(sessions.userId, userId))],
    ["favorites", () => db.delete(favorites).where(eq(favorites.userId, userId))],
    ["alertPrefs", () => db.delete(alertPrefs).where(eq(alertPrefs.userId, userId))],
    ["pushSubs", () => db.delete(pushSubs).where(eq(pushSubs.userId, userId))],
    ["tipComments", () => db.delete(tipComments).where(eq(tipComments.userId, userId))],
    ["visits", () => db.delete(visits).where(eq(visits.userId, userId))],
    ["tickets", () => db.delete(tickets).where(eq(tickets.userId, userId))],
    ["consents", () => db.delete(consents).where(eq(consents.userId, userId))],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
      deleted[name] = 1;
    } catch {
      deleted[name] = 0; // tabela ausente em banco antigo: segue adiante
    }
  }
  await db.delete(users).where(eq(users.id, userId));
  deleted["users"] = 1;
  return deleted;
}