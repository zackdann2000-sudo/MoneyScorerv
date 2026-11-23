"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Check, CreditCard, LogIn, ShieldCheck, Sparkles } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { sanitizeNext } from "@/lib/nextPath";

/**
 * Paywall único do app.
 *
 * Antes existiam dois discursos: `TipsGate` dizia "não há assinatura / o
 * administrador libera o VIP" (verdade da era PIX) e `/planos` vendia Stripe.
 * Quem batia no bloqueio desistia. Aqui a restrição é uma só, com um CTA só, e
 * o destino de volta é a página em que a pessoa estava (`?next=`).
 *
 * `reason` é opcional de propósito: os chamadores que já sabem o motivo
 * (`expired`, `login`) passam; os que só recebem 402/403 do servidor deixam o
 * componente decidir olhando o usuário logado.
 */
export default function PaywallCard({
  reason,
  titulo,
  descricao,
  compacto = false,
}: {
  reason?: "login" | "expired" | "quota";
  titulo?: string;
  descricao?: string;
  compacto?: boolean;
}) {
  const { user, vip } = useApp();
  const path = usePathname();
  const router = useRouter();

  /* O destino é montado no clique, e não no render: `useSearchParams` obrigaria
     um Suspense em toda página estática que usa o gate (/ev, /detector,
     /supertips/palpites...). Aqui a query vem do window e preserva `?league=`. */
  const irParaPlanos = () => {
    const atual = typeof window === "undefined" ? path : `${path}${window.location.search}`;
    router.push(`/planos?next=${encodeURIComponent(sanitizeNext(atual))}`);
  };

  const motivo = reason ?? (user && !vip ? "expired" : "login");

  const tituloFinal =
    titulo ??
    (motivo === "quota"
      ? "Você usou as análises de hoje"
      : motivo === "login"
        ? "Libere as análises completas"
        : "Seu acesso VIP terminou");
  const descricaoFinal =
    descricao ??
    (motivo === "quota"
      ? `Seu plano ${(user?.quota?.plano ?? "free").toUpperCase()} libera ${user?.quota?.limite ?? 1} análise(s) por dia e o contador zera à meia-noite. Assine para ver agora: Starter 6/dia, Pro 20/dia, Expert ilimitado.`
      : motivo === "login"
        ? "Crie sua conta grátis e veja 1 análise completa por dia, sem cartão. Para ver mais, assine no cartão — cancele quando quiser."
        : "Assine e volte a ver oportunidades, props e relatórios agora. Acesso imediato após o pagamento, cancele quando quiser.");

  return (
    <div className={`rounded-2xl border border-acc/35 bg-gradient-to-br from-acc/10 via-panel to-panel ${compacto ? "p-4" : "p-5"}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-acc/15 text-acc">
          <Sparkles size={16} />
        </span>
        <p className="font-display font-bold text-lg uppercase leading-tight text-ink">{tituloFinal}</p>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-mut">{descricaoFinal}</p>

      <ul className="mt-3 space-y-1.5">
        {["Acesso imediato após o pagamento", "Cartão de crédito via Stripe", "Cancele quando quiser"].map((b) => (
          <li key={b} className="flex items-start gap-2 text-[11px] font-semibold text-ink">
            <Check size={13} className="mt-0.5 shrink-0 text-good" />
            {b}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={irParaPlanos}
          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-acc px-4 text-[13px] font-black text-black"
        >
          <CreditCard size={15} /> Assinar o VIP
        </button>
        {motivo === "login" && (
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-4 text-[13px] font-bold text-ink"
          >
            <LogIn size={15} /> Entrar
          </Link>
        )}
      </div>

      <p className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold text-mut">
        <ShieldCheck size={11} className="text-good" /> Plataforma de análise (18+). Sem promessa de lucro.
      </p>
    </div>
  );
}
