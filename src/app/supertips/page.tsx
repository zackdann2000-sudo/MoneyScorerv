"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Star } from "lucide-react";
import { GameCard, voterKey } from "@/components/supertips/bits";
import { ChatFab } from "@/components/supertips/bits";
import { toYmd } from "@/components/DateStrip";

const SPORTS = [
  { id: "football", label: "Futebol", icon: "⚽" },
  { id: "nba", label: "NBA", icon: "🏀" },
  { id: "tennis", label: "Tênis", icon: "🎾" },
];

export default function SuperTipsJogos() {
  const [sport, setSport] = useState("football");
  const [when, setWhen] = useState<"hoje" | "amanha" | "live">("hoje");
  const [cards, setCards] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [conf, setConf] = useState(false);
  const [mine, setMine] = useState(false);
  const [notStarted, setNotStarted] = useState(false);
  const [myLeagues, setMyLeagues] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("gs_myleagues") || "[]"); } catch { return []; }
  });

  const date = useMemo(() => {
    const d = new Date();
    if (when === "amanha") d.setDate(d.getDate() + 1);
    return toYmd(d);
  }, [when]);

  const load = useCallback(async () => {
    if (typeof window === "undefined") return;
    try {
      const r = await fetch(`/api/supertips/cards?sport=${sport}&date=${date}&voter=${voterKey()}`);
      const j = await r.json();
      setCards(j.cards || []);
    } catch { setCards([]); }
    setLoading(false);
  }, [sport, date]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    fetch(`/api/supertips/cards?sport=${sport}&date=${date}&voter=${voterKey()}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setCards(j.cards || []); })
      .catch(() => { if (!cancelled) setCards([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sport, date]);

  const leagues = useMemo(() => {
    const m = new Map<string, string>();
    (cards || []).forEach((c) => m.set(c.league, `${c.flag || ""} ${c.leagueName}`));
    return [...m.entries()];
  }, [cards]);

  const toggleLeague = (code: string) => {
    const next = myLeagues.includes(code) ? myLeagues.filter((x) => x !== code) : [...myLeagues, code];
    setMyLeagues(next);
    localStorage.setItem("gs_myleagues", JSON.stringify(next));
  };

  let list = cards || [];
  if (when === "live") list = list.filter((c) => c.live);
  if (conf) list = list.filter((c) => c.risk === "Alta");
  if (notStarted) list = list.filter((c) => c.state === "pre");
  if (mine) list = list.filter((c) => myLeagues.includes(c.league));
  const high = (cards || []).filter((c) => c.risk === "Alta").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="font-display font-bold text-2xl uppercase leading-none">Super<span className="text-purple">Tips</span></h1>
          <p className="text-[10px] text-mut">Palpites com amostra real · nunca um chute sem dados</p>
        </div>
        <button onClick={load} className="p-2 rounded-full bg-panel border border-line text-mut" aria-label="Atualizar"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /></button>
      </div>

      <div className="flex gap-2 mb-2">
        {SPORTS.map((s) => (
          <button key={s.id} onClick={() => setSport(s.id)} className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold border ${sport === s.id ? "bg-acc text-black border-acc" : "bg-[#141820] border-white/10 text-mut"}`}>{s.icon} {s.label}</button>
        ))}
      </div>

      <div className="flex gap-1 bg-[#141820] border border-white/10 rounded-full p-1 mb-2">
        {([["hoje", "HOJE"], ["amanha", "AMANHÃ"], ["live", "AO VIVO"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setWhen(id)} className={`flex-1 py-1.5 rounded-full text-[11px] font-extrabold ${when === id ? "bg-[#e8b923] text-black" : "text-mut"}`}>{id === "live" && <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger mr-1" />}{label}</button>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
        <button onClick={() => setConf(!conf)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-extrabold border ${conf ? "bg-acc text-black border-acc" : "border-white/10 text-mut"}`}>Confiança alta {high}</button>
        <button onClick={() => setMine(!mine)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-extrabold border ${mine ? "bg-[#e8b923] text-black border-[#e8b923]" : "border-white/10 text-mut"}`}><Star size={10} className="inline mr-1" />Minhas ligas {myLeagues.length}</button>
        <button onClick={() => setNotStarted(!notStarted)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-extrabold border ${notStarted ? "bg-purple text-white border-purple" : "border-white/10 text-mut"}`}>Não iniciado</button>
      </div>

      {mine && (
        <div className="flex gap-1 overflow-x-auto no-scrollbar mb-2">
          {leagues.map(([code, name]) => (
            <button key={code} onClick={() => toggleLeague(code)} className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-bold border ${myLeagues.includes(code) ? "border-acc text-acc" : "border-white/10 text-mut"}`}>{name}</button>
          ))}
          {leagues.length === 0 && <span className="text-[10px] text-mut">Carregue os jogos para escolher ligas.</span>}
        </div>
      )}

      {loading && <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-52 rounded-2xl" />)}</div>}

      {!loading && list.length === 0 && (
        <div className="text-center py-12 bg-[#141820] border border-dashed border-white/10 rounded-2xl px-4">
          <p className="font-display font-bold uppercase">Nenhum jogo neste filtro</p>
          <p className="text-xs text-mut mt-1">A ESPN não tem partidas (ou amostra) para essa combinação. Troque o dia, o esporte ou limpe os filtros — não inventamos jogos.</p>
        </div>
      )}

      <div className="space-y-3">
        {!loading && list.map((c) => <GameCard key={c.id + c.sport} c={c} onVote={(id, choice) => setCards((prev) => (prev || []).map((x) => x.id === id ? { ...x, votes: { ...x.votes, mine: choice, [choice]: (x.votes?.[choice] || 0) + (x.votes?.mine === choice ? 0 : 1) } } : x))} />)}
      </div>
      <p className="text-[9px] text-mut text-center mt-3">Fonte: ESPN · Futebol usa a tabela da competição (Poisson). NBA usa aproveitamento. Tênis usa ranking. Placar previsto só aparece quando a fonte tem gols/pontos suficientes.</p>
      <ChatFab matchId="geral" />
    </div>
  );
}