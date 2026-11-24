"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock, Lock, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { jaConsumiuHoje, matchIdDeCaminho } from "@/lib/quotaLocal";

/**
 * Limite diário — interceptação amigável no clique.
 *
 * Antes: quem estouravam a quota clicava no jogo, a página abria e só então
 * aparecia o paywall em cima da análise (parecia erro/página quebrada).
 * Agora o clique é interceptado na origem — sem gastar navegação e sem gastar
 * quota — e o limite é explicado num modal.
 *
 * Interceptação por `document` (captura) em vez de patch nos cards: existem 12+
 * lugares que linkam `/jogos/<id>` (ev, detector, money-tips, times, palpites,
 * desempenho…). Um único listener garante a mesma regra em todos.
 *
 * Não bloqueia:
 *  - quem tem acesso completo (VIP/vitalício) ou quota ilimitada;
 *  - a lista `/jogos` (só `/jogos/<id>`);
 *  - reabrir a MESMA partida já aberta hoje (não debita de novo);
 *  - ctrl/cmd/shift/clique do meio ou target=_blank.
 */
export default function LimiteAnaliseGuard() {
  const { user, vip } = useApp();
  const [aberto, setAberto] = useState(false);

  const esgotada = Boolean(user && !vip && !user.quota?.ilimitada && user.quota?.esgotada);

  useEffect(() => {
    if (!esgotada) return;

    const aoClicar = (ev: MouseEvent) => {
      if (ev.defaultPrevented || ev.button !== 0) return;
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;

      const alvo = ev.target as HTMLElement | null;
      const link = alvo?.closest?.('a[href^="/jogos/"]') as HTMLAnchorElement | null;
      if (!link || link.target === "_blank") return;

      let caminho = link.getAttribute("href") || "";
      try {
        caminho = new URL(link.href, window.location.href).pathname;
      } catch {
        /* href relativo já serve */
      }

      const id = matchIdDeCaminho(caminho);
      if (!id) return;
      if (jaConsumiuHoje(id)) return; // já debitado hoje: reabrir é livre

      ev.preventDefault();
      ev.stopPropagation();
      setAberto(true);
    };

    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, [esgotada]);

  if (!aberto) return null;

  const limite = user?.quota?.limite ?? 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="limite-titulo"
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-warn/40 bg-warn/10 text-warn">
            <Lock size={18} />
          </span>
          <button
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-panel2 text-mut"
          >
            <X size={14} />
          </button>
        </div>

        <h2 id="limite-titulo" className="mt-3 font-display text-lg font-bold uppercase leading-tight text-ink">
          Sua análise de hoje já foi usada
        </h2>
        <p className="mt-1.5 break-words text-[12px] leading-relaxed text-mut">
          O plano grátis libera <strong className="text-ink">{limite} análise por dia</strong> e você já
          usou. O contador volta ao cheio à meia-noite, no horário de Brasília — não é bloqueio
          permanente e nada foi perdido.
        </p>

        <p className="mt-2 text-[11px] font-bold text-ink">Continua aberto agora:</p>
        <ul className="mt-1 space-y-1 text-[11px] leading-snug text-mut">
          {[
            "Placares ao vivo, ligas e classificação",
            "Estatísticas de partida já abertas hoje",
            "Track Record completo, green e red",
          ].map((t) => (
            <li key={t} className="break-words">
              · {t}
            </li>
          ))}
        </ul>

        <Link
          href="/ao-vivo"
          onClick={() => setAberto(false)}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-acc text-[13px] font-black text-black"
        >
          Ver placares ao vivo <ArrowRight size={14} />
        </Link>
        <button
          onClick={() => setAberto(false)}
          className="mt-2 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-panel2 text-[12px] font-bold text-ink"
        >
          <Clock size={13} /> Esperar até amanhã
        </button>

        <p className="mt-3 text-center text-[10px] font-bold text-mut">
          Não há assinatura nesta fase · nenhum cartão é pedido
        </p>
      </div>
    </div>
  );
}
