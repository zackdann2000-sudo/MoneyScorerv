"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Crown, Loader2, ShieldCheck, Sparkles, AlertCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { PLANOS, TIERS, brl } from "@/lib/planos";
import { sanitizeNext } from "@/lib/nextPath";

/**
 * Página de planos (/planos).
 *
 * O checkout é criado no servidor (/api/stripe/checkout) e a navegação é feita
 * pelo `url` devolvido. Fazer isso no cliente com a secret key exporia a chave.
 *
 * Preços vêm de `@/lib/planos` — a mesma fonte que o servidor usa para conceder
 * os dias de acesso. Antes eram duplicados aqui e podiam divergir do Stripe.
 */

const BENEFICIOS = [
  "Todas as props do radar, sem limite de 3",
  "Desajustes modelo × mercado completos",
  "Probabilidades por Poisson em cada linha",
  "+EV, Money Tips e Palpites IA",
  "Sem anúncios",
];

function PlanosInner() {
  const { user, vip } = useApp();
  const params = useSearchParams();
  const status = params.get("status");
  /* Página de origem que pediu o VIP. O Stripe devolve o cliente exatamente lá. */
  const next = sanitizeNext(params.get("next"));

  const [carregando, setCarregando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const assinar = useCallback(async (planoId: string) => {
    setErro(null);
    setCarregando(planoId);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano: planoId, next }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? `HTTP ${res.status}`);
      // Sai da SPA para o Stripe.
      window.location.href = json.url;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível abrir o checkout");
      setCarregando(null);
    }
  }, [next]);

  return (
    <div className="max-w-2xl mx-auto px-3 py-4 space-y-4">
      <Link
        href={next}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-mut hover:text-ink"
      >
        <ArrowLeft size={13} /> Voltar
      </Link>

      <header className="text-center space-y-1 py-2">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-acc/15 border border-acc/40 mb-1">
          <Crown size={20} className="text-acc" />
        </div>
        <h1 className="text-lg font-extrabold text-ink">Seja VIP</h1>
        <p className="text-xs text-mut max-w-sm mx-auto leading-relaxed">
          Todas as oportunidades do radar, sem os 3 cards de degustação.
        </p>
      </header>

      {/* Retorno do Stripe */}
      {status === "sucesso" && (
        <div className="rounded-2xl border border-acc/40 bg-acc/10 p-3 flex items-start gap-2">
          <Check size={16} className="text-acc mt-0.5 shrink-0" />
          <div className="text-xs">
            <p className="font-bold text-acc">Pagamento confirmado!</p>
            <p className="text-mut mt-0.5">
              O Stripe libera o acesso automaticamente. Você volta para a página onde pediu o VIP
              com tudo já desbloqueado.
            </p>
          </div>
        </div>
      )}
      {status === "cancelado" && (
        <div className="rounded-2xl border border-line bg-panel p-3 flex items-start gap-2">
          <AlertCircle size={16} className="text-warn mt-0.5 shrink-0" />
          <p className="text-xs text-mut">
            Checkout cancelado. Nada foi cobrado — você pode tentar de novo quando quiser.
          </p>
        </div>
      )}

      {/* Já é VIP */}
      {vip && (
        <div className="rounded-2xl border border-acc/40 bg-acc/10 p-3 flex items-center gap-2">
          <Sparkles size={16} className="text-acc shrink-0" />
          <p className="text-xs text-ink">
            Você já tem acesso VIP ativo
            {user?.access?.label ? <span className="text-mut"> · {user.access.label}</span> : "."}
          </p>
        </div>
      )}

      {erro && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-xs">
          <p className="font-bold text-danger">Não deu para abrir o checkout</p>
          <p className="text-mut mt-0.5 break-words">{erro}</p>
        </div>
      )}

      {/* Planos */}
      <div className="grid gap-2.5">
        {PLANOS.map((p) => (
          <div
            key={p.id}
            className={`rounded-2xl border p-3.5 space-y-3 ${
              p.destaque ? "border-acc/60 bg-acc/[0.07]" : "border-line bg-panel"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-extrabold text-ink">{p.nome}</p>
                  {p.destaque && (
                    <span className="px-1.5 py-0.5 rounded-md bg-acc text-bg text-[9px] font-extrabold">
                      ECONOMIZE 30%
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-mut mt-0.5">
                  {brl(p.preco)} <span className="opacity-70">{p.periodo}</span>
                </p>
                {p.destaque && (
                  <p className="text-[10px] text-acc font-bold mt-0.5">
                    equivale a {brl(p.precoMes)}/mês
                  </p>
                )}
              </div>
              <Crown size={18} className={p.destaque ? "text-acc" : "text-mut"} />
            </div>

            <button
              onClick={() => assinar(p.id)}
              disabled={carregando !== null || !user}
              className={`w-full h-10 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-opacity disabled:opacity-50 ${
                p.destaque ? "bg-acc text-bg" : "bg-panel2 text-ink border border-line"
              }`}
            >
              {carregando === p.id ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Abrindo checkout…
                </>
              ) : (
                <>
                  <Crown size={14} /> Assinar VIP
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Quanto cada plano libera POR DIA — a regra que substitui o trial de
          24h. Free 1/dia mantém o hábito; quem quer mais assina. */}
      <div className="rounded-2xl border border-line bg-panel p-3.5 space-y-2">
        <p className="text-[10px] font-bold text-mut uppercase tracking-wide">Quanto você vê por dia</p>
        <ul className="divide-y divide-line/60">
          {TIERS.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-1.5">
              <span className={`w-14 shrink-0 text-[11px] font-extrabold ${t.id === "free" ? "text-mut" : "text-acc"}`}>{t.nome}</span>
              <span className="min-w-0 flex-1 text-[10px] text-mut">{t.nota}</span>
              <span className="shrink-0 text-[10px] font-extrabold tabular-nums text-ink">{t.porDia}</span>
            </li>
          ))}
        </ul>
      </div>

      {!user && (
        <div className="rounded-2xl border border-line bg-panel p-3 text-center text-xs text-mut">
          <Link href="/login" className="text-acc font-bold underline">
            Entre na sua conta
          </Link>{" "}
          para assinar.
        </div>
      )}

      {/* Benefícios */}
      <div className="rounded-2xl border border-line bg-panel p-3.5 space-y-2">
        <p className="text-[10px] font-bold text-mut uppercase tracking-wide">O que você recebe</p>
        <ul className="space-y-1.5">
          {BENEFICIOS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-[11px] text-ink">
              <Check size={13} className="text-acc mt-0.5 shrink-0" />
              <span className="leading-snug">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-mut text-center leading-relaxed inline-flex items-center gap-1.5 justify-center w-full">
        <ShieldCheck size={11} /> Cartão de crédito via Stripe · cancele quando quiser
      </p>
    </div>
  );
}

/** `useSearchParams()` exige Suspense na prerenderização estática. */
export default function PlanosPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-2xl mx-auto px-3 py-10 text-center text-mut text-sm">Carregando…</div>
      }
    >
      <PlanosInner />
    </Suspense>
  );
}
