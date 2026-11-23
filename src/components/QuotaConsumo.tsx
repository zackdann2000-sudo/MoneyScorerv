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

export default function QuotaConsumo({ id }: { id: string }) {
  const { user, vip } = useApp();
  const [bloqueado, setBloqueado] = useState(false);
  const [restante, setRestante] = useState<number | null>(null);

  useEffect(() => {
    // Sem login ou com VIP/admin: nada a consumir.
    if (!user || vip) return;
    if (user.quota?.ilimitada) return;
    const dia = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const chave = `gs_q_${dia}_${id}`;
    try {
      if (localStorage.getItem(chave)) return;
    } catch {}
    let vivo = true;
    fetch("/api/quota", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        try { localStorage.setItem(chave, "1"); } catch {}
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
