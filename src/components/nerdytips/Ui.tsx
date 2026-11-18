"use client";

/** Peças visuais do módulo /nerdytips (mesmo padrão dark/verde do projeto). */
import { AlertTriangle, Check, Clock, Minus, X } from "lucide-react";
import { odd } from "@/lib/utils/odds";
import type { CacheInfo, Pick, Status } from "./types";

export function Spinner({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-6 justify-center text-mut text-xs">
      <span className="h-3.5 w-3.5 rounded-full border-2 border-mut/30 border-t-acc animate-spin" />
      {label}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3 space-y-2">
      <div className="flex items-start gap-2 text-[11px] text-red-300">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="h-7 px-3 rounded-xl bg-red-500/15 text-red-200 text-[11px] font-bold"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}

export function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-panel/60 p-4 text-center text-[11px] text-mut leading-relaxed">
      {children}
    </div>
  );
}

export function CacheBadge({ cache }: { cache?: CacheInfo }) {
  if (!cache) return null;
  const idade =
    cache.ageSeconds < 60
      ? `${cache.ageSeconds}s`
      : cache.ageSeconds < 3600
        ? `${Math.round(cache.ageSeconds / 60)}min`
        : `${Math.round(cache.ageSeconds / 3600)}h`;
  const cor = cache.source === "stale" ? "text-amber-300" : "text-mut";
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-bold ${cor}`}>
      <Clock size={9} />
      {cache.source === "stale" ? "cache antigo" : "cache"} {idade}
    </span>
  );
}

/** Confiança de 0 a 10 em bolinhas (mesma leitura do site). */
export function ConfBar({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-[10px] text-mut">—</span>;
  const cheios = Math.round(Math.max(0, Math.min(10, valor)));
  return (
    <span className="inline-flex items-center gap-1" title={`Confiança ${valor.toFixed(1)}/10`}>
      <span className="flex gap-[2px]">
        {Array.from({ length: 10 }).map((_, i) => (
          <i
            key={i}
            className={`h-2.5 w-[3px] rounded-sm ${i < cheios ? "bg-acc" : "bg-mut/20"}`}
          />
        ))}
      </span>
      <span className="text-[10px] font-extrabold tabular-nums text-ink">{valor.toFixed(1)}</span>
    </span>
  );
}

const RESULTADO: Record<Status, { icone: typeof Check; cor: string }> = {
  won: { icone: Check, cor: "text-emerald-400 bg-emerald-400/10" },
  lost: { icone: X, cor: "text-red-400 bg-red-400/10" },
  void: { icone: Minus, cor: "text-mut bg-mut/10" },
  pending: { icone: Minus, cor: "text-mut bg-mut/10" },
};

export function ResultadoPill({ status }: { status: Status }) {
  if (status === "pending") return null;
  const { icone: Icone, cor } = RESULTADO[status];
  return (
    <span className={`inline-flex items-center justify-center h-4 w-4 rounded-full ${cor}`}>
      <Icone size={10} />
    </span>
  );
}

/** Chip de um palpite: rótulo em português + odd. */
export function PickChip({ pick, forte = false }: { pick: Pick | null; forte?: boolean }) {
  if (!pick) return null;
  return (
    <span
      className={`inline-flex items-baseline gap-1 h-6 px-2 rounded-lg text-[10px] font-bold whitespace-nowrap ${
        forte ? "bg-acc/15 text-acc" : "bg-panel border border-line text-ink"
      }`}
    >
      {pick.texto || pick.rotulo}
      {pick.odd != null && <b className="tabular-nums text-[10px] font-extrabold">{pick.odd.toFixed(2)}</b>}
    </span>
  );
}

/**
 * Odd solta com cor de mercado (casa/empate/fora).
 *
 * Passa por `odd()` mesmo recebendo número: se um payload antigo de cache ainda
 * trouxer odd americana (-149), a tela mostra 1.67 em vez de "-149.00".
 */
export function Odd({ valor, destaque = false }: { valor: number | null; destaque?: boolean }) {
  const v = odd(valor);
  if (v == null) return <span className="text-[10px] text-mut">—</span>;
  return (
    <span
      className={`text-[11px] font-extrabold tabular-nums ${destaque ? "text-acc" : "text-ink/90"}`}
    >
      {v.toFixed(2)}
    </span>
  );
}
