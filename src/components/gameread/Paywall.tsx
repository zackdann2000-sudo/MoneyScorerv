"use client";

import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";

/**
 * Paywall de UI do módulo GameRead.
 *
 * Regra de negócio (decidida com o usuário):
 *   · logado + VIP/admin  → vê tudo
 *   · visitante ou não-VIP → vê as top 3 do dia; o resto fica desfocado
 *
 * Não há cobrança/Stripe aqui: o bloqueio é apenas visual e aponta para o login
 * que já existe no projeto (gs_session). O servidor NÃO esconde os dados nesta
 * versão — é uma barreira de conversão, não de segurança. Quando entrar o
 * pagamento de verdade, o corte deve ser feito na rota da API.
 */

export type AccessState = "loading" | "vip" | "limited";

/** Props com score acima disto são consideradas "ouro" e ficam bloqueadas. */
export const GOLD_SCORE = 105;

/** Quantas oportunidades um usuário sem acesso vê. */
export const FREE_VISIBLE = 3;

/** Cartão desfocado com cadeado e CTA de conversão. */
export function LockedCard({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative rounded-2xl border border-acc/35 bg-panel overflow-hidden">
      {/* Conteúdo fantasma: só decoração, não representa dados reais. */}
      <div className="select-none pointer-events-none blur-[5px] opacity-45 p-3 space-y-2" aria-hidden>
        <div className="flex items-center gap-2">
          <span className="h-3 w-10 rounded bg-acc/50" />
          <span className="h-3 w-24 rounded bg-line" />
          <span className="ml-auto h-3 w-12 rounded bg-line" />
        </div>
        <div className="h-3 w-2/3 rounded bg-line" />
        <div className="flex gap-2 pt-1">
          <span className="h-6 w-14 rounded bg-line" />
          <span className="h-6 w-14 rounded bg-line" />
          <span className="ml-auto h-6 w-10 rounded bg-acc/40" />
        </div>
      </div>

      <div className={`absolute inset-0 flex items-center justify-center bg-bg/45 backdrop-blur-[1px] ${compact ? "p-2" : "p-3"}`}>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-3 h-9 rounded-xl bg-acc text-bg text-[11px] font-extrabold shadow-lg shadow-acc/20"
        >
          <Lock size={13} /> Desbloquear com login
        </Link>
      </div>
    </div>
  );
}

/** Aviso no topo da lista quando o usuário está limitado (não é card). */
export function PaywallBanner({ visible, total }: { visible: number; total: number }) {
  const hidden = Math.max(0, total - visible);
  return (
    <div className="rounded-2xl border border-acc/40 bg-acc/8 p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-extrabold text-acc">
        <Sparkles size={13} /> {visible} de {total} oportunidades liberadas
      </div>
      <p className="text-[10px] text-mut leading-relaxed">
        Você está vendo as {visible} melhores do dia
        {hidden > 0 ? ` — outras ${hidden} continuam bloqueadas` : ""}. Entre na sua conta com acesso ativo para
        liberar todas as props, o score completo e as odds de todas as casas.
      </p>
      <div className="flex gap-2 pt-0.5">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg bg-acc text-bg text-[10px] font-extrabold"
        >
          <Lock size={11} /> Entrar
        </Link>
        <Link
          href="/config"
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-lg border border-line text-ink text-[10px] font-bold"
        >
          Ver planos
        </Link>
      </div>
    </div>
  );
}

/** Selo pequeno de "bloqueado" usado no lugar de valores individuais. */
export function LockedBadge({ label = "VIP" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-acc/15 text-acc text-[9px] font-extrabold">
      <Lock size={9} /> {label}
    </span>
  );
}
