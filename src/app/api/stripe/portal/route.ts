/**
 * Portal do Cliente do Stripe.
 *
 * POST /api/stripe/portal  ->  { url }
 *
 * Onde o cliente cancela, troca o cartão e baixa as faturas sem passar por
 * e-mail com o suporte. A sessão é criada no servidor porque exige a chave
 * secreta; o navegador só recebe a URL.
 *
 * LOCALIZAÇÃO DO CUSTOMER: a tabela `users` não guarda `stripe_customer_id`
 * (e adicionar coluna só para isso exigiria migração + backfill). O checkout
 * sempre usa o e-mail da conta, então localizamos o customer pelo e-mail.
 * Isso também é o motivo de o checkout reaproveitar o customer existente:
 * evita duplicar clientes e o `limit: 1` pegar o errado.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getStripe, stripeConfigurado } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (!stripeConfigurado()) {
    return NextResponse.json({ error: "pagamentos não configurados" }, { status: 503 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "entre na sua conta para gerenciar a assinatura" }, { status: 401 });
  }

  // Mesma origem usada pelo checkout — o cliente volta para /config.
  const base = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");

  try {
    const stripe = await getStripe();

    const clientes = await stripe.customers.list({
      email: user.email.trim().toLowerCase(),
      limit: 1,
    });

    const customer = clientes.data[0];
    if (!customer) {
      return NextResponse.json(
        { error: "Nenhuma assinatura encontrada para este e-mail. Assine um plano primeiro." },
        { status: 404 },
      );
    }

    const sessao = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${base}/config`,
    });

    if (!sessao.url) {
      return NextResponse.json({ error: "Stripe não devolveu URL do portal" }, { status: 502 });
    }
    return NextResponse.json({ url: sessao.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[stripe/portal]", msg);
    // Erro clássico: o Portal do Cliente não foi ativado no painel do Stripe.
    const naoConfigurado = /configuration|portal/i.test(msg);
    return NextResponse.json(
      {
        error: naoConfigurado
          ? "O Portal do Cliente ainda não foi ativado no painel do Stripe (Settings → Billing → Customer portal)."
          : msg,
      },
      { status: 502 },
    );
  }
}
