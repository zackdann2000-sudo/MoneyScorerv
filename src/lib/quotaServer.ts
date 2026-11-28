/**
 * Quota diária no servidor — leitura e consumo atômico.
 *
 * Por que não `middleware.ts`: no Next o middleware roda no Edge e não fala
 * Postgres (o driver `pg` não existe lá). Fazer uma chamada de rede por
 * requisição só para contar quota seria pior que o problema. Então o "guarda"
 * é esta camada, chamada pelos route handlers que entregam análise:
 * `/api/quota` (leitura/contador legado) e `/api/matches/[id]/analysis`
 * (consumo por partida, o caminho real).
 *
 * Regra: **o consumo é do servidor**. O cliente nunca decide se ainda há saldo —
 * o UPDATE condicional abaixo é atômico (dois cliques simultâneos não gastam
 * duas quotas nem furam o limite) e o débito só acontece depois que a análise
 * foi calculada com sucesso.
 *
 * IDEMPOTÊNCIA POR PARTIDA: `consumirAnaliseDePartida` quita a partida na
 * tabela `analyses_opened` (índice único user+match+dia). Reabrir a MESMA
 * análise no mesmo dia não debita de novo; abrir outra, sim.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, analysesOpened } from "@/db/schema";
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

export type ConsumoAnalise = {
  /** true = pode ver a análise (cobrada agora ou já cobrada hoje nesta partida). */
  liberado: boolean;
  /** true = já estava quitada hoje; nenhuma cota nova foi debitada. */
  jaContabilizada: boolean;
  estado: EstadoQuota;
};

/**
 * Consome 1 análise para UMA partida específica — o caminho do freemium.
 *
 * Ordem (importa):
 *  1. quita a partida em `analyses_opened` com INSERT ... ON CONFLICT DO NOTHING;
 *  2. se a linha já existia, a análise de hoje é a MESMA: libera sem debitar;
 *  3. se a linha é nova, debita a cota (`consumirQuota`);
 *  4. se a cota estourou, REMOVE a quitação — senão a partida ficaria marcada
 *     como paga sem ter sido paga, e a próxima tentativa abriria de graça.
 *
 * Falha da tabela (banco sem a migração) NÃO libera de graça: cai no
 * `consumirQuota` puro, que debita sempre. Preferimos cobrar a mais numa
 * instalação sem migração do que abrir o paywall inteiro.
 */
export async function consumirAnaliseDePartida(
  user: Pick<SessionUser, "id" | "plan" | "isAdmin">,
  matchId: string,
): Promise<ConsumoAnalise> {
  const hoje = hojeSp();
  const id = String(matchId || "").trim();

  if (user.isAdmin) {
    return {
      liberado: true,
      jaContabilizada: true,
      estado: estadoQuota({ plan: user.plan, hoje, ilimitada: true }),
    };
  }

  if (!id) {
    const r = await consumirQuota(user);
    return { ...r, jaContabilizada: false };
  }

  let linhaNova = false;
  try {
    const inseridas = await db
      .insert(analysesOpened)
      .values({ userId: user.id, matchId: id, dia: hoje })
      .onConflictDoNothing({ target: [analysesOpened.userId, analysesOpened.matchId, analysesOpened.dia] })
      .returning({ id: analysesOpened.id });
    linhaNova = inseridas.length > 0;
  } catch {
    /* Tabela ausente (migração não rodada) ou banco instável: debita sem
       quitação, nunca libera de graça. */
    const r = await consumirQuota(user);
    return { ...r, jaContabilizada: false };
  }

  if (!linhaNova) {
    // Já quitada hoje nesta partida: reabrir é livre.
    return { liberado: true, jaContabilizada: true, estado: await lerQuota(user) };
  }

  const r = await consumirQuota(user);
  if (!r.liberado) {
    // Não debitou: desfaz a quitação para não marcar como paga uma análise que
    // o usuário não recebeu.
    try {
      await db
        .delete(analysesOpened)
        .where(
          and(
            eq(analysesOpened.userId, user.id),
            eq(analysesOpened.matchId, id),
            eq(analysesOpened.dia, hoje),
          ),
        );
    } catch {
      /* melhor deixar a linha do que derrubar a resposta de paywall */
    }
    return { ...r, jaContabilizada: false };
  }

  return { ...r, jaContabilizada: false };
}

/**
 * IDs das partidas já quitadas hoje por este usuário.
 *
 * Serve à UI (interceptação de clique em `/jogos/<id>`): reabrir uma partida já
 * paga não deve mostrar o aviso de limite. É leitura pura — quem decide de
 * verdade continua sendo `consumirAnaliseDePartida`.
 */
export async function partidasContadasHoje(userId: number): Promise<string[]> {
  try {
    const rows = await db
      .select({ matchId: analysesOpened.matchId })
      .from(analysesOpened)
      .where(and(eq(analysesOpened.userId, userId), eq(analysesOpened.dia, hojeSp())))
      .limit(50);
    return rows.map((r) => String(r.matchId));
  } catch {
    return [];
  }
}

/**
 * Quantas análises foram quitadas hoje neste usuário (telemetria/auditoria).
 * Não entra na decisão de acesso.
 */
export async function contagemAnalisesHoje(userId: number): Promise<number> {
  try {
    const rows = await db
      .select({ id: analysesOpened.id })
      .from(analysesOpened)
      .where(
        and(
          eq(analysesOpened.userId, userId),
          eq(analysesOpened.dia, hojeSp()),
          gte(analysesOpened.createdAt, new Date(Date.now() - 36 * 3600 * 1000)),
        ),
      );
    return rows.length;
  } catch {
    return 0;
  }
}
