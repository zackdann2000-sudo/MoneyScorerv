/**
 * Rate limiting por janela fixa, persistido no Postgres.
 *
 * Por que Postgres e não memória: em serverless (Vercel) cada instância tem seu
 * próprio `Map`, então um contador em memória é trivialmente contornado por
 * round-robin entre lambdas. A tabela `rate_limits` compartilha o contador.
 *
 * Política: FAIL-OPEN. Se o banco falhar, a requisição passa. O raciocínio é
 * que rate limiting é uma defesa secundária: indisponibilidade do contador não
 * deve derrubar o login de todo mundo. O trade-off é explícito — durante uma
 * falha do Postgres, o limite não é aplicado. Isso é registrado em log.
 *
 * A contabilização é atômica (um único INSERT ... ON CONFLICT DO UPDATE com
 * RETURNING), evitando a corrida clássica de ler-depois-gravar que perderia
 * incrementos sob concorrência.
 *
 * Contrato de uso:
 *   const r = await rateLimit("login", ip, { limit: 10, windowSec: 300 });
 *   if (!r.ok) return tooMany(r.retryAfterSec);
 */
import { db } from "@/db";
import { rateLimits as rateLimitsTable } from "@/db/schema";
import { sql } from "drizzle-orm";

export type RateLimitResult = {
  /** true quando a requisição está dentro do limite. */
  ok: boolean;
  /** Requisições já contabilizadas na janela atual (inclui esta). */
  hits: number;
  /** Teto configurado para a janela. */
  limit: number;
  /** Quantos segundos faltam para a janela reiniciar. */
  retryAfterSec: number;
};

export type RateLimitOptions = {
  /** Máximo de requisições por janela. */
  limit: number;
  /** Tamanho da janela em segundos. */
  windowSec: number;
};

/**
 * Contabiliza uma requisição para `scope` + `identifier`.
 *
 * A janela é fixa e alinhada ao relógio: `windowStart` é o início do bloco de
 * `windowSec` segundos que contém `now`. Quando a janela vira, o contador
 * reinicia (o UPDATE troca `window_start` e zera `hits`).
 */
export async function rateLimit(
  scope: string,
  identifier: string,
  { limit, windowSec }: RateLimitOptions,
): Promise<RateLimitResult> {
  const key = `${scope}:${identifier || "unknown"}`.slice(0, 200);
  const now = Date.now();
  const windowMs = Math.max(1, Math.floor(windowSec)) * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  // Margem de 1 janela extra: a linha sobrevive o suficiente para ser lida
  // enquanto ainda é relevante e é apagada pela limpeza abaixo.
  const expiresAt = new Date(windowStartMs + windowMs * 2);

  try {
    // Limpeza oportunista de linhas vencidas (sem job dedicado).
    await db.delete(rateLimitsTable).where(sql`${rateLimitsTable.expiresAt} < now()`);

    // Incremento atômico: cria a linha com hits=1 ou incrementa se a janela
    // for a mesma; se a janela mudou, reinicia o contador.
    const rows = await db
      .insert(rateLimitsTable)
      .values({ key, hits: 1, windowStart, expiresAt })
      .onConflictDoUpdate({
        target: rateLimitsTable.key,
        set: {
          hits: sql`CASE WHEN ${rateLimitsTable.windowStart} < ${windowStart}
                         THEN 1
                         ELSE ${rateLimitsTable.hits} + 1 END`,
          windowStart: sql`CASE WHEN ${rateLimitsTable.windowStart} < ${windowStart}
                                THEN ${windowStart}
                                ELSE ${rateLimitsTable.windowStart} END`,
          expiresAt: sql`GREATEST(${rateLimitsTable.expiresAt}, ${expiresAt})`,
        },
      })
      .returning({ hits: rateLimitsTable.hits, windowStart: rateLimitsTable.windowStart });

    const row = rows[0];
    const hits = row?.hits ?? 1;
    const startedAt = row?.windowStart ? new Date(row.windowStart).getTime() : windowStartMs;
    const resetAt = startedAt + windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetAt - now) / 1000));

    return { ok: hits <= limit, hits, limit, retryAfterSec };
  } catch (e) {
    // FAIL-OPEN — ver comentário no topo do arquivo.
    console.error("[rateLimit] falha ao contabilizar; permitindo a requisição", {
      scope, error: e instanceof Error ? e.message : String(e),
    });
    return { ok: true, hits: 0, limit, retryAfterSec: windowSec };
  }
}

/**
 * Extrai o IP do cliente respeitando `X-Forwarded-For` (Vercel/proxies).
 * Cai para `X-Real-IP` e, por último, para "unknown" — que agrupa todos os
 * clientes sem IP identificável numa única chave (fail-closed no limite).
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // O primeiro item é o cliente original; os demais são proxies.
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim().slice(0, 64);
  return "unknown";
}
