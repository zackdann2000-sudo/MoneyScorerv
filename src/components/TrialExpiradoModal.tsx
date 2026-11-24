"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Clock, LogIn, X } from "lucide-react";
import { useApp } from "@/context/AppContext";

/**
 * Aviso de fim do teste de 24h.
 *
 * Antes isso era um toast que sumia em 3 segundos — a pessoa ficava sem saber
 * por que o app "encolheu". Agora é um aviso que ela precisa fechar, com o que
 * continua liberado e o caminho de volta (outra conta).
 *
 * Aparece UMA vez por conta+data de expiração (localStorage). Não aparece para
 * dono/vitalício nem para quem ainda está dentro das 24h.
 */
const ANO_VITALICIO = 2090;

export default function TrialExpiradoModal() {
  const { user } = useApp();
  const [aberto, setAberto] = useState(false);

  const exp = user?.expiresAt ?? null;

  useEffect(() => {
    if (!user || !exp || user.isAdmin) return;
    const t = new Date(exp).getTime();
    if (!Number.isFinite(t) || t > Date.now()) return;
    if (new Date(exp).getFullYear() >= ANO_VITALICIO) return;

    const chave = `gs_trial_exp_modal_${user.id}_${exp}`;
    try {
      if (localStorage.getItem(chave)) return;
      localStorage.setItem(chave, "1");
    } catch {
      /* storage bloqueado: mostra mesmo assim (pode repetir no reload) */
    }
    setAberto(true);
  }, [user, exp]);

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trial-expirado-titulo"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
    >
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-warn/40 bg-warn/10 text-warn">
            <Clock size={18} />
          </span>
          <button
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-panel2 text-mut"
          >
            <X size={14} />
          </button>
        </div>

        <h2 id="trial-expirado-titulo" className="mt-3 font-display text-lg font-bold uppercase leading-tight text-ink">
          Seu período de teste de 24h acabou
        </h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-mut">
          A conta continua ativa, sem perder nada do que você fez. O que muda é o ritmo:
        </p>

        <ul className="mt-3 space-y-1.5">
          {[
            "1 análise grátis por dia — o contador zera à meia-noite (Brasília)",
            "Placares, ligas, classificação e estatísticas seguem abertos",
            "Notificações de gol continuam se você ligou o alerta",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2 text-[11px] font-semibold text-ink">
              <Check size={13} className="mt-0.5 shrink-0 text-good" />
              {t}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={() => setAberto(false)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-acc px-4 text-[13px] font-black text-black"
          >
            Continuar no grátis
          </button>
          <Link
            href="/login?next=/jogos"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-panel2 px-4 text-[13px] font-bold text-ink"
          >
            <LogIn size={14} /> Entrar com outra conta
          </Link>
        </div>

        <p className="mt-3 text-center text-[10px] font-bold text-mut">
          Não há assinatura nesta fase · plataforma de análise (18+)
        </p>
      </div>
    </div>
  );
}
