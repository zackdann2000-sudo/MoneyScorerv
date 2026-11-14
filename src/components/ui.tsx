"use client";
import Link from "next/link";
import { useState } from "react";
import { Lock, X, Star, AlertTriangle, CalendarDays } from "lucide-react";
import { useApp, type FavTeam } from "@/context/AppContext";

export function Crest({ src, size = 28, alt = "" }: { src?: string; size?: number; alt?: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) return <div style={{ width: size, height: size }} className="rounded-full bg-panel2 border border-line flex items-center justify-center text-[10px] text-mut shrink-0">⚽</div>;
  return <img src={src} alt={alt} width={size} height={size} loading="lazy" onError={() => setErr(true)} className="object-contain shrink-0" style={{ width: size, height: size }} />;
}

export function FormDots({ form, size = "sm" }: { form: string[] | string; size?: "sm" | "md" }) {
  const arr = typeof form === "string" ? form.split("") : form;
  const cls = size === "sm" ? "w-4 h-4 text-[8px]" : "w-6 h-6 text-[10px]";
  return (
    <div className="flex gap-1">
      {arr.slice(0, 5).map((r, i) => (
        <span key={i} className={`${cls} rounded-full flex items-center justify-center font-bold text-black/80 ${r === "V" || r === "W" ? "bg-acc" : r === "E" || r === "D" && false ? "bg-warn" : r === "D" || r === "L" ? "bg-danger text-white" : r === "E" ? "bg-warn" : "bg-line text-mut"}`}>
          {r === "W" ? "V" : r === "L" ? "D" : r}
        </span>
      ))}
    </div>
  );
}

export function LiveBadge({ clock }: { clock?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-danger">
      <span className="w-1.5 h-1.5 rounded-full bg-danger live-dot" />
      {clock || "AO VIVO"}
    </span>
  );
}

export function SectionTitle({ icon, title, right }: { icon?: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mt-5 mb-2 px-1">
      <h2 className="font-display font-bold text-lg tracking-wide uppercase flex items-center gap-2 text-ink">{icon}{title}</h2>
      {right}
    </div>
  );
}

export function SourceFoot({ fonte = "ESPN", amostra, extra }: { fonte?: string; amostra?: number; extra?: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap mt-2 text-[10px] text-mut">
      <span>Fonte: {fonte}{amostra != null ? ` · Amostra: ${amostra} jogo${amostra === 1 ? "" : "s"}` : ""}{extra ? ` · ${extra}` : ""}</span>
      {amostra != null && amostra < 5 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warn/15 text-warn font-bold"><AlertTriangle size={10} /> Base Parcial</span>
      )}
    </div>
  );
}

export function VipLock({ label = "Recurso VIP", children }: { label?: string; children?: React.ReactNode }) {
  const { user } = useApp();
  if (user?.isAdmin || user?.email === "admin@greenscore.app") return <>{children}</>;
  return (
    <div className="relative rounded-xl overflow-hidden border border-line">
      <div className="vip-blur p-4 opacity-60">{children || <div className="space-y-2"><div className="h-4 bg-panel2 rounded w-3/4" /><div className="h-4 bg-panel2 rounded w-1/2" /><div className="h-24 bg-panel2 rounded" /></div>}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/60 backdrop-blur-[2px] p-4 text-center">
        <span className="w-10 h-10 rounded-full bg-acc/15 border border-acc/40 flex items-center justify-center"><Lock size={18} className="text-acc" /></span>
        <p className="font-display font-bold uppercase tracking-wide">{label}</p>
        <p className="text-xs text-mut max-w-55">Assine o VIP para desbloquear IA Analista, escalações e análises completas.</p>
        <Link href="/config#planos" className="px-4 py-1.5 rounded-full bg-acc text-black text-xs font-extrabold">SEJA VIP ⚡</Link>
      </div>
    </div>
  );
}

export function FavStar({ team, size = 16 }: { team: FavTeam; size?: number }) {
  const { isFavorite, toggleFavorite } = useApp();
  const on = isFavorite(team.id);
  return (
    <button aria-label="Favoritar time" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(team); }} className="p-1 -m-1 shrink-0">
      <Star size={size} className={on ? "text-warn fill-warn" : "text-mut"} />
    </button>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative w-full sm:max-w-md bg-panel border border-line rounded-t-2xl sm:rounded-2xl p-4 max-h-[85vh] overflow-y-auto rise" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-lg uppercase tracking-wide">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-full bg-panel2"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SkeletonMatches({ n = 6 }: { n?: number }) {
  return (
    <div className="space-y-2">
      <div className="skeleton h-8 w-48" />
      {Array.from({ length: n }).map((_, i) => <div key={i} className="skeleton h-[72px] w-full" />)}
    </div>
  );
}

export function EmptyState({ title, sub, actionHref, actionLabel }: { title: string; sub?: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="text-center py-10 px-4 rounded-xl border border-dashed border-line bg-panel/50">
      <CalendarDays className="mx-auto text-mut mb-2" size={28} />
      <p className="font-display font-bold uppercase tracking-wide">{title}</p>
      {sub && <p className="text-xs text-mut mt-1">{sub}</p>}
      {actionHref && <Link href={actionHref} className="inline-block mt-3 px-4 py-2 rounded-full bg-acc text-black text-xs font-extrabold">{actionLabel || "VER OUTROS DIAS"}</Link>}
    </div>
  );
}

export function StatCompareRow({ label, home, away, pct }: { label: string; home: string | number | null; away: string | number | null; pct?: boolean }) {
  const h = parseFloat(String(home ?? "0").replace("%", "")) || 0;
  const a = parseFloat(String(away ?? "0").replace("%", "")) || 0;
  const tot = h + a || 1;
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-sm font-bold">
        <span className={h >= a ? "text-home" : "text-ink"}>{home ?? "—"}</span>
        <span className="text-[11px] text-mut font-semibold uppercase tracking-wide text-center px-2">{label}</span>
        <span className={a > h ? "text-away" : "text-ink"}>{away ?? "—"}</span>
      </div>
      <div className="flex gap-1 mt-1 h-1.5">
        <div className="rounded-full bg-home transition-all duration-500" style={{ width: `${(h / tot) * 100}%` }} />
        <div className="rounded-full bg-away flex-1 transition-all duration-500" />
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <button onClick={() => onChange(!on)} className="w-full flex items-center justify-between gap-3 py-2.5 text-left">
      <span>
        <span className="text-sm font-semibold block">{label}</span>
        {desc && <span className="text-[11px] text-mut block">{desc}</span>}
      </span>
      <span className={`w-10 h-5.5 rounded-full p-0.5 transition-colors shrink-0 ${on ? "bg-acc" : "bg-line"}`}>
        <span className={`block w-4.5 h-4.5 rounded-full bg-white transition-transform ${on ? "translate-x-4.5" : ""}`} />
      </span>
    </button>
  );
}