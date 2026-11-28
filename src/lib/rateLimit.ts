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
 *
 * LIMPEZA: esta função NÃO apaga linhas vencidas. Antes ela fazia um
 * `db.delete(... where expires_at < now())` a cada chamada — ou seja, um DELETE
 * dentro do caminho crítico de login/cadastro/rotas caras, que existe para ser
 * rápido. A poda agora é de `limparRateLimitsExpirados()`, chamada pelo cron
 * diário (/api/cron/diario). Ler uma linha vencida não atrapalha: a janela é
 * recalculada e o contador reinicia na mesma instrução do INSERT.
 */
import { db } from "@/db";
import { rateLimits as rateLimitsTable } from "@/db/schema";
import { lt, sql } from "drizzle-orm";

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
 * Extrai o IP do cliente dos headers de PROXY.
 *
 * Ordem de confiança (importa — o X-Forwarded-For é escrito pelo CLIENTE):
 *   1. `x-real-ip` — a Vercel grava com o IP da conexão; o cliente não escreve.
 *   2. `x-vercel-forwarded-for` — também definido pela Vercel (lista, o primeiro
 *      item é o cliente).
 *   3. `x-forwarded-for` — só como ÚLTIMO recurso, para `next dev` local, onde
 *      não existe proxy na frente. Em produção quem chega aqui é requisição
 *      forjada: confiar nele zerava o limite por IP (força bruta de login,
 *      farm de trial de 24h) trocando um header.
 *   4. Sem nada → "unknown" (agrupa todo mundo numa chave só, fail-closed).
 *
 * O valor é validado como IP (v4 ou v6). Header forjado com texto qualquer vira
 * "unknown" em vez de virar chave nova: sem isso, cada requisição com um header
 * inventado criava uma linha diferente em `rate_limits` — o limite nunca fechava
 * e a tabela crescia sem barreira.
 */
export function clientIp(req: Request): string {
  const seguro = req.headers.get("x-real-ip") || req.headers.get("x-vercel-forwarded-for");
  const bruto = seguro || req.headers.get("x-forwarded-for") || "";
  // Lista de proxies: o primeiro item é o cliente original.
  const primeiro = bruto.split(",")[0]?.trim() || "";
  if (primeiro.length > 64) return "unknown";
  return ipValido(primeiro) ? primeiro : "unknown";
}

/** IPv4 ou IPv6 em texto. Qualquer outra coisa não vira chave de rate limit. */
function ipValido(v: string): boolean {
  if (!v) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) return true;
  return v.includes(":") && /^[0-9a-fA-F:.]+$/.test(v) && v.length >= 3;
}

/**
 * Apaga as linhas de rate limit já vencidas. Roda no cron diário, NUNCA por
 * request.
 *
 * Devolve quantas linhas saíram. Uma falha aqui não pode derrubar nada: quem
 * chama decide o que fazer (o cron só registra em `limpeza`).
 */
export async function limparRateLimitsExpirados(): Promise<{ ok: boolean; removidas: number }> {
  try {
    const r = await db.delete(rateLimitsTable).where(lt(rateLimitsTable.expiresAt, sql`now()`));
    return { ok: true, removidas: r.rowCount ?? 0 };
  } catch (e) {
    console.error("[rateLimit] falha na limpeza de linhas vencidas", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, removidas: 0 };
  }
}
