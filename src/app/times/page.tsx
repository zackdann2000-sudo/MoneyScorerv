"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toYmd } from "@/components/DateStrip";
import { Crest } from "@/components/ui";

export default function Times() {
  const [teams, setTeams] = useState<any[] | null>(null);
  useEffect(() => {
    fetch(`/api/matches?date=${toYmd(new Date())}`).then((r) => r.json()).then((j) => {
      const map = new Map<string, any>();
      for (const m of j.matches || []) {
        for (const t of [m.home, m.away]) {
          if (!map.has(t.id)) map.set(t.id, { ...t, league: m.league, leagueName: m.leagueName, country: m.country });
        }
      }
      setTeams([...map.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => setTeams([]));
  }, []);
  return (
    <div>
      <h1 className="font-display font-bold text-2xl">Times</h1>
      <p className="text-sm text-mut mb-3">Equipes com jogo hoje na ESPN. Toque para o perfil real.</p>
      {teams === null && <div className="skeleton h-24" />}
      {(teams || []).map((t) => (
        <Link key={t.id + t.league} href={`/times/${t.id}?league=${t.league}`} className="flex items-center gap-3 h-14 border-b border-line">
          <Crest src={t.logo} size={28} alt={t.name} />
          <span className="min-w-0"><span className="block text-sm font-bold truncate">{t.name}</span><span className="block text-[10px] text-mut">{t.country} · {t.leagueName}</span></span>
          <span className="ml-auto text-[10px] font-bold text-acc">ESPN</span>
        </Link>
      ))}
    </div>
  );
}