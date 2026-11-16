"use client";

import { AlertTriangle, Loader2, RefreshCw, Flame, TrendingUp, Minus } from "lucide-react";

/** Cor por nível de desajuste — verde forte para o melhor, neutro para o resto. */
export function corNivel(nivel: string): { texto: string; fundo: string; borda: string; rotulo: string } {
  if (nivel === "quente")
    return { texto: "text-acc", fundo: "bg-acc/15", borda: "border-acc/40", rotulo: "QUENTE" };
  if (nivel === "bom")
    return { texto: "text-warn", fundo: "bg-warn/15", borda: "border-warn/40", rotulo: "BOM" };
  return { texto: "text-mut", fundo: "bg-panel2", borda: "border-line", rotulo: "NEUTRO" };
}

export function IconeNivel({ nivel }: { nivel: string }) {
  if (nivel === "quente") return <Flame size={11} />;
  if (nivel === "bom") return <TrendingUp size={11} />;
  return <Minus size={11} />;
}

/** Selo compacto do nível (quente/bom/neutro). */
export function NivelBadge({ nivel }: { nivel: string }) {
  const c = corNivel(nivel);
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-extrabold tracking-wide ${c.fundo} ${c.borda} ${c.texto}`}
    >
      <IconeNivel nivel={nivel} /> {c.rotulo}
    </span>
  );
}

/**
 * Edge (vantagem do modelo sobre o mercado) formatado com sinal e cor.
 * Verde = modelo vê mais chance que o mercado paga.
 */
export function EdgeText({ edge, size = "sm" }: { edge: number; size?: "sm" | "xs" }) {
  const pct = edge * 100;
  const cor = pct >= 8 ? "text-acc" : pct >= 3 ? "text-warn" : "text-mut";
  const cls = size === "xs" ? "text-[10px]" : "text-xs";
  return (
    <span className={`${cor} ${cls} font-extrabold tabular-nums`}>
      {pct >= 0 ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  );
}

/**
 * Barra de probabilidade: mostra modelo × mercado lado a lado.
 * Duas marcas no mesmo trilho — é o jeito mais honesto de comparar.
 */
export function ProbBar({ modelo, mercado }: { modelo: number; mercado: number }) {
  const m = Math.max(0, Math.min(1, modelo));
  const k = Math.max(0, Math.min(1, mercado));
  return (
    <div className="space-y-1">
      <div className="relative h-1.5 rounded-full bg-panel2 overflow-hidden">
        {/* Mercado ao fundo (mais largo), modelo na frente */}
        <div className="absolute inset-y-0 left-0 bg-mut/40" style={{ width: `${k * 100}%` }} />
        <div className="absolute inset-y-0 left-0 bg-acc" style={{ width: `${m * 100}%` }} />
      </div>
      <div className="flex justify-between text-[9px] font-bold text-mut tabular-nums">
        <span>
          modelo <span className="text-acc">{Math.round(m * 100)}%</span>
        </span>
        <span>
          mercado <span className="text-ink">{Math.round(k * 100)}%</span>
        </span>
      </div>
    </div>
  );
}

/** QI em círculo pequeno, com cor por faixa. */
export function QiPill({ qi }: { qi: number }) {
  const cor = qi >= 65 ? "text-acc" : qi >= 50 ? "text-ink" : "text-mut";
  return (
    <span className="inline-flex flex-col items-center leading-none">
      <span className="text-[8px] font-bold text-mut uppercase tracking-wide">QI</span>
      <span className={`text-xs font-extrabold tabular-nums ${cor}`}>{qi.toFixed(0)}</span>
    </span>
  );
}

export function ValorPill({ valor }: { valor: number }) {
  const cor = valor >= 70 ? "text-acc" : valor >= 50 ? "text-warn" : "text-mut";
  return (
    <span className="inline-flex flex-col items-center leading-none">
      <span className="text-[8px] font-bold text-mut uppercase tracking-wide">Valor</span>
      <span className={`text-xs font-extrabold tabular-nums ${cor}`}>{valor.toFixed(0)}</span>
    </span>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-mut text-sm">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm">
      <div className="flex items-center gap-2 font-bold text-danger">
        <AlertTriangle size={16} /> Falha ao carregar
      </div>
      <p className="text-mut mt-1 break-words">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-1.5 px-3 h-9 rounded-xl border border-line text-ink text-xs font-bold"
        >
          <RefreshCw size={13} /> Tentar de novo
        </button>
      )}
    </div>
  );
}

export function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-8 text-center text-mut text-sm">{children}</div>
  );
}

/** Rodapé com a idade do dado (o site gera a semana de uma vez). */
export function FonteBadge({ geradoEm, stale }: { geradoEm?: string; stale?: boolean }) {
  if (!geradoEm) return null;
  const d = new Date(geradoEm);
  const quando = Number.isNaN(d.getTime())
    ? geradoEm
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center justify-between gap-2 text-[10px] text-mut">
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${stale ? "bg-warn" : "bg-acc"}`} />
        fonte SportMonks · gerado {quando}
      </span>
    </div>
  );
}

/** Formata o horário do kickoff no fuso de Brasília. */
export function horaJogo(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return "--:--";
  }
}

/** Data curta (ex.: "16/11"). */
export function diaCurto(dia: string): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}
