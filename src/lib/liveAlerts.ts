/**
 * GreenScore — alertas AO VIVO por push NATIVO (FCM).
 *
 * Este módulo é a camada que separa "o que aconteceu no jogo" do "como o push
 * sai": monta o payload no formato nativo (o mesmo que o `firebase-messaging-sw.js`
 * desenha na tela de bloqueio) e entrega ao `sendFcmToTokens` do `fcm.ts`.
 *
 * Formato enviado (FCM HTTP v1):
 *   {
 *     notification: { title: "⚽ GOL!", body: "Flamengo 1x0" },
 *     webpush: { notification: { icon: "/icon-192x192.png" } }
 *   }
 *
 * Sem `notification`, a mensagem vira "data-only" e o sistema operacional NÃO
 * mostra nada com o app fechado — era exatamente o buraco que deixava o alerta
 * só dentro do navegador.
 */

// `fcm.ts` usa crypto/fetch no servidor: este módulo também é server-side.
import { sendFcmToTokens, FCM_ENABLED, ICONE_NOTIFICACAO, type MensagemPush, type ResultadoFcm } from "./fcm";

export type TipoAlertaAoVivo = "gol" | "kickoff" | "cartao" | "fim";

export type AlertaAoVivo = {
  /** "⚽ GOL!", "🟢 Bola rolando", ... */
  titulo: string;
  /** "Flamengo 1x0 Fluminense — 32'" */
  corpo: string;
  tipo: TipoAlertaAoVivo;
  /** Link relativo aberto no clique (vira `click_action`). */
  url?: string;
  /** Agrupa/colapsa no sistema operacional (ex.: o id da partida). */
  tag?: string;
  /** Dados extras que o cliente lê no clique (matchId, liga, placar...). */
  data?: Record<string, string>;
};

/** Monta o payload no formato nativo exigido pelo FCM. */
export function payloadNativo(alerta: AlertaAoVivo): MensagemPush {
  return {
    title: alerta.titulo,
    body: alerta.corpo,
    icon: ICONE_NOTIFICACAO,
    url: alerta.url,
    tag: alerta.tag,
    data: {
      ...(alerta.data || {}),
      tipo: alerta.tipo,
      ...(alerta.url ? { url: alerta.url } : {}),
    },
  };
}

/** Atalho para o alerta mais importante do app: gol. */
export function payloadGol(opts: {
  casa: string;
  fora: string;
  casaGols: number;
  foraGols: number;
  minuto?: number;
  matchId?: string;
  url?: string;
}): AlertaAoVivo {
  const placar = `${opts.casa} ${opts.casaGols}x${opts.foraGols} ${opts.fora}`;
  return {
    titulo: "⚽ GOL!",
    corpo: opts.minuto ? `${placar} — ${opts.minuto}'` : placar,
    tipo: "gol",
    tag: opts.matchId ?? "gol",
    url: opts.url ?? (opts.matchId ? `/ao-vivo?match=${opts.matchId}` : "/ao-vivo"),
    data: {
      ...(opts.matchId ? { matchId: opts.matchId } : {}),
      placar: `${opts.casaGols}x${opts.foraGols}`,
    },
  };
}

/**
 * Envia o alerta para os tokens indicados.
 * Nunca lança por falha de FCM: devolve o resultado (o cron não pode cair por
 * causa de um push).
 */
export async function enviarAlertaAoVivo(tokens: string[], alerta: AlertaAoVivo): Promise<ResultadoFcm> {
  if (!tokens.length) return { ok: true, enviados: 0, falhas: 0, invalidos: [] };
  if (!FCM_ENABLED) return { ok: false, enviados: 0, falhas: tokens.length, invalidos: [], erro: "FCM não configurado no ambiente." };
  return sendFcmToTokens(tokens, payloadNativo(alerta));
}

export { sendFcmToTokens, FCM_ENABLED };
export type { MensagemPush, ResultadoFcm };
