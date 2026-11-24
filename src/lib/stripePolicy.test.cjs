/**
 * Teste da política de acesso por evento do Stripe.
 *
 * Este arquivo existe para travar UMA regra de negócio: falha de pagamento não
 * revoga acesso. Se alguém no futuro trocar a decisão (ou adicionar um `case` de
 * revogação para um evento de cobrança), o teste quebra — em vez de o cliente
 * perder o VIP por um cartão recusado que seria aprovado na tentativa seguinte.
 *
 * Rodar:
 *   ./scripts/unit-tests.sh stripePolicy
 */
const { decidirAcao, podeRevogar, TIPOS_QUE_NUNCA_REVOGAM } = require("./stripePolicy.js");

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) console.log(`✅ ${nome}`);
  else {
    falhas++;
    console.log(`❌ ${nome}${detalhe ? `\n   ${detalhe}` : ""}`);
  }
}

// ------------------------------------------------------- regra inegociável
for (const tipo of TIPOS_QUE_NUNCA_REVOGAM) {
  const a = decidirAcao({ type: tipo });
  ok(`${tipo} não revoga acesso`, a.tipo !== "revogar", `ação=${a.tipo}`);
}

const falhaPagamento = decidirAcao({ type: "invoice.payment_failed" });
ok("falha de pagamento é ignorada", falhaPagamento.tipo === "ignorar");
ok(
  "motivo da falha fala em acesso mantido",
  falhaPagamento.tipo === "ignorar" && /acesso mantido/i.test(falhaPagamento.motivo),
  JSON.stringify(falhaPagamento),
);
ok(
  "podeRevogar(invoice.payment_failed) = false",
  podeRevogar("invoice.payment_failed") === false,
);

// ------------------------------------------------------------- concessões
const checkoutPago = decidirAcao({ type: "checkout.session.completed", paymentStatus: "paid" });
ok(
  "checkout pago concede VIP",
  checkoutPago.tipo === "conceder" && checkoutPago.origem === "checkout",
  JSON.stringify(checkoutPago),
);
const checkoutSemCobranca = decidirAcao({
  type: "checkout.session.completed",
  paymentStatus: "no_payment_required",
});
ok("checkout sem cobrança (trial do Stripe) concede", checkoutSemCobranca.tipo === "conceder");
const checkoutNaoPago = decidirAcao({ type: "checkout.session.completed", paymentStatus: "unpaid" });
ok("checkout não pago NÃO concede", checkoutNaoPago.tipo === "ignorar");
ok("checkout sem payment_status NÃO concede", decidirAcao({ type: "checkout.session.completed" }).tipo === "ignorar");

const renovacao = decidirAcao({ type: "invoice.paid", billingReason: "subscription_cycle" });
ok(
  "invoice.paid de renovação estende o VIP",
  renovacao.tipo === "conceder" && renovacao.origem === "renovação",
  JSON.stringify(renovacao),
);
const primeiraFatura = decidirAcao({ type: "invoice.paid", billingReason: "subscription_create" });
ok("invoice.paid da 1ª fatura é ignorada (evita somar dias 2x)", primeiraFatura.tipo === "ignorar");
ok(
  "invoice.paid sem billing_reason ainda renova",
  decidirAcao({ type: "invoice.paid" }).tipo === "conceder",
);

// ------------------------------------------------------------- revogações
const cancelou = decidirAcao({ type: "customer.subscription.deleted" });
ok(
  "assinatura cancelada revoga",
  cancelou.tipo === "revogar" && cancelou.origem === "cancelamento",
  JSON.stringify(cancelou),
);
const estorno = decidirAcao({ type: "charge.refunded" });
ok("reembolso revoga", estorno.tipo === "revogar" && estorno.origem === "reembolso");
ok("podeRevogar(customer.subscription.deleted) = true", podeRevogar("customer.subscription.deleted") === true);
ok("podeRevogar(charge.refunded) = true", podeRevogar("charge.refunded") === true);

// Só estes dois revogam — nada mais na lista de eventos que a rota trata.
const todosQueRevogam = [
  "checkout.session.completed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.deleted",
  "charge.refunded",
  "customer.subscription.updated",
  "payment_intent.created",
].filter((t) => podeRevogar(t));
ok(
  "apenas cancelamento e reembolso revogam",
  todosQueRevogam.length === 2 &&
    todosQueRevogam.includes("customer.subscription.deleted") &&
    todosQueRevogam.includes("charge.refunded"),
  JSON.stringify(todosQueRevogam),
);

// --------------------------------------------------------------- genéricos
ok("evento desconhecido é ignorado", decidirAcao({ type: "customer.created" }).tipo === "ignorar");
ok("evento vazio é ignorado", decidirAcao({ type: "" }).tipo === "ignorar");
ok("type ausente não explode", decidirAcao({}).tipo === "ignorar");

console.log("");
if (falhas) {
  console.error(`❌ ${falhas} asserção(ões) falharam`);
  process.exit(1);
}
console.log("✅ stripePolicy: todas as asserções passaram");
