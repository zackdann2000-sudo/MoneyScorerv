"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Crest, SourceFoot } from "@/components/ui";

const CATS = [
  { id: "goals", label: "Gols" },
  { id: "assists", label: "Assistências" },
  { id: "yellowCards", label: "Cartões" },
  { id: "foulsCommitted", label: "Faltas" },
  { id: "offsides", label: "Impedimentos" },
  { id: "shots", label: "Finalizações" },
  { id: "saves", label: "Defesas" },
];
const LEAGUES = [
  { code: "bra.1", name: "Brasileirão" }, { code: "eng.1", name: "Premier League" }, { code: "esp.1", name: "LaLiga" },
  { code: "ita.1", name: "Serie A" }, { code: "ger.1", name: "Bundesliga" }, { code: "fra.1", name: "Ligue 1" },
];

export default function Estatisticas() {
  const [league, setLeague] = useState("bra.1");
  const [cat, setCat] = useState("goals");
  const [q, setQ] = useState("");
  const [team, setTeam] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/players?league=${league}&cat=${cat}&q=${encodeURIComponent(q)}&team=${encodeURIComponent(team)}`)
        .then((r) => r.json()).then((j) => { setData(j); setLoading(false); }).catch(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [league, cat, q, team]);

  const teams = [...new Set((data?.rows || []).map((r: any) => r.team).filter(Boolean))] as string[];

  return (
    <div>
      <h1 className="font-display font-bold text-2xl uppercase mb-2">Estatísticas</h1>
      <div className="relative mb-2">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jogador ou time" className="w-full bg-[#141820] border border-white/10 rounded-xl pl-8 pr-3 py-2.5 text-sm" />
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar mb-2">
        {LEAGUES.map((l) => <button key={l.code} onClick={() => setLeague(l.code)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-extrabold ${league === l.code ? "bg-acc text-black" : "bg-[#141820] text-mut border border-white/10"}`}>{l.name}</button>)}
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar mb-2">
        {CATS.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-extrabold border ${cat === c.id ? "bg-purple text-white border-purple" : "border-white/10 text-mut"}`}>{c.label}</button>)}
      </div>
      {teams.length > 0 && (
        <select value={team} onChange={(e) => setTeam(e.target.value)} className="w-full bg-[#141820] border border-white/10 rounded-xl px-3 py-2 text-[12px] mb-2">
          <option value="">Todos os times</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
      {loading && <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>}
      {!loading && (data?.rows || []).length === 0 && (
        <p className="text-xs text-mut text-center py-8">A ESPN não publicou o ranking “{CATS.find((c) => c.id === cat)?.label}” nesta liga. Troque a categoria — não completamos a lista com números inventados.</p>
      )}
      <div className="space-y-1.5">
        {(data?.rows || []).map((r: any) => (
          <div key={r.id} className="flex items-center gap-2 bg-[#141820] border border-white/5 rounded-xl p-2.5">
            <span className={`font-display font-bold w-6 text-center ${r.rank <= 3 ? "text-[#e8b923]" : "text-mut"}`}>{r.rank}</span>
            {r.photo ? <img src={r.photo} alt="" className="w-9 h-9 rounded-full object-cover" /> : <span className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">{r.name.slice(0, 1)}</span>}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold truncate">{r.name}</p>
              <p className="text-[10px] text-mut flex items-center gap-1"><Crest src={r.teamLogo} size={12} /> {r.team || "—"} · média {r.perGame ?? "—"}</p>
            </div>
            <span className="font-display font-bold text-xl text-acc">{r.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 bg-[#141820] rounded-xl p-3 text-[11px] text-mut">
        Bolinhas verdes/brancas dos últimos jogos não aparecem aqui: a ESPN só manda o total da temporada neste ranking. Jogo a jogo (gols, assistências, cartões) está na aba Jogadores do confronto, com a amostra real.
        <Link href="/jogadores" className="block mt-2 text-acc font-bold">Abrir Central de Jogadores →</Link>
      </div>
      <SourceFoot fonte={data?.source || "ESPN"} extra={data?.season ? `Temporada ${data.season}` : ""} />
    </div>
  );
}