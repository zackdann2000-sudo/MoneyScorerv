"use client";
import { useMemo, useState } from "react";
import { SourceFoot } from "./ui";

export type MatrixRow = { name: string; jogos: number; gols: number[]; assistencias: number[]; amarelos: number[]; vermelhos: number[]; participacoes: number[] };
const CATS = [
  { id: "participacoes", label: "G+A" }, { id: "gols", label: "Gols" }, { id: "assistencias", label: "Assistências" },
  { id: "amarelos", label: "Amarelos" }, { id: "vermelhos", label: "Vermelhos" },
];
export default function Last10Matrix({ rows, teamName, xiNames, fonte = "ESPN" }: { rows: MatrixRow[]; teamName: string; xiNames?: string[]; fonte?: string }) {
  const [cat, setCat] = useState<string>("participacoes");
  const [soEscalacao, setSoEscalacao] = useState(false);
  const [comReservas, setComReservas] = useState(true);

  const list = useMemo(() => {
    let l = rows.map((r) => {
      const vals = (r as any)[cat] as number[];
      const total = vals.reduce((s, v) => s + v, 0);
      return { ...r, vals, total, media: r.jogos ? total / r.jogos : 0 };
    }).filter((r) => r.total > 0);
    if (soEscalacao && xiNames?.length) l = l.filter((r) => xiNames.some((n) => n.toLowerCase().includes(r.name.toLowerCase().split(" ").slice(-1)[0]) || r.name.toLowerCase().includes(n.toLowerCase().split(" ").slice(-1)[0])));
    if (!comReservas && xiNames?.length) l = l.filter((r) => xiNames.some((n) => n.toLowerCase().includes(r.name.toLowerCase().split(" ").slice(-1)[0])));
    return l.sort((a, b) => b.total - a.total || b.media - a.media).slice(0, 15);
  }, [rows, cat, soEscalacao, comReservas, xiNames]);

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2">
        {CATS.map((c) => (
          <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border ${cat === c.id ? "bg-acc text-black border-acc" : "bg-panel border-line text-mut"}`}>{c.label}</button>
        ))}
        </div>
      <p className="text-[10px] text-mut pb-2">Finalizações, desarmes e defesas por jogador não vêm na ESPN. A matriz mostra só gols, assistências e cartões dos jogos reais.</p>
      <div className="flex gap-4 pb-2 text-[11px] text-mut">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={soEscalacao} onChange={(e) => setSoEscalacao(e.target.checked)} className="accent-[var(--acc)]" /> Só escalação</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={comReservas} onChange={(e) => setComReservas(e.target.checked)} className="accent-[var(--acc)]" /> + Reservas</label>
      </div>
      {list.length === 0 && <p className="text-xs text-mut py-4 text-center">Nenhum jogador com eventos nesta categoria na amostra.</p>}

      {/* Cabeçalho fixo das colunas da matriz — evita o usuário ter de deduzir
          o que cada bolinha representa. `top-0` mantém a referência visível
          enquanto a lista rola. */}
      {list.length > 0 && (
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur-sm pt-1 pb-1.5 mb-1">
          <div className="flex items-center gap-2 px-2.5">
            <span className="w-6 shrink-0 text-center text-[8px] font-extrabold uppercase text-mut">#</span>
            <span className="flex-1 text-[8px] font-extrabold uppercase text-mut">Jogador</span>
            <span className="shrink-0 text-[8px] font-extrabold uppercase text-mut">{CATS.find((c) => c.id === cat)?.label}</span>
          </div>
          <div className="flex items-center gap-2 px-2.5 mt-1">
            <span className="w-6 shrink-0" />
            <span className="flex-1 text-[8px] text-mut/80">10 jogos · antigo → recente</span>
            <div className="flex gap-1 shrink-0">
              {Array.from({ length: 10 }).map((_, j) => (
                <span key={j} className="w-6 text-center text-[7px] font-bold text-mut/70">
                  {j === 0 ? "1" : j === 9 ? "10" : "·"}
                </span>
              ))}
            </div>
          </div>
          {/* Legenda das cores das bolinhas. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 mt-1.5 text-[8px] text-mut">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-acc" /> acima da média
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-acc/30 border border-acc/40" /> registrou
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-panel2 border border-line" /> zero
            </span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {list.map((r, i) => (
          <div key={r.name} className="bg-panel border border-line rounded-xl p-2.5">
            <div className="flex items-center gap-2">
              <span className={`font-display font-bold text-sm w-6 text-center ${i < 3 ? "text-acc" : "text-mut"}`}>{i + 1}º</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold truncate">{r.name}</p>
                <p className="text-[10px] text-mut">{teamName} · Média: {r.media.toFixed(2)} · {r.jogos} jogos</p>
              </div>
              <span className="font-display font-bold text-lg text-acc">{r.total}</span>
            </div>
            <div className="flex gap-1 mt-2 justify-between">
              {r.vals.map((v, j) => (
                <span key={j} title={`${v} neste jogo`} className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold border ${v >= Math.max(r.media, 1) ? "bg-acc text-black border-acc" : v > 0 ? "bg-acc/30 text-ink border-acc/40" : "bg-panel2 text-mut border-line"}`}>{v}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <SourceFoot fonte={fonte} amostra={rows[0]?.jogos} extra="Círculos = valor por jogo (mais antigo → recente)" />
    </div>
  );
}