"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toYmd } from "@/components/DateStrip";

export default function Ligas() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch(`/api/matches?date=${toYmd(new Date())}`).then((r) => r.json()).then((j) => {
      const map = new Map<string, any>();
      for (const m of j.matches || []) {
        const cur = map.get(m.league) || { code: m.league, name: m.leagueName, country: m.country, n: 0, live: 0 };
        cur.n++; if (m.live) cur.live++;
        map.set(m.league, cur);
      }
      setRows([...map.values()].sort((a, b) => b.live - a.live || b.n - a.n || a.country.localeCompare(b.country)));
    }).catch(() => { setErr("Falha ao carregar as ligas."); setRows([]); });
  }, []);
  return (
    <div>
      <h1 className="font-display font-bold text-[22px] mb-2">Ligas</h1>
      <p className="text-[11px] text-mut mb-2">Contagem do dia, mesma consulta da lista de jogos.</p>
      {rows === null && <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-12" />)}</div>}
      {err && <p className="text-sm text-danger">{err}</p>}
      {(rows || []).map((l) => (
        <Link key={l.code} href={`/?liga=${l.code}`} className="flex items-center gap-3 h-14 border-b border-line">
          <span className="w-8 text-[10px] font-bold text-mut">{l.country.slice(0, 2).toUpperCase()}</span>
          <span className="flex-1 min-w-0"><span className="block text-[10px] uppercase text-mut">{l.country}</span><span className="block text-sm font-bold truncate">{l.name}</span></span>
          {l.live > 0 && <span className="min-w-6 h-5 px-1 rounded-full bg-live text-white text-[11px] font-bold flex items-center justify-center">{l.live}</span>}
          <span className="text-sm tabular-nums text-mut w-6 text-right">{l.n}</span>
        </Link>
      ))}
      {rows && rows.length === 0 && !err && <p className="text-sm text-mut py-8 text-center">Nenhuma liga com jogo hoje na fonte.</p>}
    </div>
  );
}