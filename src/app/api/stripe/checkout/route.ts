/**
 * Cria a sessão de checkout do Stripe.
 *
 * POST /api/stripe/checkout   { plano: "mensal" | "anual" }
 *
 * Devolve { url } para o cliente redirecionar. Não usamos redirect 303 daqui
 * porque o front precisa tratar o erro de forma amigável antes de sair da página.
 *
 * O userId vai no metadata: é o que o webhook usa para achar a conta. Nunca
 * confiamos em e-mail vindo do Stripe para identificar o usuário — ele pode
 * pagar com um e-mail diferente do cadastro.
 */
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getStripe, planos, stripeConfigurado, type PlanoId } from "@/lib/stripe";
import { sanitizeNext, comParametro } from "@/lib/nextPath";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!stripeConfigurado()) {
    return NextResponse.json({ error: "pagamentos não configurados" }, { status: 503 });
  }

  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "entre na sua conta para assinar" }, { status: 401 });
  }

  let planoId: PlanoId = "mensal";
  /* Para onde o Stripe devolve o cliente: a página onde ele bateu no paywall.
     Default seguro é /jogos (nunca a tela de planos, para não parecer loop). */
  let nextDestino = "/jogos";
  try {
    const body = (await req.json()) as { plano?: string; next?: string };
    if (body?.plano === "anual") planoId = "anual";
    else if (body?.plano && body.plano !== "mensal") {
      return NextResponse.json({ error: "plano inválido" }, { status: 400 });
    }
    nextDestino = sanitizeNext(body?.next);
  } catch {
    // Corpo vazio: assume o mensal, que é o padrão do botão principal.
  }

  const plano = planos().find((p) => p.id === planoId);
  if (!plano?.priceId) {
    return NextResponse.json(
      { error: `price do plano "${planoId}" não configurado (STRIPE_PRICE_${planoId.toUpperCase()})` },
      { status: 503 },
    );
  }

  // Origem para os redirects: preferimos APP_URL para não depender do header
  // `origin`, que pode faltar em chamadas de servidor.
  const base = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");

  try {
    const stripe = await getStripe();

    // Reaproveita o customer pelo e-mail da conta. Sem isto o Stripe cria um
    // customer novo a cada checkout, e o Portal do Cliente (/api/stripe/portal)
    // poderia abrir a assinatura errada. Se a busca falhar, cai no
    // `customer_email` e o checkout continua funcionando.
    let customerId: string | undefined;
    try {
      const existentes = await stripe.customers.list({
        email: user.email.trim().toLowerCase(),
        limit: 1,
      });
      customerId = existentes.data[0]?.id;
    } catch (e) {
      console.warn(
        "[stripe/checkout] busca de customer falhou; usando customer_email:",
        e instanceof Error ? e.message : e,
      );
    }

    const sessao = await stripe.checkout.sessions.create({
      mode: "subscription",
      // Um dos dois é obrigatório em assinatura. `customer` evita duplicar.
      ...(customerId ? { customer: customerId } : { customer_email: user.email }),
      line_items: [{ price: plano.priceId, quantity: 1 }],
      allow_promotion_codes: true,
      client_reference_id: String(user.id),
      metadata: {
        userId: String(user.id),
        email: user.email,
        plano: planoId,
        next: nextDestino,
      },
      // Repetimos no nível da assinatura: eventos de fatura futura não trazem
      // o metadata da sessão, e podemos precisar identificar o dono.
      subscription_data: {
        metadata: { userId: String(user.id), plano: planoId },
      },
      success_url: `${base}${comParametro(nextDestino, "assinou", "1")}`,
      cancel_url: `${base}${comParametro(nextDestino, "assinatura", "cancelada")}`,
    });

    if (!sessao.url) {
      return NextResponse.json({ error: "Stripe não devolveu URL de checkout" }, { status: 502 });
    }
    return NextResponse.json({ url: sessao.url, id: sessao.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[stripe/checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
