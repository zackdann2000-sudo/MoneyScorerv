import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Clock, Sparkles } from "lucide-react";
import { MODELO_ATUAL } from "@/lib/vendas";

/**
 * /planos — página de vendas DESATIVADA.
 *
 * A monetização está pausada: o produto é 24h grátis no cadastro e, depois,
 * 1 análise grátis por dia. A rota continua existindo (links antigos, histórico
 * de navegador) mas não vende nada e não é indexada.
 *
 * O código do Stripe segue no repositório (`api/stripe/*`, `api/webhooks/stripe`,
 * `lib/stripePolicy.ts`) e testado. Para reativar a venda: `VENDAS_ATIVAS = true`
 * em `src/lib/vendas.ts` e as envs do Stripe (doc: `docs/DEPLOY_CHECKLIST.md`).
 */
export const metadata: Metadata = {
  title: "Planos",
  description: "O GreenScore está com o teste grátis de 24h e 1 análise por dia. Sem assinatura no momento.",
  // Página sem valor de busca enquanto a venda está pausada.
  robots: { index: false, follow: false },
};

const BENEFICIOS = [
  "App completo por 24 horas, sem cartão",
  "Depois: 1 análise grátis por dia, contador zerando à meia-noite",
  "Placares, ligas, classificação e estatísticas sempre abertos",
];

export default function PlanosPage() {
  return (
    <div className="mx-auto max-w-md px-3 py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-mut hover:text-ink"
      >
        <ArrowLeft size={13} /> Início
      </Link>

      <div className="mt-3 rounded-2xl border border-acc/30 bg-gradient-to-br from-acc/[0.10] via-panel to-panel p-5">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-acc/40 bg-acc/15 text-acc">
          <Sparkles size={20} />
        </div>
        <h1 className="mt-3 font-display text-xl font-bold uppercase leading-tight text-ink">
          Sem assinatura por enquanto
        </h1>
        <p className="mt-2 text-[12px] leading-relaxed text-mut">
          O foco agora é o teste grátis. {MODELO_ATUAL} Não existe cobrança nesta fase — quem já tinha
          assinatura continua com o acesso até a data de expiração.
        </p>

        <ul className="mt-4 space-y-1.5">
          {BENEFICIOS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[11px] font-semibold text-ink">
              <Check size={13} className="mt-0.5 shrink-0 text-good" />
              {b}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/cadastro"
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-acc px-4 text-[13px] font-black text-black"
          >
            Criar conta e testar 24h
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-4 text-[13px] font-bold text-ink"
          >
            Entrar
          </Link>
        </div>

        <p className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-bold text-mut">
          <Clock size={11} /> O contador diário zera à meia-noite (Brasília).
        </p>
      </div>

      <p className="mt-4 text-center text-[10px] leading-relaxed text-mut">
        Plataforma de análise esportiva (18+). Não operamos apostas e não há promessa de lucro.
      </p>
    </div>
  );
}
