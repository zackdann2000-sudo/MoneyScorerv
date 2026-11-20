"use client";
import { useEffect, useState } from "react";
import { Gavel, Sparkles } from "lucide-react";
import type { Veredito } from "@/lib/vereditoEngine";
import { LadderGols, type LadderInfo } from "@/components/match/LadderGols";

/**
 * Bloco "Veredito Estatístico" da aba Pré-Live.
 *
 * Os números vêm de `/api/matches/[id]/analysis` (forma 70% + H2H 30%) — o
 * motor roda no servidor, onde os históricos já estão carregados. Se a partida
 * não tem base suficiente, o bloco avisa em vez de mostrar probabilidade solta.
 */
export function VereditoBlock({ matchId }: { matchId: string }) {
  const [v, setV] = useState<Veredito | null>(null);
  const [ladder, setLadder] = useState<LadderInfo>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    fetch(`/api/matches/${matchId}/analysis`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j?.ladder) setLadder(j.ladder as LadderInfo);
        if (j?.veredito) setV(j.veredito as Veredito);
        else setErro(j?.error || "sem-base");
      })
      .catch(() => vivo && setErro("rede"))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [matchId]);

  if (carregando) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-3.5">
        <div className="skeleton h-4 w-40" />
        <div className="mt-2 skeleton h-14" />
      </div>
    );
  }

  if (!v) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-panel p-3.5">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-mut">
            <Gavel className="h-3.5 w-3.5" /> veredito estatístico
          </div>
          <p className="mt-1 text-[11px] leading-snug text-mut">
            Sem dados suficientes para cruzar forma e confrontos diretos nesta partida. Preferimos não
            dar veredito a chutar.
          </p>
        </div>
        <LadderGols ladder={ladder} />
      </div>
    );
  }

  const p = v.probs;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const corConf = v.confianca === "alta" ? "text-good border-good/40 bg-good/10" : v.confianca === "media" ? "text-warn border-warn/40 bg-warn/10" : "text-mut border-line bg-panel2";

  const linhas: { rotulo: string; valor: number; destaque?: boolean }[] = [
    { rotulo: "Mandante", valor: p.home, destaque: true },
    { rotulo: "Empate", valor: p.draw },
    { rotulo: "Visitante", valor: p.away, destaque: true },
    { rotulo: "Over 2.5", valor: p.over25, destaque: true },
    { rotulo: "BTTS", valor: p.btts, destaque: true },
  ];
  const max = Math.max(p.home, p.draw, p.away);
  const favorito = max === p.home ? "mandante" : max === p.away ? "visitante" : "empate";

  return (
    <div className="space-y-4">
    <div className="rounded-2xl border border-acc/25 bg-panel p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-acc">
          <Gavel className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">veredito estatístico</span>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${corConf}`}>
          confiança {v.confianca}
        </span>
      </div>

      {/* frase-resumo pedida no produto */}
      <p className="mt-1.5 text-[12px] font-bold leading-snug text-txt">
        Vitória do mandante {pct(p.home)} · Over 2.5 {pct(p.over25)} · BTTS {pct(p.btts)}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {linhas.map((l) => (
          <div key={l.rotulo} className="min-w-0 rounded-xl border border-line bg-panel2 px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-1">
              <span className="min-w-0 truncate text-[9px] font-black uppercase tracking-wide text-mut">{l.rotulo}</span>
              <span className={`shrink-0 text-[13px] font-black tabular-nums ${l.destaque ? "text-acc" : "text-txt"}`}>{pct(l.valor)}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
              <div className={`h-full rounded-full ${l.destaque ? "bg-acc" : "bg-mut"}`} style={{ width: `${Math.min(100, Math.round(l.valor * 100))}%` }} />
            </div>
          </div>
        ))}
        {v.cartoes && (
          <div className="min-w-0 rounded-xl border border-line bg-panel2 px-2 py-1.5">
            <div className="flex items-baseline justify-between gap-1">
              <span className="min-w-0 truncate text-[9px] font-black uppercase tracking-wide text-mut">Cartões +3.5</span>
              <span className="shrink-0 text-[13px] font-black tabular-nums text-txt">{pct(v.cartoes.over35)}</span>
            </div>
            <div className="mt-1 text-[9px] font-bold text-mut">média {v.cartoes.media.toFixed(2)} por jogo</div>
          </div>
        )}
      </div>

      {/* justificativa com números reais */}
      <p className="mt-2 text-[11px] leading-snug text-mut">{v.texto}</p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[9px] font-bold text-mut">
        <Sparkles className="h-3 w-3 text-acc" />
        <span>favorito: {favorito}</span>
        <span>·</span>
        <span>λ {v.lambdas.casa.toFixed(2)} × {v.lambdas.fora.toFixed(2)}</span>
        <span>·</span>
        <span>base {v.base.jogosCasa}+{v.base.jogosFora} jogos, {v.base.jogosH2H} H2H</span>
      </div>
      <p className="mt-1 text-[9px] leading-snug text-mut/80">{v.motivoConfianca}</p>
    </div>

    <LadderGols ladder={ladder} />
    </div>
  );
}

export default VereditoBlock;
