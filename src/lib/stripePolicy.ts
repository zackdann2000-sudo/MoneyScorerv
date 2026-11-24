/**
 * Política de acesso por evento do Stripe — módulo PURO (sem rede, sem banco).
 *
 * Existe por um motivo específico: a regra "falha de pagamento NÃO revoga acesso"
 * é inegociável e não pode depender de alguém lembrar dela ao editar um `switch`
 * de 200 linhas numa rota com I/O. Aqui a decisão é uma função de dados → ação,
 * coberta por teste (`stripePolicy.test.cjs`).
 *
 * A rota `/api/webhooks/stripe` só executa o que esta função decide.
 */

/** Concede dias de VIP. `origem` vai para o log/telemetria de `concederVip`. */
export type AcaoConceder = { tipo: "conceder"; origem: "checkout" | "renovação" };
/** Retira o acesso. Só duas situações chegam aqui (cancelamento e reembolso). */
export type AcaoRevogar = { tipo: "revogar"; origem: "cancelamento" | "reembolso" };
/** Não mexe no acesso. `motivo` é logado, não mostrado ao usuário. */
export type AcaoIgnorar = { tipo: "ignorar"; motivo: string };

export type AcaoStripe = AcaoConceder | AcaoRevogar | AcaoIgnorar;

/**
 * Tipos de evento que NUNCA podem revogar acesso.
 *
 * Falha de pagamento é temporária: o Stripe faz novas tentativas (Smart Retries)
 * e o cliente pode trocar o cartão no Portal. Revogar na primeira recusa puniria
 * um cartão que expirou e foi substituído no dia seguinte. O acesso só cai
 * quando o Stripe desiste e emite `customer.subscription.deleted`, ou em
 * reembolso. Este array é verificado por teste — se alguém adicionar um `case`
 * de revogação para qualquer um destes, o teste quebra.
 */
export const TIPOS_QUE_NUNCA_REVOGAM = [
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.upcoming",
  "invoice.finalization_failed",
  "charge.failed",
  "payment_intent.payment_failed",
  "customer.subscription.past_due",
  "customer.subscription.unpaid",
  "customer.subscription.updated",
  "customer.subscription.paused",
] as const;

/** Estados de pagamento que autorizam liberar acesso no checkout. */
const STATUS_PAGO = ["paid", "no_payment_required"];

export type EventoResumido = {
  /** `event.type` do Stripe. */
  type: string;
  /** `checkout.session.payment_status` (só para checkout.session.completed). */
  paymentStatus?: string | null;
  /** `invoice.billing_reason` (só para invoice.paid). */
  billingReason?: string | null;
};

/**
 * Decide o que fazer com um evento.
 *
 * Regras:
 *  - `checkout.session.completed` libera **somente** se o pagamento está pago;
 *  - `invoice.paid` renova, exceto a fatura de criação da assinatura (já
 *    tratada no checkout — processar as duas somaria os dias duas vezes);
 *  - `customer.subscription.deleted` revoga (cancelou);
 *  - `charge.refunded` revoga (devolveram o dinheiro);
 *  - todo o resto — inclusive qualquer falha de pagamento — ignora.
 */
export function decidirAcao(evento: EventoResumido): AcaoStripe {
  const tipo = String(evento.type || "");

  switch (tipo) {
    case "checkout.session.completed": {
      const status = String(evento.paymentStatus || "");
      if (!STATUS_PAGO.includes(status)) {
        return { tipo: "ignorar", motivo: `sessão não paga (${status || "sem status"})` };
      }
      return { tipo: "conceder", origem: "checkout" };
    }

    case "invoice.paid": {
      if (evento.billingReason === "subscription_create") {
        return { tipo: "ignorar", motivo: "fatura de criação da assinatura; já tratada no checkout" };
      }
      return { tipo: "conceder", origem: "renovação" };
    }

    case "invoice.payment_failed":
      return {
        tipo: "ignorar",
        motivo: "falha de pagamento: acesso mantido (Stripe Smart Retries ainda vão tentar)",
      };

    case "customer.subscription.deleted":
      return { tipo: "revogar", origem: "cancelamento" };

    case "charge.refunded":
      return { tipo: "revogar", origem: "reembolso" };

    default:
      return { tipo: "ignorar", motivo: "evento não mapeado" };
  }
}

/** Atalho de leitura para testes e logs: este evento pode tirar acesso? */
export function podeRevogar(tipo: string): boolean {
  return decidirAcao({ type: tipo }).tipo === "revogar";
}
