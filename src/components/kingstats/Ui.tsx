"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

/** Horário curto de um kickoff (unix segundos) no fuso de Brasília. */
export function horaJogo(unix: string | number): string {
  const t = Number(unix) * 1000;
  if (!Number.isFinite(t)) return "--:--";
  return new Date(t).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Data curta (dd/mm) de um kickoff. */
export function diaCurto(unix: string | number): string {
  const t = Number(unix) * 1000;
  return new Date(t).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-mut text-xs">
      <Loader2 size={15} className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3 text-xs text-ink space-y-2">
      <div className="flex items-center gap-2 font-bold text-danger">
        <AlertTriangle size={14} /> Erro
      </div>
      <p className="text-mut break-words">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-xl border border-line text-[11px] font-bold"
        >
          <RefreshCw size={12} /> Tentar de novo
        </button>
      )}
    </div>
  );
}

export function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-6 text-center text-mut text-xs">
      {children}
    </div>
  );
}

/** Barra horizontal de probabilidade com rótulo. */
export function ProbBar({
  valor,
  label,
  destaque = false,
}: {
  valor: number; // 0..100
  label?: string;
  destaque?: boolean;
}) {
  const v = Math.max(0, Math.min(100, valor));
  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-mut">{label}</span>
          <span className={`tabular-nums font-bold ${destaque ? "text-acc" : "text-ink"}`}>
            {v.toFixed(0)}%
          </span>
        </div>
      )}
      <div className="h-1.5 rounded-full bg-panel2 overflow-hidden">
        <div
          className={`h-full rounded-full ${destaque ? "bg-acc" : "bg-acc/60"}`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}

/** Sequência W/D/L como bolinhas coloridas. */
export function FormBadges({ form }: { form: string }) {
  if (!form) return <span className="text-[10px] text-mut">—</span>;
  return (
    <span className="inline-flex gap-0.5">
      {form.split("").map((r, i) => {
        const cor =
          r === "W" ? "bg-acc text-bg" : r === "D" ? "bg-panel2 text-ink" : "bg-danger/80 text-white";
        return (
          <span
            key={i}
            className={`w-3.5 h-3.5 rounded-[4px] text-[8px] font-extrabold inline-flex items-center justify-center ${cor}`}
          >
            {r}
          </span>
        );
      })}
    </span>
  );
}

/** Etiqueta de categoria do mercado (FT / HT / BTTS). */
export function CatBadge({ cat }: { cat: string }) {
  const rotulo = cat === "ht" ? "HT" : cat === "btts" ? "BTTS" : "FT";
  const cor =
    cat === "ht"
      ? "bg-purple/20 text-purple border-purple/30"
      : cat === "btts"
        ? "bg-cyanx/20 text-cyanx border-cyanx/30"
        : "bg-acc/15 text-acc border-acc/30";
  return (
    <span className={`px-1.5 h-4 rounded-md border text-[9px] font-extrabold inline-flex items-center ${cor}`}>
      {rotulo}
    </span>
  );
}

/** Rodapé com a hora de geração do dado. */
export function FonteBadge({ geradoEm, stale }: { geradoEm?: string; stale?: boolean }) {
  if (!geradoEm) return null;
  const d = new Date(geradoEm);
  const hora = d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <p className="text-[9px] text-mut text-center pt-1">
      Fonte: The King STATS · atualizado {hora}
      {stale ? " (pode estar defasado)" : ""}
    </p>
  );
}
