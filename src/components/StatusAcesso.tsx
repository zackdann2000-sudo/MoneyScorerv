"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Clock, Crown, Gauge } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { formatarRestante } from "@/lib/trialCountdown";

/**
 * Cartão de status do acesso no topo de /jogos.
 *
 * Motivo: a pessoa abria o app sem saber se estava nas 24h ou já no modo
 * 1-análise-por-dia, descobrindo o limite só quando batia nele. Aqui o estado
 * fica visível antes de qualquer clique — e sempre com o que É o caso hoje, sem
 * previsão inventada.
 *
 * Três estados, um por linha:
 *  - vitalício/admin
 *  - teste de 24h ativo (com contagem regressiva de minuto em minuto)
 *  - plano grátis (usado/limite do dia + hora do reset)
 */
const ANO_VITALICIO = 2090;

export default function StatusAcesso() {
  const { user, vip } = useApp();
  const [agora, setAgora] = useState(() => Date.now());

  // Só precisa atualizar o relógio quando há contagem para mostrar.
  useEffect(() => {
    if (!user || !vip) return;
    const t = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [user, vip]);

  if (!user) return null;

  const vitalicio =
    user.isAdmin ||
    (Boolean(user.expiresAt) && new Date(user.expiresAt as string).getFullYear() >= ANO_VITALICIO);

  const restante = user.expiresAt ? formatarRestante(user.expiresAt, agora) : null;
  const emTrial = Boolean(vip) && Boolean(restante) && !restante!.expirado && !vitalicio;

  const quota = user.quota;
  const limite = quota?.limite ?? 1;
  const restam = quota?.restante ?? limite;
  const usadas = Math.max(0, limite - restam);

  let icone = <Gauge size={15} />;
  let titulo = "Plano grátis";
  let detalhe = `${restam} de ${limite} análise${limite > 1 ? "s" : ""} hoje`;
  let cor = "text-ink";
  let borda = "border-line";

  if (vitalicio) {
    icone = <Crown size={15} />;
    titulo = "Acesso vitalício";
    detalhe = "Análises e estatísticas liberadas, sem contador";
    cor = "text-acc";
    borda = "border-acc/30";
  } else if (emTrial) {
    icone = <Clock size={15} />;
    titulo = "Teste de 24h";
    detalhe = `${restante!.texto} restantes · depois, 1 análise por dia`;
    cor = "text-acc";
    borda = "border-acc/30";
  } else if (quota?.esgotada) {
    detalhe = `0 de ${limite} análise${limite > 1 ? "s" : ""} hoje · volta à meia-noite`;
    cor = "text-warn";
    borda = "border-warn/30";
  }

  return (
    <Link
      href="/config"
      className={`mb-2 flex items-center gap-2.5 rounded-2xl border ${borda} bg-panel px-3 py-2.5`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-line bg-panel2 ${cor}`}>
        {icone}
      </span>

      <span className="min-w-0 flex-1">
        <span className={`block text-[11px] font-black uppercase tracking-wide ${cor}`}>{titulo}</span>
        <span className="block break-words text-[10px] font-semibold leading-snug text-mut">{detalhe}</span>
      </span>

      {/* barra do dia: só quando existe quota finita e não é vitalício */}
      {!vitalicio && !emTrial && limite > 1 && (
        <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
          {Array.from({ length: limite }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-3 rounded-full ${i < usadas ? "bg-line" : "bg-acc"}`}
            />
          ))}
        </span>
      )}

      <ChevronRight size={14} className="shrink-0 text-mut" />
    </Link>
  );
}
