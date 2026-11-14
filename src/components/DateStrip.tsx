"use client";
export const toYmd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function DateStrip({ value, onChange, days = 8 }: { value: string; onChange: (ymd: string) => void; days?: number }) {
  const today = new Date();
  const items = Array.from({ length: days + 1 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i - 1);
    const ymd = toYmd(d);
    const label = i === 0 ? "ONTEM" : i === 1 ? "HOJE" : i === 2 ? "AMANHÃ" : d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase();
    return { ymd, label, sub: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) };
  });
  return (
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 py-1">
      {items.map((it) => {
        const active = it.ymd === value;
        return (
          <button key={it.ymd} onClick={() => onChange(it.ymd)}
            className={`shrink-0 flex flex-col items-center px-3.5 py-1.5 rounded-xl border transition-colors ${active ? "bg-acc border-acc text-black" : "bg-panel border-line text-mut hover:border-acc/50"}`}>
            <span className="text-[10px] font-extrabold tracking-wide">{it.label}</span>
            <span className={`text-[10px] ${active ? "text-black/70" : "text-mut"}`}>{it.sub}</span>
          </button>
        );
      })}
    </div>
  );
}