import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  users, sessions, favorites, alertPrefs, pushSubs, tipComments, visits, tickets, consents,
} from "@/db/schema";
import { eq } from "drizzle-orm";

import { isLifetime, isOwnerEmail, TRIAL_DAYS } from "@/lib/appConfig";
import { estadoQuota, hojeSp } from "@/lib/quota";

export const OWNER_EMAIL = "admin@greenscore.app";
export { TRIAL_DAYS };
export const COOKIE = "gs_session";

/**
 * Tipo do handle transacional do Drizzle. Usado para tipar os passos de
 * `deleteUserCascade` sem recorrer a `any`.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  /** Fim do acesso (trial de 24h, assinatura ou vitalício). */
  expiresAt: string | null;
  /**
   * Alias de `expiresAt` com o nome do modelo de negócio (trial de 1 dia).
   * Existe só para a UI: "VIP enquanto `trialEndsAt > now()`" lê direto.
   * NÃO é uma segunda coluna — duas fontes de verdade para a mesma data é
   * como o acesso começa a divergir entre servidor e cliente.
   */
  trialEndsAt: string | null;
  isAdmin: boolean; access: { active: boolean; daysLeft: number; label: string };
  /** Quota diária (Free 1 / Starter 6 / Pro 20 / Expert ilimitado). */
  quota: { plano: string; limite: number; usado: number; restante: number; esgotada: boolean; ilimitada: boolean };
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
    /* QUOTA: lida em SELECT separado e protegido. Se a migração 0010 ainda não
       rodou em algum ambiente, o login continua funcionando e a pessoa cai no
       Free (1/dia) em vez de ser deslogada por coluna inexistente. */
    let qd: number | null = null;
    let qu: number | null = null;
    let qdia: string | null = null;
    try {
      const [r] = await db
        .select({ d: users.dailyQuota, u: users.quotaUsed, dia: users.quotaDay })
        .from(users)
        .where(eq(users.id, u.id))
        .limit(1);
      qd = r?.d ?? null; qu = r?.u ?? null; qdia = r?.dia ?? null;
    } catch {}
    const q = estadoQuota({
      plan: u.plan, dailyQuota: qd, usado: qu, dia: qdia, hoje: hojeSp(),
      ilimitada: isAdmin || active,
    });
    return {
      id: u.id, name: u.name, email: u.email, role: u.role, plan: u.plan,
      expiresAt: u.expiresAt ? u.expiresAt.toISOString() : null,
      trialEndsAt: u.expiresAt ? u.expiresAt.toISOString() : null,
      isAdmin, access: { active, daysLeft, label },
      quota: { plano: q.plano, limite: q.limite, usado: q.usado, restante: q.restante, esgotada: q.esgotada, ilimitada: q.ilimitada },
    };
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
 * `deletion_requests` NÃO é apagada: é registro legal (FK com SET NULL).
 *
 * ATOMICIDADE: tudo roda dentro de uma transação. Se qualquer passo falhar,
 * nada é confirmado — antes, uma falha no `delete(users)` final deixava o
 * usuário com conta viva e sessões/favoritos já apagados (estado inconsistente).
 *
 * Retorna a contagem REAL de linhas afetadas por tabela, para auditoria/log.
 * Uma tabela ausente em banco antigo aparece como 0 e não interrompe as demais
 * (dentro de uma transação no Postgres, um erro abortaria o bloco inteiro).
 */
export async function deleteUserCascade(userId: number): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  try {
    await db.transaction(async (tx) => {
      // Ordem: filhos antes do pai.
      const steps: [string, (t: Tx) => Promise<{ rowCount: number | null }>][] = [
        ["sessions", (t) => t.delete(sessions).where(eq(sessions.userId, userId))],
        ["favorites", (t) => t.delete(favorites).where(eq(favorites.userId, userId))],
        ["alertPrefs", (t) => t.delete(alertPrefs).where(eq(alertPrefs.userId, userId))],
        ["pushSubs", (t) => t.delete(pushSubs).where(eq(pushSubs.userId, userId))],
        ["tipComments", (t) => t.delete(tipComments).where(eq(tipComments.userId, userId))],
        ["visits", (t) => t.delete(visits).where(eq(visits.userId, userId))],
        ["tickets", (t) => t.delete(tickets).where(eq(tickets.userId, userId))],
        ["consents", (t) => t.delete(consents).where(eq(consents.userId, userId))],
      ];

      for (const [name, run] of steps) {
        // Savepoint: uma tabela ausente em banco não migrado não aborta a
        // transação inteira; o rollback volta até o savepoint e seguimos.
        try {
          await tx.transaction(async (sp) => {
            const res = await run(sp as unknown as Tx);
            deleted[name] = res?.rowCount ?? 0;
          });
        } catch {
          deleted[name] = 0;
        }
      }

      const parent = await tx.delete(users).where(eq(users.id, userId));
      deleted["users"] = parent.rowCount ?? 0;
    });
  } catch (e) {
    // Rollback já aconteceu: relatamos o erro em vez de fingir sucesso.
    console.error("[deleteUserCascade] falhou; transação revertida", {
      userId, error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }

  return deleted;
}