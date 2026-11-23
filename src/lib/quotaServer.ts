/**
 * Quota diária no servidor — leitura e consumo atômico.
 *
 * Por que não `middleware.ts`: no Next o middleware roda no Edge e não fala
 * Postgres (o driver `pg` não existe lá). Fazer uma chamada de rede por
 * requisição só para contar quota seria pior que o problema. Então o "guarda"
 * é esta camada, chamada pelos route handlers que entregam análise — hoje
 * `/api/quota` (contador) e a página de detalhe da partida (consumo).
 *
 * Regra: **o consumo é do servidor**. O cliente só pede; quem decide se ainda
 * há saldo é o UPDATE condicional abaixo, que é atômico — dois cliques
 * simultâneos não gastam duas quotas nem furam o limite.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { estadoQuota, hojeSp, QUOTA_POR_PLANO, planoDeQuota, type EstadoQuota } from "@/lib/quota";
import type { SessionUser } from "@/lib/auth";

export { hojeSp };

/** Estado atual, sem consumir nada. */
export async function lerQuota(user: Pick<SessionUser, "id" | "plan" | "isAdmin">): Promise<EstadoQuota> {
  const base = (extra: Partial<EstadoQuota> = {}): EstadoQuota => ({
    ...estadoQuota({ plan: user.plan, hoje: hojeSp(), ilimitada: user.isAdmin }),
    ...extra,
  });
  try {
    const [row] = await db
      .select({ d: users.dailyQuota, u: users.quotaUsed, dia: users.quotaDay })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    if (!row) return base();
    return estadoQuota({
      plan: user.plan,
      dailyQuota: row.d,
      usado: row.u,
      dia: row.dia,
      hoje: hojeSp(),
      ilimitada: user.isAdmin,
    });
  } catch {
    return base();
  }
}

export type ConsumoQuota = { liberado: boolean; estado: EstadoQuota };

/**
 * Consome 1 análise da quota de hoje.
 *
 * Um único UPDATE resolve reset de dia + limite + incremento:
 *  - o CASE zera o contador quando `quota_day` não é hoje;
 *  - o WHERE só deixa passar quem ainda tem saldo.
 * Se a linha não voltar, a quota acabou (ou o usuário não existe).
 */
export async function consumirQuota(user: Pick<SessionUser, "id" | "plan" | "isAdmin">): Promise<ConsumoQuota> {
  const hoje = hojeSp();
  if (user.isAdmin) {
    return { liberado: true, estado: estadoQuota({ plan: user.plan, hoje, ilimitada: true }) };
  }
  const limite = QUOTA_POR_PLANO[planoDeQuota(user.plan)];
  const usadoHoje = sql`(case when ${users.quotaDay} = ${hoje} then ${users.quotaUsed} else 0 end)`;
  try {
    const [row] = await db
      .update(users)
      .set({
        quotaUsed: sql`${usadoHoje} + 1`,
        quotaDay: hoje,
        dailyQuota: limite,
      })
      .where(and(eq(users.id, user.id), sql`${usadoHoje} < ${limite}`))
      .returning({ usado: users.quotaUsed });
    if (row) {
      return {
        liberado: true,
        estado: estadoQuota({ plan: user.plan, dailyQuota: limite, usado: row.usado, dia: hoje, hoje }),
      };
    }
    // Sem linha: ou o limite estourou, ou o usuário não existe. Relê para
    // devolver o número real em vez de um "0" enganoso.
    return { liberado: false, estado: await lerQuota(user) };
  } catch {
    // Banco fora do ar não pode virar paywall: libera e deixa o gate de VIP
    // (`access.active`) decidir, como antes.
    return { liberado: true, estado: estadoQuota({ plan: user.plan, hoje }) };
  }
}
