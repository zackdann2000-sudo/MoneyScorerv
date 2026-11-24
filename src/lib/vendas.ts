/**
 * Chave de monetização — hoje DESLIGADA por decisão de produto.
 *
 * Modelo em vigor: cadastro por e-mail → 24h de acesso completo → depois
 * 1 análise grátis por dia. Nenhuma tela oferece assinatura.
 *
 * O código do Stripe continua no repositório (`api/stripe/*`,
 * `api/webhooks/stripe`, `lib/stripe.ts`, `lib/stripePolicy.ts`) e segue
 * testado: reativar a venda é trocar `VENDAS_ATIVAS` para `true` e garantir as
 * envs do Stripe (ver `docs/DEPLOY_CHECKLIST.md`). Nada além disso depende
 * dessa constante — por isso ela existe: evitar caçar strings de "/planos" por
 * todo o app quando a decisão mudar de novo.
 */
export const VENDAS_ATIVAS = false;

/** Texto único que explica o modelo atual (evita copy divergente entre telas). */
export const MODELO_ATUAL =
  "24h de acesso completo no cadastro e, depois, 1 análise grátis por dia. Sem cartão, sem assinatura.";
