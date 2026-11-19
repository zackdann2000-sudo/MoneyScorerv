"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/context/AppContext";
import { formatarRestante } from "@/lib/trialCountdown";

/**
 * Banner de urgência do trial de 24h, abaixo do header.
 *
 * - Ativo: contador "Acesso VIP expira em: 23h 59m" em verde neon.
 * - Expirado: "Seu período VIP expirou. Assine para continuar" + CTA.
 *
 * Não aparece para admin/dono (vitalício) nem para conta sem expiração.
 * O relógio é local (client) e recalcula a cada 15s — barato e suficiente
 * para exibir horas/minutos.
 */
const ANO_VITALICIO = 2090;

export default function TrialBanner() {
  const { user } = useApp();
  const [agora, setAgora] = useState(() => Date.now());

  const exp = user?.expiresAt ?? null;
  const temExpiracao = Boolean(exp) && !user?.isAdmin &&
    new Date(exp as string).getFullYear() < ANO_VITALICIO;

  useEffect(() => {
    if (!temExpiracao) return;
    const id = setInterval(() => setAgora(Date.now()), 15000);
    return () => clearInterval(id);
  }, [temExpiracao]);

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
          Seu período VIP expirou. Assine para continuar
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