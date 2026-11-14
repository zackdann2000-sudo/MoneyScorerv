"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Star, RefreshCw, ChevronDown, Search } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { toYmd } from "@/components/DateStrip";

type Row = {
  id: string; league: string; leagueName: string; country: string; flag: string; date: string;
  state: string; clock: string; live: boolean; finished: boolean; status: string;
  home: { id: string; name: string; logo: string; score: number | null };
  away: { id: string; name: string; logo: string; score: number | null };
  prices?: { home: number | null; draw: number | null; away: number | null } | null;
  strategy?: { code: string; label: string; pct: number; confidence: number; fairOdd: number | null; result: "green" | "red" | null; source: string } | null;
};

const CODE: Record<string, string> = {
  Brasil: "BR", Inglaterra: "GB", Espanha: "ES", Itália: "IT", Alemanha: "DE", França: "FR",
  Portugal: "PT", Holanda: "NL", Argentina: "AR", México: "MX", Mexico: "MX", EUA: "US", Europa: "EU",
  "América do Sul": "SA", Bélgica: "BE", "Arábia Saudita": "SA", Chile: "CL", Colômbia: "CO", Bolívia: "BO",
};

export default function GamesBoard({ mode = "all" }: { mode?: "all" | "live" | "favorites" }) {
  const { favorites, isFavorite, toggleFavorite } = useApp();
  const [date, setDate] = useState(toYmd(new Date()));
  const [sport, setSport] = useState("football");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [updated, setUpdated] = useState<number>(0);
  const [filter, setFilter] = useState<"all" | "live" | "post" | "pre" | "tip">(mode === "live" ? "live" : "all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [favLeagues, setFavLeagues] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("gs_fav_leagues") || "[]"); } catch { return []; }
  });
  const [q, setQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [boxes, setBoxes] = useState<Record<string, any>>({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setErr("");
    try {
      const url = sport === "football" ? `/api/matches?date=${date}` : `/api/supertips/cards?sport=${sport}&date=${date.replace(/-/g, "")}`;
      const r = await fetch(url);
      const j = await r.json();
      const list: Row[] = sport === "football" ? (j.matches || []) : (j.cards || []).map((c: any) => ({
        id: c.id, league: c.league, leagueName: c.leagueName, country: c.country, flag: c.flag, date: c.date,
        state: c.state, clock: c.clock, live: c.live, finished: c.finished, status: c.status,
        home: c.home, away: c.away, prices: null, strategy: null,
      }));
      setRows(list);
      setUpdated(Date.now());
      if (j.error && !list.length) setErr(j.error);
    } catch {
      setErr("Falha ao carregar os jogos. Tente de novo.");
      setRows([]);
    }
  }, [date, sport]);

  useEffect(() => {
    // primeira carga (o setState acontece após o await, nunca no corpo síncrono do efeito)
    let cancelled = false;
    (async () => {
      try {
        const url = sport === "football" ? `/api/matches?date=${date}` : `/api/supertips/cards?sport=${sport}&date=${date.replace(/-/g, "")}`;
        const j = await fetch(url).then((r) => r.json());
        if (cancelled) return;
        setRows(sport === "football" ? (j.matches || []) : (j.cards || []).map((c: any) => ({
          id: c.id, league: c.league, leagueName: c.leagueName, country: c.country, flag: c.flag, date: c.date,
          state: c.state, clock: c.clock, live: c.live, finished: c.finished, status: c.status,
          home: c.home, away: c.away, prices: null, strategy: null,
        })));
        setUpdated(Date.now());
      } catch {
        if (!cancelled) { setErr("Falha ao carregar os jogos. Tente de novo."); setRows([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [date, sport]);
  useEffect(() => {
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const live = (rows || []).filter((m) => m.live).slice(0, 12);
    if (!live.length) return; // mantém o último snapshot; nada a buscar
    const ids = live.map((m) => `${m.id}:${m.league}`).join(",");
    fetch(`/api/live-box?q=${encodeURIComponent(ids)}`).then((r) => r.json()).then((j) => setBoxes(j.boxes || {})).catch(() => {});
  }, [rows]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i - 1);
    const ymd = toYmd(d);
    const label = i === 0 ? "ONTEM" : i === 1 ? "HOJE" : d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").slice(0, 2).toUpperCase();
    return { ymd, label, sub: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) };
  }), []);

  const base = useMemo(() => {
    let list = rows || [];
    if (mode === "favorites") {
      const ids = new Set(favorites.map((f) => f.id));
      list = list.filter((m) => ids.has(m.home.id) || ids.has(m.away.id));
    }
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((m) => `${m.home.name} ${m.away.name} ${m.leagueName} ${m.country}`.toLowerCase().includes(s));
    }
    return list;
  }, [rows, mode, favorites, q]);

  const counts = useMemo(() => ({
    all: base.length,
    live: base.filter((m) => m.live).length,
    post: base.filter((m) => m.finished).length,
    pre: base.filter((m) => m.state === "pre").length,
  }), [base]);

  const shown = base.filter((m) => filter === "all" || filter === "tip" ? (filter === "tip" ? false : true) : filter === "live" ? m.live : filter === "post" ? m.finished : m.state === "pre");

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    shown.forEach((m) => map.set(m.league, [...(map.get(m.league) || []), m]));
    return [...map.entries()].sort((a, b) => Number(favLeagues.includes(b[0])) - Number(favLeagues.includes(a[0])) || (a[1][0]?.leagueName || "").localeCompare(b[1][0]?.leagueName || ""));
  }, [shown, favLeagues]);

  const toggleLeague = (code: string) => {
    const next = favLeagues.includes(code) ? favLeagues.filter((x) => x !== code) : [...favLeagues, code];
    setFavLeagues(next);
    localStorage.setItem("gs_fav_leagues", JSON.stringify(next));
  };
  // "há Xs" calculado de forma estável (sem chamar Date.now() durante o render)
  const [nowTs, setNowTs] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNowTs(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const ago = updated && nowTs ? Math.max(0, Math.round((nowTs - updated) / 1000)) : 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h1 className="font-display font-bold text-[22px] leading-none">{mode === "favorites" ? "Favoritos" : mode === "live" ? "Ao vivo" : "Futebol"}</h1>
        <span className="ml-auto text-[10px] text-mut">{ago < 5 ? "agora" : ago < 60 ? `há ${ago}s` : `há ${Math.floor(ago / 60)} min`}</span>
        <button onClick={() => setShowSearch((v) => !v)} aria-label="Buscar" className="w-11 h-11 flex items-center justify-center text-ink"><Search size={18} /></button>
        <button onClick={() => load()} aria-label="Atualizar" className="w-11 h-11 flex items-center justify-center text-ink"><RefreshCw size={16} /></button>
      </div>
      {showSearch && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar time ou liga" className="w-full mb-2 bg-panel border border-line rounded-lg px-3 py-2 text-sm text-ink" />}

      {mode === "all" && (
        <div className="flex gap-2 mb-2">
          {[["football", "Futebol"], ["nba", "NBA"], ["tennis", "Tênis"]].map(([id, l]) => (
            <button key={id} onClick={() => setSport(id)} className={`px-3 py-1.5 rounded-full text-[12px] font-bold border ${sport === id ? "border-live text-live" : "border-line text-mut"}`}>{l}</button>
          ))}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto no-scrollbar border-b border-line mb-2">
        {days.map((d) => {
          const on = d.ymd === date;
          return (
            <button key={d.ymd} onClick={() => setDate(d.ymd)} className={`shrink-0 pb-2 text-center min-w-12 ${on ? "text-live border-b-2 border-live" : "text-mut"}`}>
              <span className="block text-[10px] font-bold">{d.label}</span>
              <span className="block text-[12px] font-bold tabular-nums">{d.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
        {([
          ["all", `Todos ${counts.all}`],
          ["live", `Ao vivo ${counts.live}`],
          ["post", `Encerrados ${counts.post}`],
          ["pre", `Agenda ${counts.pre}`],
        ] as const).map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} className={`shrink-0 h-9 px-3 rounded-full text-[12px] font-bold ${filter === id ? "bg-live text-white" : "bg-panel text-ink border border-line"}`}>{label}</button>
        ))}
      </div>

      {rows === null && <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-14" />)}</div>}
      {err && rows?.length === 0 && (
        <div className="text-center py-10">
          <p className="font-bold">Não foi possível carregar</p>
          <p className="text-sm text-mut mt-1">{err}</p>
          <button onClick={() => load()} className="mt-3 h-11 px-4 rounded-full bg-live text-white text-sm font-bold">Tentar de novo</button>
        </div>
      )}
      {rows && shown.length === 0 && !err && (
        <div className="text-center py-12 px-4">
          {mode === "favorites" ? (
            <>
              <Star size={48} className="mx-auto text-mut" />
              <p className="font-bold mt-3">Comece a adicionar suas equipes</p>
              <p className="text-sm text-mut mt-1">Tenha as partidas das equipes favoritas em um só lugar.</p>
              <Link href="/ligas" className="inline-flex items-center h-11 px-5 mt-4 rounded-lg bg-panel2 text-ink text-sm font-bold">BUSCAR EQUIPES</Link>
            </>
          ) : (
            <>
              <p className="font-bold">Nenhum jogo neste filtro</p>
              <p className="text-sm text-mut mt-1">A fonte não publicou partidas para esta data e este recorte. O contador usa a mesma lista.</p>
            </>
          )}
        </div>
      )}

      {groups.map(([code, list]) => {
        const collapsed = open[code] === false;
        const head = list[0];
        const fav = favLeagues.includes(code);
        return (
          <section key={code} className="mb-2">
            <button onClick={() => setOpen((p) => ({ ...p, [code]: collapsed }))} className="w-full flex items-center gap-2 px-1 py-2 text-left">
              <span className="w-6 text-[10px] font-bold text-mut">{CODE[head.country] || "—"}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] uppercase tracking-wide text-mut">{head.country}</span>
                <span className="block text-[13px] font-bold truncate">{head.leagueName}</span>
              </span>
              <span className="text-[12px] font-bold tabular-nums text-mut">{list.length}</span>
              <span role="checkbox" aria-checked={fav} aria-label="Competição favorita" onClick={(e) => { e.stopPropagation(); toggleLeague(code); }} className="w-11 h-11 flex items-center justify-center">
                <Star size={16} className={fav ? "text-warn fill-warn" : "text-mut"} />
              </span>
              <ChevronDown size={14} className={`text-mut ${collapsed ? "-rotate-90" : ""}`} />
            </button>
            {!collapsed && list.map((m) => <MatchRow key={m.id} m={m} sport={sport} box={boxes[m.id]} starred={isFavorite(m.home.id) || isFavorite(m.away.id)} onStar={() => {
              toggleFavorite({ id: m.home.id, name: m.home.name, league: m.league, logo: m.home.logo });
            }} />)}
          </section>
        );
      })}
    </div>
  );
}

function MatchRow({ m, sport, starred, onStar, box }: { m: Row; sport: string; starred: boolean; onStar: () => void; box?: any }) {
  const time = new Date(m.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const href = sport === "football" ? `/jogos/${m.id}?league=${m.league}` : `/supertips/jogo/${m.id}?league=${m.league}&sport=${sport}`;
  const score = (t: Row["home"], win: boolean) => (
    <span className={`w-5 text-right tabular-nums text-[14px] ${m.live ? "text-live font-bold" : win ? "font-bold text-ink" : "text-ink"}`}>{m.state === "pre" ? "" : t.score ?? 0}</span>
  );
  const homeWin = m.finished && (m.home.score ?? 0) > (m.away.score ?? 0);
  const awayWin = m.finished && (m.away.score ?? 0) > (m.home.score ?? 0);
  const chip = (label: string, value: number | null) => value == null ? null : <span className="px-1.5 py-0.5 rounded bg-panel2 text-[10px] text-ink tabular-nums">{label} {value}</span>;
  return (
    <div className="border-t border-line">
    <div className="flex items-stretch min-h-14">
      <button onClick={onStar} aria-label="Favoritar equipe da casa" className="w-11 flex items-center justify-center shrink-0">
        <Star size={16} className={starred ? "text-warn fill-warn" : "text-mut"} />
      </button>
      <Link href={href} className="w-12 shrink-0 flex items-center justify-center text-[11px] font-bold">
        {m.live ? <span className="text-live">{m.clock || "AO VIVO"}</span> : m.finished ? <span className="text-mut">Enc.</span> : <span className="text-ink">{time}</span>}
      </Link>
      <Link href={href} className="flex-1 min-w-0 py-1.5">
        <TeamLine name={m.home.name} logo={m.home.logo} bold={homeWin || m.live} />
        <TeamLine name={m.away.name} logo={m.away.logo} bold={awayWin} />
      </Link>
      <Link href={href} className="w-8 flex flex-col justify-center items-end pr-1">
        {score(m.home, homeWin)}
        {score(m.away, awayWin)}
      </Link>
      <div className="w-16 shrink-0 flex flex-col items-end justify-center pr-2 gap-0.5">
        {m.strategy ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-ink">
            {m.strategy.label}
            <span className="text-mut tabular-nums">{m.strategy.confidence.toFixed(1)}</span>
            {m.strategy.result === "green" && <span className="text-acc" aria-label="Acertou">✓</span>}
            {m.strategy.result === "red" && <span className="text-danger" aria-label="Errou">✗</span>}
          </span>
        ) : <span className="text-[9px] text-mut">sem amostra</span>}
        {m.prices?.home != null && <span className="text-[9px] text-mut tabular-nums">{m.prices.home}</span>}
      </div>
    </div>
    {m.live && box && (
      <div className="flex flex-wrap gap-1 px-3 pb-2">
        {chip("Gols", m.home.score != null && m.away.score != null ? (m.home.score + m.away.score) : null)}
        {chip("Escanteios", box.corners)}
        {chip("Cartões", box.yellow != null || box.red != null ? (box.yellow || 0) + (box.red || 0) : null)}
        {chip("Faltas", box.fouls)}
        {chip("Impedimentos", box.offsides)}
        <span className="text-[9px] text-mut self-center">Fonte: ESPN</span>
      </div>
    )}
    </div>
  );
}

function TeamLine({ name, logo, bold }: { name: string; logo: string; bold?: boolean }) {
  const [bad, setBad] = useState(false);
  return (
    <span className="flex items-center gap-2 h-6 min-w-0">
      {!bad && logo ? <img src={logo} alt="" width={20} height={20} className="w-5 h-5 object-contain" onError={() => setBad(true)} /> : <span className="w-5 h-5 rounded-full bg-panel2 text-[8px] flex items-center justify-center">{name.slice(0, 2).toUpperCase()}</span>}
      <span className={`truncate text-[13px] ${bold ? "font-bold text-ink" : "text-ink"}`}>{name}</span>
    </span>
  );
}