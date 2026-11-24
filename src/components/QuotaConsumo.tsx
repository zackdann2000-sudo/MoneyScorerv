"use client";

/**
 * Consome 1 análise da quota diária ao abrir a partida.
 *
 * O contador é do SERVIDOR (`/api/quota`), não do localStorage — o local só
 * evita bater na API de novo quando a mesma partida é reaberta no mesmo dia.
 * Se a quota acabou, o paywall aparece aqui, em cima da análise, que é o
 * momento em que a pessoa já demonstrou interesse.
 */
import { useEffect, useState } from "react";
import PaywallCard from "@/components/PaywallCard";
import { useApp } from "@/context/AppContext";
import { jaConsumiuHoje, marcarConsumido } from "@/lib/quotaLocal";

export default function QuotaConsumo({ id }: { id: string }) {
  const { user, vip } = useApp();
  const [bloqueado, setBloqueado] = useState(false);
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    // Sem login ou com VIP/admin: nada a consumir.
    if (!user || vip) return;
    if (user.quota?.ilimitada) return;
    // Mesma chave usada pelo LimiteAnaliseGuard (fonte única em lib/quotaLocal).
    if (jaConsumiuHoje(id)) return;
    let vivo = true;
    fetch("/api/quota", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        /* Só marca quando o servidor DEBITOU. Antes a chave era gravada mesmo no
           bloqueio, e reabrir a mesma partida pulava o fetch — ou seja, quem
           estourava a quota via a análise no reload. */
        if (j?.liberado !== false) marcarConsumido(id);
        setRestante(j?.quota?.restante ?? null);
        if (j && j.liberado === false) setBloqueado(true);
      })
      .catch(() => {});
    return () => { vivo = false; };
  }, [id, user, vip]);

  if (!bloqueado) return null;
  return (
    <div className="mb-2">
      <PaywallCard reason="quota" compacto />
      {restante === 0 && (
        <p className="mt-1 text-center text-[10px] text-mut">
          O contador zera à meia-noite (horário de Brasília). A análise continua aqui amanhã.
        </p>
      )}
    </div>
  );
}
