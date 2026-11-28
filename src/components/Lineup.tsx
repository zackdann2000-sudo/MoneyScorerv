"use client";
import ImgRemoto from "@/components/ImgRemoto";
type P = { name: string; short: string; jersey: string; place: number; captain?: boolean; photo?: string };
type Team = { formation: string; xi: P[]; bench?: P[] } | null;

function coords(formation: string, xi: P[]) {
  const rows = (formation || "4-4-2").split("-").map((n) => parseInt(n) || 0);
  const full = [1, ...rows];
  const out: { p: P; x: number; y: number }[] = [];
  let idx = 0;
  full.forEach((count, r) => {
    for (let i = 0; i < count && idx < xi.length; i++, idx++) {
      const y = 7 + (r / Math.max(1, full.length - 1)) * 40; // % a partir do gol do time
      out.push({ p: xi[idx], x: ((i + 1) / (count + 1)) * 100, y });
    }
  });
  return out;
}

function PlayerDot({ p, color, flip }: { p: P; color: string; flip?: boolean }) {
  const last = (p.short || p.name || "").split(" ").slice(-1)[0];
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-11 pointer-events-none" style={{}}>
      <div className="relative">
        {p.photo ? (
          <ImgRemoto src={p.photo} alt={p.name} width={32} height={32} loading="lazy" className="w-8 h-8 rounded-full object-cover bg-panel" style={{ border: `2px solid ${color}` }} />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#0d1c13] flex items-center justify-center text-[11px] font-bold text-white" style={{ border: `2px solid ${color}` }}>{p.jersey || "•"}</div>
        )}
        {p.captain && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-warn text-black text-[8px] font-extrabold flex items-center justify-center">C</span>}
      </div>
      {/* Nome com fundo sólido e largura fixa: evita que textos vizinhos se sobreponham. */}
      <span className={`block text-[8px] font-semibold text-white bg-black/80 rounded px-1 mt-0.5 w-11 truncate text-center ${flip ? "" : ""}`}>{last}</span>
    </div>
  );
}

export default function LineupPitch({ home, away, homeName, awayName, single }: { home: Team; away?: Team; homeName: string; awayName?: string; single?: boolean }) {
  if (!home || !home.xi?.length) return <p className="text-xs text-mut text-center py-6">Escalação ainda não divulgada para esta partida.</p>;
  const hCoords = coords(home.formation, home.xi);
  const aCoords = away?.xi?.length ? coords(away.formation, away.xi) : [];
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-bold mb-1 px-1">
        <span className="text-home">{homeName} · {home.formation}</span>
        {!single && away && <span className="text-away">{awayName} · {away.formation}</span>}
      </div>
      <div className="pitch relative rounded-xl border border-line overflow-hidden" style={{ height: single ? 340 : 520 }}>
        {/* Linha central grossa e branca — separa nitidamente as duas metades. */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)] z-10" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full border border-white/25" />
        <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-40 h-14 border border-white/25 border-b-0" />
        {!single && <div className="absolute left-1/2 top-0 -translate-x-1/2 w-40 h-14 border border-white/25 border-t-0" />}
        {/* Casa: metade INFERIOR. y=7 (perto do próprio gol) → 100-y = 93 (base). */}
        {hCoords.map(({ p, x, y }, i) => (
          <div key={`h-${i}`} className="absolute z-20" style={{ left: `${x}%`, top: `${single ? 100 - y * 2 : 100 - y}%` }}>
            <PlayerDot p={p} color="#4d9fff" />
          </div>
        ))}
        {/* Fora: metade SUPERIOR. y=7 → 7% (topo), sempre acima da linha central. */}
        {!single && aCoords.map(({ p, x, y }, i) => (
          <div key={`a-${i}`} className="absolute z-20" style={{ left: `${100 - x}%`, top: `${y}%` }}>
            <PlayerDot p={p} color="#ff8a4d" flip />
          </div>
        ))}
      </div>
      {home.bench && home.bench.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-bold text-mut uppercase mb-1">Banco {single ? "" : `— ${homeName}`}</p>
          <div className="flex flex-wrap gap-1">{home.bench.map((p, i) => <span key={i} className="text-[10px] bg-panel2 border border-line rounded px-1.5 py-0.5">{p.jersey && <b className="text-mut mr-1">{p.jersey}</b>}{p.short || p.name}</span>)}</div>
        </div>
      )}
      {!single && away?.bench && away.bench.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-bold text-mut uppercase mb-1">Banco — {awayName}</p>
          <div className="flex flex-wrap gap-1">{away.bench.map((p, i) => <span key={i} className="text-[10px] bg-panel2 border border-line rounded px-1.5 py-0.5">{p.jersey && <b className="text-mut mr-1">{p.jersey}</b>}{p.short || p.name}</span>)}</div>
        </div>
      )}
    </div>
  );
}