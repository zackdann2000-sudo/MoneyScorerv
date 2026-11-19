/**
 * Alertas de VALOR por push (VIP).
 *
 * Varre as oportunidades do dia (motor Poisson × odds), filtra as que têm
 * EV acima do limite (padrão 15%), deduplica pelo log e dispara FCM para os
 * aparelhos de usuários VIP/trial.
 *
 * Estrutura pronta: sem Service Worker. Quando o app existir, os tokens chegam
 * em `POST /api/push/fcm-token`.
 */
import { db } from "@/db";
import { fcmTokens, users, valueAlertLog } from "@/db/schema";
import { eq, inArray, and, gt } from "drizzle-orm";
import { analisarOportunidades, type OportunidadeValor } from "./opportunitiesEngine";
import { sendFcmToTokens, FCM_ENABLED } from "./fcm";

export const EV_ALERTA_MIN = 15;
/** Janela de dedupe: não repete o mesmo alerta dentro de 24h. */
const DEDUPE_HORAS = 24;

export type AlertaValorOpts = {
  date?: string;
  minEv?: number;
  maxXgApi?: number;
  maxMatches?: number;
  /** Se true, calcula tudo e devolve o que SERIA enviado, sem chamar a FCM. */
  dryRun?: boolean;
  /** Limite de alertas por execução (evita rajada). */
  limite?: number;
};

export type ResumoAlertas = {
  geradoEm: string;
  dryRun: boolean;
  fcmConfigurado: boolean;
  analisados: number;
  elegiveis: OportunidadeValor[];
  novos: OportunidadeValor[];
  tokens: number;
  enviados: number;
  falhas: number;
  invalidosRemovidos: number;
  erro?: string;
};

function rotuloCurto(o: OportunidadeValor): string {
  return `${o.home.name} × ${o.away.name}`;
}

function mensagem(o: OportunidadeValor) {
  return {
    title: `🔥 Valor ${o.evPct >= 0 ? "+" : ""}${o.evPct.toFixed(0)}% · ${o.rotulo}`,
    body: `${rotuloCurto(o)} — modelo ${Math.round(o.probModelo * 100)}% · odd ${o.odd.toFixed(2)} · stake ${(o.stake * 100).toFixed(1)}%`,
    data: {
      matchId: o.matchId,
      mercado: o.mercado,
      ev: String(o.evPct),
      odd: String(o.odd),
      rotulo: o.rotulo,
    },
  };
}

/**
 * Executa a varredura e o disparo. Nunca lança por causa da FCM: devolve o
 * resultado no `ResumoAlertas` (falha de envio não derruba o cron).
 */
export async function dispararAlertasValor(opts: AlertaValorOpts = {}): Promise<ResumoAlertas> {
  const minEv = opts.minEv ?? EV_ALERTA_MIN;
  const limite = opts.limite ?? 5;
  const dryRun = opts.dryRun ?? false;

  const base: ResumoAlertas = {
    geradoEm: new Date().toISOString(),
    dryRun,
    fcmConfigurado: FCM_ENABLED,
    analisados: 0,
    elegiveis: [],
    novos: [],
    tokens: 0,
    enviados: 0,
    falhas: 0,
    invalidosRemovidos: 0,
  };

  // 1) oportunidades do dia
  const r = await analisarOportunidades({
    date: opts.date,
    maxMatches: opts.maxMatches ?? 8,
    maxXgApi: opts.maxXgApi ?? 6,
  });
  base.analisados = r.analisados.length;

  // 2) filtra EV acima do limite
  base.elegiveis = r.oportunidades
    .filter((o) => o.evPct >= minEv)
    .sort((a, b) => b.evPct - a.evPct);
  if (!base.elegiveis.length) return base;

  // 3) dedupe pelo log (24h)
  const chaves = base.elegiveis.map((o) => o.chave);
  const desde = new Date(Date.now() - DEDUPE_HORAS * 3600 * 1000);
  let jaEnviadas = new Set<string>();
  try {
    const rows = await db
      .select({ chave: valueAlertLog.chave })
      .from(valueAlertLog)
      .where(and(inArray(valueAlertLog.chave, chaves), gt(valueAlertLog.sentAt, desde)));
    jaEnviadas = new Set(rows.map((x) => x.chave));
  } catch {
    /* sem tabela/log → segue sem dedupe (primeira execução) */
  }
  base.novos = base.elegiveis.filter((o) => !jaEnviadas.has(o.chave)).slice(0, limite);
  if (!base.novos.length) return base;

  // 4) tokens de usuários VIP/trial
  let tokens: string[] = [];
  try {
    const rows = await db
      .select({ token: fcmTokens.token, plan: users.plan })
      .from(fcmTokens)
      .innerJoin(users, eq(fcmTokens.userId, users.id))
      .where(inArray(users.plan, ["vip", "trial"]));
    tokens = rows.map((x) => x.token);
  } catch {
    return { ...base, erro: "Falha ao ler tokens FCM." };
  }
  base.tokens = tokens.length;

  if (dryRun) return base;
  if (!tokens.length) return { ...base, erro: "Nenhum token FCM de usuário VIP/trial." };

  // 5) envia (uma mensagem por oportunidade; para todos os aparelhos VIP)
  for (const o of base.novos) {
    try {
      const res = await sendFcmToTokens(tokens, mensagem(o));
      base.enviados += res.enviados;
      base.falhas += res.falhas;
      if (res.invalidos.length) {
        try {
          await db.delete(fcmTokens).where(inArray(fcmTokens.token, res.invalidos));
          base.invalidosRemovidos += res.invalidos.length;
        } catch {
          /* limpeza best-effort */
        }
      }
    } catch (e: any) {
      base.erro = String(e?.message || e).slice(0, 200);
      break;
    }
  }

  // 6) registra no log só o que teve envio bem-sucedido
  if (base.enviados > 0) {
    try {
      await db
        .insert(valueAlertLog)
        .values(base.novos.map((o) => ({ chave: o.chave, matchId: o.matchId, mercado: o.mercado, evPct: o.evPct })))
        .onConflictDoUpdate({
          target: valueAlertLog.chave,
          set: { sentAt: new Date() },
        });
    } catch {
      /* log é melhor-esforço */
    }
  }

  return base;
}