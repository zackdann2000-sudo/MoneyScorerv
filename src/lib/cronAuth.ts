/**
 * Autorização única para rotas chamadas por cron (Vercel Cron ou curl).
 *
 * Mesmo esquema em todas as rotas internas:
 *  1. Vercel Cron → `Authorization: Bearer $CRON_SECRET` (enviado
 *     automaticamente pela Vercel quando a env CRON_SECRET existe).
 *  2. Manual → header `x-cron-secret: <SEGREDO_DA_ROTA>` ou `?secret=`.
 *
 * Falha fechada: sem nenhum segredo configurado, retorna null e a rota
 * responde 503 em vez de ficar aberta.
 */
import type { NextRequest } from "next/server";

/** Comparação em tempo constante (não vaza prefixo por diferença de tempo). */
export function iguaisSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export type MotivoCron = "cron" | "segredo";

/**
 * Retorna o motivo da autorização, ou null se não autorizado.
 * `envSegredo` é o nome da variável com o segredo manual da rota
 * (ex.: "PUSH_CRON_SECRET").
 */
export function motivoCronAutorizado(req: NextRequest, envSegredo: string): MotivoCron | null {
  // 1) Vercel Cron (Authorization: Bearer CRON_SECRET)
  const cronSecret = process.env.CRON_SECRET || "";
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth.startsWith("Bearer ") && iguaisSeguro(auth.slice(7), cronSecret)) return "cron";
  }

  // 2) Segredo manual da rota (header x-cron-secret ou ?secret=)
  const segredo = process.env[envSegredo] || "";
  if (!segredo) return null;
  const enviado = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "";
  if (enviado && iguaisSeguro(enviado, segredo)) return "segredo";

  return null;
}

/** true quando existe algum segredo configurado (para diferenciar 503 de 401). */
export function cronConfigurado(envSegredo: string): boolean {
  return Boolean(process.env.CRON_SECRET || process.env[envSegredo]);
}