/**
 * Autorização única para rotas chamadas por cron (Vercel Cron ou curl).
 *
 * FONTE ÚNICA DE VERDADE: `process.env.CRON_SECRET`. Um só nome, em todas as
 * rotas. Antes cada rota tinha um segundo nome de variável (PUSH_CRON_SECRET,
 * HUB_SYNC_SECRET, LIVE_CRON_SECRET) usado como alternativa, e isso criou um
 * modo de falha silencioso: com a env principal ausente no runtime, a rota
 * procurava um nome que ninguém tinha configurado e respondia 503 "nenhum
 * segredo configurado" mesmo com CRON_SECRET configurada no painel. Um nome só
 * elimina a dúvida "qual variável falta?".
 *
 * Formas de autorizar (as duas comparam com o MESMO CRON_SECRET):
 *  1. Vercel Cron → `Authorization: Bearer $CRON_SECRET` (a Vercel envia este
 *     header automaticamente quando a env CRON_SECRET existe).
 *  2. Manual (curl / cron-job.org) → header `x-cron-secret: <CRON_SECRET>` ou
 *     `?secret=<CRON_SECRET>`.
 *
 * Falha fechada: sem CRON_SECRET configurada, retorna null e a rota responde
 * 503 em vez de ficar aberta.
 */
import type { NextRequest } from "next/server";

/** Nome da variável de ambiente — o único aceito. */
export const ENV_CRON_SECRET = "CRON_SECRET";

/** Mensagem padrão de 503 (falha fechada) com a instrução de conserto. */
export const MSG_SEM_SEGREDO =
  "nenhum segredo configurado: defina CRON_SECRET nas envs da Vercel (escopo Production) e faça Redeploy.";

/** Comparação em tempo constante (não vaza prefixo por diferença de tempo). */
export function iguaisSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type MotivoCron = "cron" | "segredo";

/** Segredo configurado, lido de um único lugar. */
function segredoConfigurado(): string {
  return (process.env.CRON_SECRET ?? "").trim();
}

/**
 * Retorna o motivo da autorização, ou null se não autorizado.
 *
 * Repare que NÃO existe mais segundo argumento: rotas que passavam
 * "PUSH_CRON_SECRET" / "HUB_SYNC_SECRET" não têm mais como divergir.
 */
export function motivoCronAutorizado(req: NextRequest): MotivoCron | null {
  const segredo = segredoConfigurado();
  if (!segredo) return null;

  // 1) Vercel Cron (Authorization: Bearer CRON_SECRET)
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ") && iguaisSeguro(auth.slice(7).trim(), segredo)) return "cron";

  // 2) Manual (header x-cron-secret ou ?secret=), mesmo CRON_SECRET
  const enviado = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "";
  if (enviado && iguaisSeguro(enviado.trim(), segredo)) return "segredo";

  return null;
}

/** true quando CRON_SECRET existe (para diferenciar 503 de 401). */
export function cronConfigurado(): boolean {
  return Boolean(segredoConfigurado());
}

/**
 * Resposta padrão de bloqueio, para as rotas não repetirem a lógica:
 * 503 quando não há segredo configurado, 401 quando há e o pedido não provou.
 */
export function respostaNaoAutorizado() {
  return {
    body: { error: cronConfigurado() ? "não autorizado." : MSG_SEM_SEGREDO },
    status: cronConfigurado() ? 401 : 503,
  } as const;
}
