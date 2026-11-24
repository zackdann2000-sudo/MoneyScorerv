/**
 * Webhook do Stripe.
 *
 * POST /api/webhooks/stripe
 *
 * Trata os eventos que dão e tiram acesso:
 *   checkout.session.completed        -> pagou: concede VIP
 *   invoice.paid                      -> renovação da assinatura: estende VIP
 *   invoice.payment_failed            -> cartão recusado: NÃO revoga (só loga)
 *   customer.subscription.deleted     -> cancelou: encerra o acesso
 *   charge.refunded                   -> reembolsou: encerra o acesso
 *
 * REGRA DE REVOGAÇÃO: acesso só cai em `customer.subscription.deleted` ou
 * `charge.refunded`. Falha de pagamento é temporária — o Stripe ainda vai
 * tentar de novo (Smart Retries) antes de cancelar. Revogar na primeira
 * recusa puniria um cartão que expirou e foi trocado no dia seguinte.
 *
 * IDENTIFICAÇÃO DO USUÁRIO — dois caminhos, nesta ordem:
 *  1. metadata.userId / client_reference_id: gravados na criação do checkout.
 *     É a fonte confiável, porque o cliente não escolhe esse valor.
 *  2. E-mail: fallback para eventos antigos ou quando o metadata se perde.
 *     O Stripe devolve o e-mail como o cliente digitou, então comparamos
 *     em minúsculas.
 *
 * SEGURANÇA: a assinatura é verificada com o corpo CRU da requisição. Se você
 * parsear o JSON antes, o `constructEvent` falha — por isso usamos `req.text()`.
 */
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  getStripe,
  concederVip,
  eventoJaProcessado,
  registrarEvento,
  diasDoPrice,
} from "@/lib/stripe";
import { decidirAcao } from "@/lib/stripePolicy";

export const dynamic = "force-dynamic";
// Webhook é rápido (2 queries); 60s é folga mais que suficiente.
export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/* Localizar o usuário                                                */
/* ------------------------------------------------------------------ */

type Alvo = { email: string | null; userId: number | null };

/** Extrai id/e-mail de um objeto Stripe, cobrindo todos os formatos usados. */
function identidade(obj: Record<string, unknown>): Alvo {
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  const userIdRaw = meta.userId ?? (obj.client_reference_id as string | undefined);
  const userId = userIdRaw && /^\d+$/.test(String(userIdRaw)) ? Number(userIdRaw) : null;

  // E-mail pode vir em campos diferentes conforme o objeto.
  let email: string | null = null;
  if (typeof obj.customer_email === "string") email = obj.customer_email;
  else if (typeof obj.email === "string") email = obj.email;
  else if (typeof obj.receipt_email === "string") email = obj.receipt_email;
  else if (typeof meta.email === "string") email = meta.email;

  return { email: email ? email.trim().toLowerCase() : null, userId };
}

/** Concede VIP escolhendo por id (confiável) e caindo no e-mail. */
async function conceder(alvo: Alvo, dias: number, origem: string) {
  // 1) Por id — o caminho normal.
  if (alvo.userId) {
    const rows = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, alvo.userId))
      .limit(1);
    if (rows[0]) return await concederVip(rows[0].email, dias, origem);
  }
  // 2) Por e-mail.
  if (alvo.email) return await concederVip(alvo.email, dias, origem);

  return { ok: false as const, motivo: "evento sem userId nem e-mail" };
}

/**
 * Remove o acesso (cancelamento/reembolso).
 *
 * Usamos uma data claramente no passado (epoch), e não `new Date()`.
 * Motivo: se o relógio do servidor estiver adiantado em relação ao banco — algo
 * que acontece em ambiente local/container — `new Date()` grava um instante que
 * ainda parece futuro, e o acesso continua liberado. Epoch não tem essa
 * ambiguidade: qualquer comparação com "agora" resulta em expirado.
 */
const REVOGADO = new Date(0);

async function revogar(alvo: Alvo, origem: string) {
  if (alvo.userId) {
    await db.update(users).set({ expiresAt: REVOGADO }).where(eq(users.id, alvo.userId));
    console.log(`[stripe] acesso revogado (id ${alvo.userId}) via ${origem}`);
    return;
  }
  if (alvo.email) {
    await db
      .update(users)
      .set({ expiresAt: REVOGADO })
      .where(eq(sql`lower(${users.email})`, alvo.email));
    console.log(`[stripe] acesso revogado (${alvo.email}) via ${origem}`);
  }
}

/* ------------------------------------------------------------------ */
/* Handler                                                            */
/* ------------------------------------------------------------------ */

/** Price do evento — muda de lugar conforme o objeto do Stripe. */
function priceIdDoEvento(tipo: string, obj: Record<string, unknown>): string | undefined {
  if (tipo === "checkout.session.completed") {
    const li = (obj as { line_items?: { data?: { price?: { id?: string } }[] } }).line_items;
    return li?.data?.[0]?.price?.id;
  }
  const linhas = (obj.lines as { data?: { price?: { id?: string } }[] } | undefined)?.data ?? [];
  return linhas[0]?.price?.id;
}

export async function POST(req: NextRequest) {
  const segredo = process.env.STRIPE_WEBHOOK_SECRET;
  if (!segredo) {
    // Falha fechada: sem segredo não dá para confiar em nada que chegue aqui.
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET ausente");
    return NextResponse.json({ error: "webhook não configurado" }, { status: 503 });
  }

  const assinatura = req.headers.get("stripe-signature");
  if (!assinatura) {
    return NextResponse.json({ error: "assinatura ausente" }, { status: 400 });
  }

  // Corpo CRU: obrigatório para a verificação da assinatura.
  const corpo = await req.text();

  let evento: Stripe.Event;
  try {
    const stripe = await getStripe();
    evento = stripe.webhooks.constructEvent(corpo, assinatura, segredo);
  } catch (e) {
    // 400 aqui faz o Stripe reenviar. Se a assinatura está errada, reenviar não
    // ajuda, mas é o comportamento esperado e fica visível no painel.
    const msg = e instanceof Error ? e.message : "assinatura inválida";
    console.error("[stripe/webhook] verificação falhou:", msg);
    return NextResponse.json({ error: `assinatura inválida: ${msg}` }, { status: 400 });
  }

  // Idempotência: o Stripe reentrega; sem isso os dias somariam de novo.
  if (await eventoJaProcessado(evento.id)) {
    console.log(`[stripe/webhook] evento ${evento.id} já processado`);
    return NextResponse.json({ received: true, duplicado: true });
  }

  try {
    /* A decisão é PURA e vive em @/lib/stripePolicy (com teste próprio):
       falha de pagamento nunca revoga, só `subscription.deleted` e
       `charge.refunded` revogam. Aqui só executamos a ação decidida. */
    const obj = (evento.data.object || {}) as unknown as Record<string, unknown>;
    const acao = decidirAcao({
      type: evento.type,
      paymentStatus: typeof obj.payment_status === "string" ? obj.payment_status : null,
      billingReason: typeof obj.billing_reason === "string" ? obj.billing_reason : null,
    });

    if (acao.tipo === "ignorar") {
      if (evento.type === "invoice.payment_failed") {
        const tentativa = typeof obj.attempt_count === "number" ? obj.attempt_count : 0;
        const proxima = typeof obj.next_payment_attempt === "number"
          ? new Date(obj.next_payment_attempt * 1000).toISOString()
          : "sem nova tentativa agendada";
        console.warn(
          `[stripe/webhook] pagamento falhou (tentativa ${tentativa}); próxima: ${proxima}. Acesso mantido.`,
        );
      } else {
        console.log(`[stripe/webhook] ${evento.type} ignorado: ${acao.motivo}`);
      }
    } else if (acao.tipo === "revogar") {
      await revogar(identidade(obj), acao.origem);
    } else {
      const dias = await diasDoPrice(priceIdDoEvento(evento.type, obj));
      const r = await conceder(identidade(obj), dias, acao.origem);
      if (!r.ok) console.error(`[stripe/webhook] ${acao.origem}:`, r.motivo);
    }

    await registrarEvento(evento.id, evento.type);
    return NextResponse.json({ received: true, tipo: evento.type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error(`[stripe/webhook] falha em ${evento.type}:`, msg);
    // 500 faz o Stripe reenviar — desejável se foi erro nosso (banco fora).
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
