"use client";

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import type { CacheInfo } from "./types";

/** Barra de 10 quadradinhos mostrando o histórico (1 acertou, 0 não, x sem linha). */
export function Last10Bar({ bits }: { bits: string }) {
  if (!bits) return null;
  return (
    <span className="inline-flex gap-[2px]" aria-label={`Últimos 10: ${bits}`}>
      {bits.split("").map((ch, i) => {
        const color =
          ch === "1"
            ? "bg-acc"
            : ch === "0"
              ? "bg-danger/70"
              : "bg-line";
        return <span key={i} className={`w-[4px] h-3 rounded-[1px] ${color}`} />;
      })}
    </span>
  );
}

/** Pílula de taxa de acerto com cor proporcional. */
export function HitPill({ rate, label, tone }: { rate: number | null; label: string; tone: string }) {
  return (
    <span className={`inline-flex flex-col items-center leading-none ${tone}`}>
      <span className="text-[9px] font-bold text-mut uppercase tracking-wide">{label}</span>
      <span className="text-sm font-extrabold tabular-nums">{rate == null ? "—" : `${Math.round(rate)}%`}</span>
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

/** Rodapé discreto mostrando a origem do dado (cache vs rede). */
export function CacheBadge({ cache, onRefresh }: { cache?: CacheInfo; onRefresh?: () => void }) {
  if (!cache) return null;
  const label =
    cache.source === "memory" || cache.source === "db"
      ? `cache · ${cache.ageSeconds}s`
      : cache.source === "stale-fallback"
        ? `cache antigo · ${cache.ageSeconds}s`
        : "ao vivo";
  const stale = cache.source === "memory" || cache.source === "db" || cache.source === "stale-fallback";
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-mut">
      <span className="inline-flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${stale ? "bg-warn" : "bg-acc"}`} />
        {label} · TTL {Math.round(cache.ttlSeconds / 60)}min
      </span>
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-1 px-2 h-7 rounded-lg border border-line text-ink font-bold"
        >
          <RefreshCw size={11} /> Atualizar
        </button>
      )}
    </div>
  );
}

export function TeamBadge({ name, logo, size = 20 }: { name: string; logo?: string; size?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={size} height={size} className="shrink-0 object-contain" loading="lazy" />
      ) : (
        <span className="shrink-0 rounded-full bg-panel2" style={{ width: size, height: size }} />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}
