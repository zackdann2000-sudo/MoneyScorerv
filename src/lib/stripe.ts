/* DORMENTE (modo gratuito): ver src/lib/vendas.ts. Nenhuma tela chama esta
   integração enquanto VENDAS_ATIVAS=false; o código fica isolado e testado
   para quando a venda voltar. Não remova sem ler aquele arquivo. */
/**
 * Integração Stripe do GreenScore.
 *
 * Responsabilidades:
 *  - criar a sessão de checkout (assinatura mensal/anual)
 *  - ler preços configurados
 *  - conceder/estender o acesso VIP no banco
 *
 * REGRA DE ACESSO (descoberta em src/lib/auth.ts):
 *   `access.active` exige `plan === "vip"` **E** `expiresAt` no futuro.
 *   Só marcar plan="vip" NÃO libera nada — precisa da data. Esse é o erro mais
 *   fácil de cometer num webhook, e por isso `concederVip` sempre calcula a
 *   data a partir do período pago.
 */
import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { PLANOS, type Plano, type PlanoId } from "@/lib/planos";

export const STRIPE_API_VERSION = "2026-10-28.endive" as const;

/* Preço/período vêm de `@/lib/planos` (fonte única, importável no client).
   Aqui só anexamos o `priceId`, que é configuração de servidor. */
export type { Plano, PlanoId };

export type PlanoVenda = Plano & { priceId: string | undefined };

export function planos(): PlanoVenda[] {
  const precos: Record<PlanoId, string | undefined> = {
    mensal: process.env.STRIPE_PRICE_MENSAL,
    anual: process.env.STRIPE_PRICE_ANUAL,
  };
  return PLANOS.map((p) => ({ ...p, priceId: precos[p.id] }));
}

/** True quando as chaves essenciais existem. Sem isso as rotas respondem 503. */
export function stripeConfigurado(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Cliente Stripe com import LAZY.
 *
 * Mesmo motivo do `@/db`: um import estático executaria na carga do módulo e
 * quebraria o build/rotas quando a env não existe (ex.: build sem segredos).
 */
let cliente: Stripe | null = null;

export async function getStripe(): Promise<Stripe> {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) throw new Error("STRIPE_SECRET_KEY ausente");
  if (cliente) return cliente;
  const { default: StripeCtor } = await import("stripe");
  cliente = new StripeCtor(chave, { apiVersion: STRIPE_API_VERSION });
  return cliente;
}

/* ------------------------------------------------------------------ */
/* Concessão de acesso                                                */
/* ------------------------------------------------------------------ */

export type ResultadoVip =
  | { ok: true; userId: number; email: string; expiraEm: Date; estendido: boolean }
  | { ok: false; motivo: string };

/**
 * Ativa/estende o VIP de um usuário pelo e-mail.
 *
 * - Se já tem acesso válido, SOMA os dias (renovação antecipada não perde tempo).
 * - Se está expirado ou nunca teve, começa de hoje.
 *
 * Feito em transação: se a leitura e a escrita não forem atômicas, dois webhooks
 * simultâneos (Stripe reentrega eventos) poderiam somar os dias duas vezes.
 */
export async function concederVip(
  email: string,
  dias: number,
  origem: string,
): Promise<ResultadoVip> {
  const alvo = email.trim().toLowerCase();
  if (!alvo) return { ok: false, motivo: "e-mail vazio" };
  if (!Number.isFinite(dias) || dias <= 0) return { ok: false, motivo: "período inválido" };

  return await db.transaction(async (tx) => {
    // Comparação case-insensitive: o Stripe devolve o e-mail como o cliente
    // digitou, mas no banco ele pode estar em outra caixa.
    const encontrados = await tx
      .select({ id: users.id, email: users.email, expiresAt: users.expiresAt })
      .from(users)
      .where(eq(users.email, alvo))
      .limit(1);

    const u = encontrados[0];
    if (!u) return { ok: false, motivo: `usuário não encontrado: ${alvo}` };

    const agora = new Date();
    const aindaValido = u.expiresAt && u.expiresAt.getTime() > agora.getTime();
    const base = aindaValido ? u.expiresAt! : agora;
    const expiraEm = new Date(base.getTime() + dias * 864e5);

    await tx
      .update(users)
      .set({ plan: "vip", expiresAt: expiraEm })
      .where(eq(users.id, u.id));

    console.log(
      `[stripe] VIP concedido a ${alvo} (id ${u.id}) por ${dias}d via ${origem}; expira ${expiraEm.toISOString()}`,
    );

    return { ok: true, userId: u.id, email: alvo, expiraEm, estendido: Boolean(aindaValido) };
  });
}

/* ------------------------------------------------------------------ */
/* Idempotência                                                       */
/* ------------------------------------------------------------------ */

/**
 * Stripe reentrega webhooks quando não recebe 2xx (ou por retry próprio).
 * Sem controle, o mesmo pagamento somaria dias várias vezes.
 *
 * Guardamos os ids já processados na tabela `stripe_eventos`, com chave
 * primária no id do evento — a segunda inserção falha e o handler para.
 */
export async function eventoJaProcessado(eventId: string): Promise<boolean> {
  try {
    const { stripeEventos } = await import("@/db/schema");
    const linhas = await db
      .select({ id: stripeEventos.id })
      .from(stripeEventos)
      .where(eq(stripeEventos.id, eventId))
      .limit(1);
    return linhas.length > 0;
  } catch {
    // Se a tabela não existe, não bloqueia o pagamento: é melhor conceder duas
    // vezes do que negar um cliente que pagou. O aviso fica no log.
    console.warn("[stripe] tabela stripe_eventos indisponível; idempotência desativada");
    return false;
  }
}

export async function registrarEvento(eventId: string, tipo: string): Promise<void> {
  try {
    const { stripeEventos } = await import("@/db/schema");
    await db
      .insert(stripeEventos)
      .values({ id: eventId, tipo })
      .onConflictDoNothing({ target: stripeEventos.id });
  } catch (e) {
    console.warn("[stripe] falha ao registrar evento:", e instanceof Error ? e.message : e);
  }
}

/** Descobre quantos dias o preço comprado concede. */
export async function diasDoPrice(priceId: string | undefined): Promise<number> {
  if (!priceId) return 30;
  const p = planos().find((x) => x.priceId === priceId);
  if (p) return p.dias;

  // Price não mapeado: perguntamos ao Stripe qual é o intervalo.
  try {
    const stripe = await getStripe();
    const price = await stripe.prices.retrieve(priceId);
    const rec = price.recurring;
    if (!rec) return 30;
    const n = rec.interval_count ?? 1;
    if (rec.interval === "year") return 365 * n;
    if (rec.interval === "month") return 30 * n;
    if (rec.interval === "week") return 7 * n;
    if (rec.interval === "day") return n;
  } catch (e) {
    console.warn("[stripe] não consegui ler o price:", e instanceof Error ? e.message : e);
  }
  return 30;
}
