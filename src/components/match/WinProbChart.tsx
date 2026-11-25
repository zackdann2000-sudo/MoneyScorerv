"use client";
import { useMemo } from "react";
import { Activity } from "lucide-react";
import type { PontoProb, WinProbPayload } from "@/lib/winProb";

/** Cores fixas das três linhas (mesmas do resto dos gráficos). */
const COR = { casa: "#22e06b", empate: "#e8b923", fora: "#ff5d73" };

const fmt = (v: number) => `${Math.round(v)}%`;

/**
 * Gráfico de probabilidade de vitória AO VIVO.
 *
 * As três linhas (mandante, empate, visitante) são calculadas em
 * `lib/winProb.ts` a partir do placar, do tempo de jogo e do momentum. É um
 * componente de apresentação: quem busca os dados é a aba LIVE, para não
 * duplicar requisição de narração da ESPN.
 */
export default function WinProbChart({
  dados,
  home,
  away,
  finished = false,
}: {
  dados: WinProbPayload | null;
  home: string;
  away: string;
  /** Jogo encerrado: congela em "Probabilidade final" e mostra o placar final. */
  finished?: boolean;
}) {
  const serie = dados?.serie || [];
  const atual = dados?.atual || null;

  const caminhos = useMemo(() => {
    if (serie.length < 2) return null;
    const L = 100;
    const A = 40;
    const px = (i: number) => (i / (serie.length - 1)) * L;
    const py = (v: number) => A - (Math.max(0, Math.min(100, v)) / 100) * A;
    const linha = (k: "casa" | "empate" | "fora") =>
      serie.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(2)},${py(p[k]).toFixed(2)}`).join(" ");
    return { casa: linha("casa"), empate: linha("empate"), fora: linha("fora") };
  }, [serie]);

  if (!atual) {
    return (
      <div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-acc" />
          <p className="text-[10px] font-bold uppercase tracking-wide text-mut">
            {finished ? "Probabilidade final" : "Probabilidade ao vivo"}
          </p>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-mut">
          {finished
            ? "O modelo não chegou a calcular probabilidades nesta partida (sem lance a lance da fonte)."
            : "Aparece no apito inicial. Antes do jogo não existe placar nem pressão para recalcular — e inventar um número aqui seria vender certeza que a fonte não tem."}
        </p>
      </div>
    );
  }

  /*
   * Jogo encerrado: "ao vivo" deixa de fazer sentido. Com o placar final
   * definido, a probabilidade não é mais estimativa — é o resultado: 100% para
   * quem venceu, 100% no empate se terminou igual. É o valor do modelo no apito
   * final, só que travado (o gráfico abaixo continua sendo a série histórica).
   */
  const congelado = ((): { casa: number; empate: number; fora: number } | null => {
    if (!finished) return null;
    const c = Number(atual.placar?.casa ?? 0);
    const f = Number(atual.placar?.fora ?? 0);
    if (c > f) return { casa: 100, empate: 0, fora: 0 };
    if (f > c) return { casa: 0, empate: 0, fora: 100 };
    return { casa: 0, empate: 100, fora: 0 };
  })();

  const linhas: { id: "casa" | "empate" | "fora"; nome: string; valor: number }[] = [
    { id: "casa", nome: home, valor: congelado ? congelado.casa : atual.casa },
    { id: "empate", nome: "Empate", valor: congelado ? congelado.empate : atual.empate },
    { id: "fora", nome: away, valor: congelado ? congelado.fora : atual.fora },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-acc" />
          <p className="text-[10px] font-bold uppercase tracking-wide text-mut">
            {congelado ? "Probabilidade final" : `Probabilidade ao vivo · ${atual.minuto}'`}
          </p>
        </div>
        <span className="text-[9px] font-bold text-mut">
          {atual.placar.casa}–{atual.placar.fora}
          {congelado ? " · encerrado" : ""}
        </span>
      </div>

      {caminhos ? (
        <div className="rounded-xl border border-line bg-panel2 p-2">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-24 w-full">
            {[25, 50, 75].map((y) => (
              <line
                key={y}
                x1="0"
                y1={40 - (y / 100) * 40}
                x2="100"
                y2={40 - (y / 100) * 40}
                stroke="currentColor"
                className="text-line"
                strokeWidth="0.3"
                strokeDasharray="1.5 1.5"
              />
            ))}
            <path d={caminhos.fora} fill="none" stroke={COR.fora} strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" />
            <path d={caminhos.empate} fill="none" stroke={COR.empate} strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" />
            <path d={caminhos.casa} fill="none" stroke={COR.casa} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <div className="mt-0.5 flex justify-between text-[8px] font-bold text-mut">
            <span>{serie[0]?.min}&apos;</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>{serie[serie.length - 1]?.min}&apos;</span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-mut">Precisa de pelo menos dois minutos de jogo para desenhar a linha.</p>
      )}

      {/* legenda com o número atual de cada resultado */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {linhas.map((l) => (
          <div key={l.id} className="rounded-lg border border-line bg-panel2 px-1 py-1.5">
            <p className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase text-mut">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: COR[l.id] }} />
              <span className="truncate">{l.nome}</span>
            </p>
            <p className="font-display text-lg font-bold tabular-nums" style={{ color: COR[l.id] }}>
              {fmt(l.valor)}
            </p>
          </div>
        ))}
      </div>

      <p className="text-[9px] leading-snug text-mut/80">
        Placar atual + Poisson dos gols que faltam, com o ritmo de xG dos lances e o momentum dos últimos 15 min
        (peso {atual.lambdaRestante.casa.toFixed(2)} × {atual.lambdaRestante.fora.toFixed(2)} gols restantes).
      </p>
    </div>
  );
}
