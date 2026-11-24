"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { formatarRestante } from "@/lib/trialCountdown";

/**
 * Banner do acesso com prazo (trial de 24h e assinatura), abaixo do header.
 *
 * - Ativo: contador "Acesso VIP expira em: 23h 59m" em verde neon.
 * - Expirado: o acesso não fecha mais a porta — a conta cai no Free de 1
 *   análise por dia (`planoEfetivo` rebaixa na leitura). Por isso o texto
 *   avisa o que continua liberado e oferece mais, em vez de anunciar bloqueio.
 *
 * Não aparece para admin/dono (vitalício) nem para conta sem expiração.
 * O relógio é local (client) e recalcula a cada 15s — barato e suficiente
 * para exibir horas/minutos.
 */
const ANO_VITALICIO = 2090;

export default function TrialBanner() {
  const { user, addToast } = useApp();
  const [agora, setAgora] = useState(() => Date.now());

  const exp = user?.expiresAt ?? null;
  const temExpiracao = Boolean(exp) && !user?.isAdmin &&
    new Date(exp as string).getFullYear() < ANO_VITALICIO;

  useEffect(() => {
    if (!temExpiracao) return;
    const id = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(id);
  }, [temExpiracao]);

  // Toast de fim de trial: dispara UMA vez por usuário+expiração (localStorage).
  /*
   * O aviso de fim do trial virou modal (TrialExpiradoModal): toast de 3s não
   * explicava a mudança de ritmo e ainda duplicava a mensagem. Aqui só fica o
   * contador/banner que abre /config.
   */
  const expiradoAgora = Boolean(exp) && temExpiracao && formatarRestante(exp as string, agora).expirado;

  if (!user || !temExpiracao) return null;

  const restante = formatarRestante(exp as string, agora);
  const { texto } = restante;
  const expirado = restante.expirado;
  return (
    <div className="max-w-3xl mx-auto px-3 pt-2">
      {expirado ? (
        <Link
          href="/config"
          className="flex items-center justify-center gap-2 rounded-xl border border-danger/50 bg-danger/10 px-3 py-2 text-[11px] font-extrabold text-danger"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-danger shrink-0" />
          Seu período VIP terminou · 1 análise grátis/dia
        </Link>
      ) : (
        <Link
          href="/config"
          className="flex items-center justify-center gap-2 rounded-xl border border-emerald-400/60 bg-emerald-400/10 px-3 py-2 text-[11px] font-extrabold text-emerald-300 shadow-[0_0_14px_-2px_rgba(52,211,153,0.55)]"
        >
          <span className="relative flex w-1.5 h-1.5 shrink-0">
            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </span>
          Acesso VIP expira em: <span className="tabular-nums">{texto}</span>
        </Link>
      )}
    </div>
  );
}