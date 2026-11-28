"use client";

/**
 * Aviso de cota da análise diária (LEITURA, sem debitar nada).
 *
 * QUEM DEBITA É O SERVIDOR: a rota `/api/matches/[id]/analysis` consome a cota
 * no banco depois de calcular. Antes esta peça disparava `POST /api/quota` a
 * partir do `localStorage` — o que fazia do browser a autoridade sobre o limite
 * (limpar o storage liberava análises ilimitadas). Agora o componente só LÊ o
 * estado (`GET /api/quota`) e mostra a linha de "essa foi sua análise grátis de
 * hoje" quando o servidor confirma que ESTA partida foi a que gastou a cota.
 *
 * Se a cota acabou e a partida aberta não foi a que gastou, o bloqueio aparece
 * dentro da aba de análise (402 da rota), não aqui — um aviso só, no lugar certo.
 */
import { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";

type RespostaQuota = {
  logado?: boolean;
  quota?: { restante?: number; esgotada?: boolean } | null;
  partidasHoje?: string[];
};

export default function QuotaConsumo({ id }: { id: string }) {
  const { user, vip } = useApp();
  const [restante, setRestante] = useState<number | null>(null);
  const [contouEsta, setContouEsta] = useState(false);

  useEffect(() => {
    // Sem login ou com acesso completo: não há cota a explicar.
    if (!user || vip || user.quota?.ilimitada) return;
    let vivo = true;

    const ler = () =>
      fetch("/api/quota", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: RespostaQuota) => {
          if (!vivo || !j?.logado || !j.quota) return;
          setRestante(typeof j.quota.restante === "number" ? j.quota.restante : null);
          setContouEsta((j.partidasHoje ?? []).includes(id));
        })
        .catch(() => {});

    ler();
    /* Segunda leitura: a rota de análise debita em paralelo a este mount, então
       o primeiro GET pode chegar antes do débito. É só leitura — idempotente. */
    const t = setTimeout(ler, 2500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [id, user, vip]);

  if (!user || vip || user.quota?.ilimitada) return null;
  if (!contouEsta || restante !== 0) return null;

  return (
    <div className="mb-2">
      <p className="rounded-xl border border-line bg-panel px-3 py-2 text-[10px] font-semibold leading-snug text-mut">
        Essa foi sua análise grátis de hoje. A próxima volta à meia-noite (Brasília) — placares e
        estatísticas continuam abertos até lá.
      </p>
    </div>
  );
}
