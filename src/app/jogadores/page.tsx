"use client";
import ImgRemoto from "@/components/ImgRemoto";
import { useCallback, useEffect, useState } from "react";
import { Search, ChevronDown, ChevronUp, Scale, ChevronLeft, ChevronRight, Info, Plus, Check } from "lucide-react";
import { Crest, SourceFoot, Modal } from "@/components/ui";
import { PlayerRadar, CompareBars } from "@/components/charts";

const LEAGUES = [
  { code: "eng.1", name: "Premier League" }, { code: "esp.1", name: "LaLiga" }, { code: "bra.1", name: "Brasileirão" },
  { code: "ita.1", name: "Serie A" }, { code: "ger.1", name: "Bundesliga" }, { code: "fra.1", name: "Ligue 1" },
  { code: "uefa.champions", name: "Champions League" }, { code: "por.1", name: "Liga Portugal" }, { code: "ned.1", name: "Eredivisie" },
];

export default function Jogadores() {
  const [league, setLeague] = useState("eng.1");
  const [cat, setCat] = useState("goals");
  const [q, setQ] = useState(""); const [pos, setPos] = useState(""); const [min, setMin] = useState(0);
  const [order, setOrder] = useState<"desc" | "asc">("desc"); const [metric, setMetric] = useState("value");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [compare, setCompare] = useState<any[]>([]);
  const [cmpOpen, setCmpOpen] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/players?league=${league}&cat=${cat}&q=${encodeURIComponent(q)}&pos=${pos}&min=${min}&order=${order}&metric=${metric}&page=${page}`);
      setData(await r.json());
    } catch {}
    setLoading(false);
  }, [league, cat, q, pos, min, order, metric, page]);

  useEffect(() => { const t = setTimeout(load, q ? 400 : 0); return () => clearTimeout(t); }, [load, q]);

  const rows = data?.rows || [];
  const maxOf = (k: string) => Math.max(1, ...rows.map((r: any) => Number(r[k]) || 0));
  const toggleCompare = (r: any) => setCompare((c) => c.some((x) => x.id === r.id) ? c.filter((x) => x.id !== r.id) : c.length >= 4 ? c : [...c, r]);

  const radarAttrs = (r: any) => {
    const attrs = [
      { label: data?.cat === "assists" ? "Assist." : "Gols", player: Math.round((r.value / maxOf("value")) * 100), league: 100 },
      { label: "Por jogo", player: r.perGame ? Math.round((r.perGame / maxOf("perGame")) * 100) : 0, league: 100 },
      { label: "Jogos", player: r.matches ? Math.round((r.matches / maxOf("matches")) * 100) : 50, league: 100 },
    ];
    if (r.assists != null) attrs.push({ label: "Assist.", player: Math.round((r.assists / maxOf("assists")) * 100), league: 100 });
    if (r.penalties != null) attrs.push({ label: "Pênaltis", player: Math.round((r.penalties / maxOf("penalties")) * 100), league: 100 });
    return attrs;
  };

  return (
    <div>
      <div className="mb-3">
        <h1 className="font-display font-bold text-2xl uppercase tracking-wide">Central de Jogadores</h1>
        <p className="text-[11px] text-mut">Rankings da temporada {data?.season ? `· ${data.season}` : ""} · {data?.leagueName || ""} {data ? `· ${data.total} atletas` : ""}</p>
      </div>

      {/* Filtros avançados */}
      <div className="bg-panel border border-line rounded-2xl p-3 space-y-2 mb-3">
        <div className="grid grid-cols-2 gap-2">
          <select value={league} onChange={(e) => { setPage(1); setLeague(e.target.value); }} className="bg-panel2 border border-line rounded-xl px-2 py-2 text-[12px] font-semibold">
            {LEAGUES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <select value={cat} onChange={(e) => { setPage(1); setCat(e.target.value); }} className="bg-panel2 border border-line rounded-xl px-2 py-2 text-[12px] font-semibold">
            {(data?.available?.length ? data.available : [{ id: "goals", label: "Gols" }, { id: "assists", label: "Assistências" }]).map((c: any) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar jogador ou time…" className="w-full bg-panel2 border border-line rounded-xl pl-8 pr-3 py-2 text-[12px]" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <select value={pos} onChange={(e) => { setPage(1); setPos(e.target.value); }} className="bg-panel2 border border-line rounded-xl px-2 py-1.5 text-[11px]">
            <option value="">Posição: todas</option><option value="G">Goleiro</option><option value="D">Defensor</option><option value="M">Meio-campo</option><option value="F">Atacante</option>
          </select>
          <select value={min} onChange={(e) => { setPage(1); setMin(Number(e.target.value)); }} className="bg-panel2 border border-line rounded-xl px-2 py-1.5 text-[11px]">
            <option value={0}>Mín. jogos: 0</option><option value={3}>3+</option><option value={5}>5+</option><option value={10}>10+</option>
          </select>
          <select value={metric} onChange={(e) => { setPage(1); setMetric(e.target.value); }} className="bg-panel2 border border-line rounded-xl px-2 py-1.5 text-[11px]">
            <option value="value">Por total</option><option value="perGame">Por jogo</option>
          </select>
        </div>
        <button onClick={() => setOrder(order === "desc" ? "asc" : "desc")} className="flex items-center gap-1 text-[11px] font-bold text-acc">
          {order === "desc" ? <ChevronDown size={13} /> : <ChevronUp size={13} />} Ordem {order === "desc" ? "decrescente (líderes primeiro)" : "crescente"}
        </button>
      </div>

      {/* Comparador */}
      {compare.length > 0 && (
        <div className="sticky top-14 z-30 bg-acc/15 border border-acc/40 rounded-xl p-2 mb-2 flex items-center gap-2 flex-wrap backdrop-blur">
          <Scale size={14} className="text-acc" />
          {compare.map((c) => <span key={c.id} className="text-[10px] bg-panel px-2 py-0.5 rounded-full font-bold">{c.short || c.name}</span>)}
          <button onClick={() => setCmpOpen(true)} disabled={compare.length < 2} className="ml-auto px-3 py-1 rounded-full bg-acc text-black text-[10px] font-extrabold disabled:opacity-40">COMPARAR ({compare.length}/4)</button>
          <button onClick={() => setCompare([])} className="text-[10px] text-mut">limpar</button>
        </div>
      )}

      {loading && <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>}

      {!loading && rows.length === 0 && (
        <div className="text-center py-10 bg-panel border border-dashed border-line rounded-xl">
          <p className="font-display font-bold uppercase">Nenhum jogador com esses filtros</p>
          <p className="text-xs text-mut mt-1">Reduza o mínimo de jogos ou limpe a busca/posição.</p>
          <button onClick={() => { setQ(""); setPos(""); setMin(0); }} className="mt-3 px-4 py-2 rounded-full bg-acc text-black text-xs font-extrabold">LIMPAR FILTROS</button>
        </div>
      )}

      {!loading && (
        <div className="space-y-1.5">
          {rows.map((r: any) => {
            const selecionado = compare.some((x) => x.id === r.id);
            return (
            <div key={r.id} className={`flex items-center gap-2 bg-panel border rounded-xl p-2.5 card-hover ${r.rank <= 3 && order === "desc" && page === 1 ? "border-acc/50" : "border-line"}`}>
              <span className={`font-display font-bold w-7 text-center text-lg ${r.rank === 1 ? "text-warn" : r.rank === 2 ? "text-mut" : r.rank === 3 ? "text-away" : "text-mut/60"}`}>{r.rank}</span>
              <button onClick={() => setProfile(r)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                {r.photo ? <ImgRemoto src={r.photo} alt={r.name} width={36} height={36} loading="lazy" className="w-9 h-9 rounded-full object-cover bg-panel2" /> : <span className="w-9 h-9 rounded-full bg-panel2 border border-line flex items-center justify-center text-[11px] font-bold">{r.name.slice(0, 1)}</span>}
                <div className="min-w-0">
                  <p className="text-[13px] font-bold truncate">{r.name} {r.rank === 1 && "👑"}</p>
                  <p className="text-[10px] text-mut flex items-center gap-1 truncate"><Crest src={r.teamLogo} size={12} /> {r.team || "—"} {r.nationality ? `· ${r.nationality}` : ""} {r.position ? `· ${r.position}` : ""}</p>
                </div>
              </button>
              <div className="text-right shrink-0">
                <p className="font-display font-bold text-xl text-acc">{metric === "perGame" ? r.perGame ?? "—" : r.value}</p>
                <p className="text-[9px] text-mut">{r.matches != null ? `${r.matches} jogos` : "jogos —"}{r.perGame != null && metric !== "perGame" ? ` · ${r.perGame}/j` : ""}</p>
              </div>
              <button
                onClick={() => toggleCompare(r)}
                title={selecionado ? "Remover da comparação" : "Comparar este jogador"}
                aria-label={selecionado ? `Remover ${r.name} da comparação` : `Adicionar ${r.name} à comparação`}
                aria-pressed={selecionado}
                className={`ml-1 shrink-0 w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${
                  selecionado
                    ? "border-acc bg-acc text-black"
                    : "border-line bg-panel2 text-mut hover:border-acc/60 hover:text-acc"
                }`}
              >
                {selecionado ? <Check size={13} strokeWidth={3} /> : <Plus size={13} strokeWidth={3} />}
              </button>
            </div>
            );
          })}
        </div>
      )}

      {!loading && data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="p-2 bg-panel border border-line rounded-full disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-[11px] font-bold text-mut">Página {page} de {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="p-2 bg-panel border border-line rounded-full disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}

      {/* Matriz de disponibilidade */}
      <button onClick={() => setShowMatrix(!showMatrix)} className="mt-4 w-full flex items-center gap-2 text-[11px] font-bold text-mut bg-panel border border-line rounded-xl p-3">
        <Info size={13} className="text-cyanx" /> Matriz de disponibilidade das estatísticas {showMatrix ? <ChevronUp size={13} className="ml-auto" /> : <ChevronDown size={13} className="ml-auto" />}
      </button>
      {showMatrix && (
        <div className="bg-panel border border-line rounded-xl p-3 mt-1 space-y-1.5">
          {(data?.matrix || []).map((m: any, i: number) => (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span>{m.espn || m.fd ? "✅" : "🔒"}</span>
              <div><p className="font-bold">{m.metric}</p><p className="text-mut text-[10px]">{m.note}{m.fd ? " · Football-Data.org" : ""}</p></div>
            </div>
          ))}
          <p className="text-[10px] text-mut pt-1 border-t border-line">Métricas 🔒 (minutos, passes, xG individual, duelos) exigem fonte complementar — configure Sportmonks no Admin → APIs. Não inventamos números.</p>
        </div>
      )}
      <SourceFoot fonte={data?.source || "ESPN"} extra={data ? `Atualizado ${new Date(data.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""} />

      {/* Perfil do jogador */}
      <Modal open={!!profile} onClose={() => setProfile(null)} title="Perfil do jogador">
        {profile && (
          <div>
            <div className="flex items-center gap-3">
              {profile.photo ? <ImgRemoto src={profile.photo} width={56} height={56} className="w-14 h-14 rounded-full object-cover bg-panel2" alt={profile.name} /> : <span className="w-14 h-14 rounded-full bg-panel2 flex items-center justify-center font-bold text-xl">{profile.name.slice(0, 1)}</span>}
              <div>
                <p className="font-display font-bold text-xl">{profile.name}</p>
                <p className="text-[11px] text-mut flex items-center gap-1"><Crest src={profile.teamLogo} size={14} /> {profile.team} {profile.position ? `· ${profile.position}` : ""}</p>
                <p className="text-[10px] text-mut">{profile.nationality}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
              {[["Gols/Valor", profile.value], ["Jogos", profile.matches ?? "—"], ["Por jogo", profile.perGame ?? "—"], ["Assist.", profile.assists ?? "—"]].map(([l, v]: any, i) => (
                <div key={i} className="bg-panel2 rounded-lg p-2"><p className="font-display font-bold text-lg text-acc">{v}</p><p className="text-[8px] text-mut uppercase">{l}</p></div>
              ))}
            </div>
            <p className="text-[10px] font-bold text-mut uppercase mt-3">Radar · % do líder da lista (100%)</p>
            <PlayerRadar attrs={radarAttrs(profile)} />
            <SourceFoot fonte={profile.source} extra={`Ranking #${profile.rank} · ${data?.leagueName}`} />
          </div>
        )}
      </Modal>

      {/* Comparador */}
      <Modal open={cmpOpen} onClose={() => setCmpOpen(false)} title={`Comparador (${compare.length} jogadores)`}>
        {compare.length >= 2 && (
          <div>
            {Math.max(...compare.map((c) => c.matches || 0)) > 2 * Math.max(1, Math.min(...compare.map((c) => c.matches || 1))) && (
              <p className="text-[10px] text-warn bg-warn/10 border border-warn/30 rounded-lg p-2 mb-2">⚠️ Amostras de jogos muito diferentes — compare também as médias por jogo.</p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead><tr><th className="text-left text-mut py-1">Stat</th>{compare.map((c) => <th key={c.id} className="text-center px-1">{c.short || c.name.split(" ").slice(-1)[0]}</th>)}</tr></thead>
                <tbody>
                  {[["Valor", "value"], ["Jogos", "matches"], ["Por jogo", "perGame"], ["Assistências", "assists"], ["Pênaltis", "penalties"]].map(([l, k]) => (
                    <tr key={k} className="border-t border-line/50"><td className="py-1.5 text-mut">{l}</td>{compare.map((c) => <td key={c.id} className="text-center font-bold">{(c as any)[k] ?? "—"}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CompareBars keys={compare.map((c) => c.short || c.name.split(" ").slice(-1)[0])}
              data={["value", "perGame"].map((k) => { const row: any = { stat: k === "value" ? "Total" : "Por jogo" }; compare.forEach((c) => { row[c.short || c.name.split(" ").slice(-1)[0]] = (c as any)[k] || 0; }); return row; })} />
            <SourceFoot fonte={data?.source} extra="Mesma temporada e competição" />
          </div>
        )}
      </Modal>
    </div>
  );
}