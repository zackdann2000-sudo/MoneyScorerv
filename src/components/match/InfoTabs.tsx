"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Whistle } from "./icons";
import { Crest, FormDots, SourceFoot, StatCompareRow, VipLock, Modal, LiveBadge } from "@/components/ui";
import { Momentum, RadialDuo, GoalsBars } from "@/components/charts";
import LineupPitch from "@/components/Lineup";
import Last10Matrix from "@/components/Last10";
import { PlayerStatCard, PlayerStatsEmpty, type PlayerStatRow } from "./StatBubbles";

type Team = { id: string; name: string; short?: string; logo: string };

/* ================= TIMELINE (Sumário) ================= */
const EV_ICON: Record<string, string> = { goal: "⚽", pen: "🎯", own: "😱", pen_miss: "❌", yellow: "🟨", red: "🟥", sub: "🔄", var: "📺" };
export function Timeline({ events, vip }: { events: any[]; vip: boolean }) {
  if (!events?.length) return <p className="text-xs text-mut text-center py-6">Sem lances registrados ainda nesta partida.</p>;
  const free = vip ? events : events.slice(0, 3);
  const rest = vip ? [] : events.slice(3);
  const render = (list: any[], half: number) => {
    const evs = list.filter((e) => (half === 1 ? e.period <= 1 : e.period > 1));
    if (!evs.length) return null;
    return (
      <div>
        <p className="text-center text-[10px] font-extrabold text-mut uppercase tracking-widest py-2 border-y border-line my-2">{half === 1 ? "1º TEMPO" : "2º TEMPO"}</p>
        <div className="space-y-2">
          {evs.map((e, i) => (
            <div key={i} className={`flex ${e.side === "home" ? "justify-start" : "justify-end"}`}>
              <div className={`flex items-center gap-2 max-w-[85%] ${e.side === "away" ? "flex-row-reverse text-right" : ""}`}>
                <span className="font-display font-bold text-sm text-mut w-10 shrink-0 text-center">{e.minute}</span>
                <span className="text-base shrink-0">{EV_ICON[e.type] || "•"}</span>
                <div className="bg-panel border border-line rounded-lg px-2.5 py-1.5">
                  <p className="text-[12px] font-bold leading-tight">
                    {e.player}
                    {e.score && <span className="ml-1.5 text-acc font-display">{e.score}</span>}
                  </p>
                  {e.type === "sub" ? (
                    <p className="text-[10px] text-mut"><span className="text-acc">▲ {e.player}</span> · <span className="text-danger">▼ {e.playerOut}</span></p>
                  ) : e.assist ? <p className="text-[10px] text-mut">Assist: {e.assist}</p> : e.type === "pen_miss" ? <p className="text-[10px] text-mut">Pênalti perdido</p> : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div>
      {render(free, 1)}{render(free, 2)}
      {rest.length > 0 && (
        <div className="mt-2"><VipLock label={`+${rest.length} lances — Timeline completa é VIP`}><div className="h-32" /></VipLock></div>
      )}
    </div>
  );
}

/* ================= LIVE + ORACLE ================= */
export function LiveTab({ d, matchId, league }: { d: any; matchId: string; league: string }) {
  const [oracle, setOracle] = useState<any>(null);
  useEffect(() => {
    let on = true;
    const load = () => fetch(`/api/matches/${matchId}/oracle?league=${league}`).then((r) => r.json()).then((j) => on && setOracle(j)).catch(() => {});
    load();
    const t = setInterval(load, 45000);
    return () => { on = false; clearInterval(t); };
  }, [matchId, league]);

  const momentum = useMemo(() => {
    const buckets: { min: number; home: number; away: number }[] = [];
    const evs = d.events || [];
    for (let m = 5; m <= 95; m += 5) {
      const inB = evs.filter((e: any) => { const mm = parseInt(e.minute) || 0; return mm > m - 5 && mm <= m; });
      let h = 0, a = 0;
      inB.forEach((e: any) => { const w = ["goal", "pen"].includes(e.type) ? 3 : e.type === "red" ? 1.5 : e.type === "yellow" ? 0.6 : 0.3; if (e.side === "home") h += w; else a += w; });
      buckets.push({ min: m, home: h, away: -a });
    }
    const has = evs.filter((e: any) => e.type !== "sub").length >= 3;
    if (!has) return { data: buckets.map((b, i) => ({ min: b.min, home: 1.2 + Math.sin(i * 0.9) * 1.1, away: -(1 + Math.cos(i * 0.7) * 0.9) })), mock: true };
    return { data: buckets, mock: false };
  }, [d.events]);

  const V_COLOR: Record<string, string> = { MANTER: "bg-acc text-black", COBRIR: "bg-warn text-black", MUDAR: "bg-away text-black", SAIR: "bg-danger text-white" };

  return (
    <div className="space-y-3">
      {/* Scouter Oracle */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="font-display font-bold uppercase tracking-wide">🔮 Scouter Oracle</p>
          {oracle && <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${oracle.selo === "real" ? "bg-acc/15 text-acc" : oracle.selo === "estimado" ? "bg-cyanx/15 text-cyanx" : "bg-panel2 text-mut"}`}>{oracle.selo === "real" ? "DADOS REAIS" : oracle.selo === "estimado" ? "xG ESTIMADO" : "DEMO PRÉ-JOGO"}</span>}
        </div>
        {!oracle ? <div className="skeleton h-24" /> : oracle.error ? <p className="text-xs text-mut">{oracle.error}</p> : (
          <>
            <div className="grid grid-cols-3 items-center gap-2 text-center">
              <div><p className="font-display font-bold text-3xl text-home">{oracle.xgCasa}</p><p className="text-[9px] text-mut uppercase">xG Casa</p></div>
              <span className={`mx-auto px-4 py-2 rounded-xl font-display font-bold text-xl ${V_COLOR[oracle.veredito] || "bg-panel2"}`}>{oracle.veredito}</span>
              <div><p className="font-display font-bold text-3xl text-away">{oracle.xgFora}</p><p className="text-[9px] text-mut uppercase">xG Fora</p></div>
            </div>
            <p className="text-[11px] text-mut text-center mt-2">Pressão: <b className="text-ink">{oracle.pressao}</b>{oracle.minuto ? ` · ${oracle.minuto}` : ""}</p>
            <p className="text-[12px] mt-2 bg-panel2 rounded-xl p-2.5 leading-relaxed">{oracle.explicacao}</p>
            <SourceFoot fonte={oracle.fonte} extra={oracle.bzOdds ? "Bzzoiro conectado" : undefined} />
          </>
        )}
      </div>

      {/* Momentum */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        <p className="text-[10px] font-bold text-mut uppercase mb-1">Match Momentum · pressão por lances</p>
        <Momentum data={momentum.data} illustrative={momentum.mock} />
      </div>

      {/* Timeline */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        <p className="text-[10px] font-bold text-mut uppercase">Lances da partida {!d.vip && <span className="text-warn">· 3 primeiros grátis</span>}</p>
        <Timeline events={d.events} vip={d.vip} />
      </div>

      {d.commentary?.length > 0 && (
        <div className="bg-panel border border-line rounded-2xl p-4">
          <p className="text-[10px] font-bold text-mut uppercase mb-2">Narração ESPN</p>
          <div className="space-y-1.5 max-h-60 overflow-y-auto">
            {d.commentary.map((c: any, i: number) => <p key={i} className="text-[11px] text-ink/85"><b className="text-acc">{c.minute}</b> {c.text}</p>)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= PRÉ-LIVE (comparativo Last 10) ================= */
export function PreLiveTab({ home, away, league, officials }: { home: Team; away: Team; league: string; officials: any[] }) {
  const [h, setH] = useState<any>(null); const [a, setA] = useState<any>(null);
  const [mode, setMode] = useState<"media" | "total">("media");
  const [cat, setCat] = useState("ATAQUE");
  const [refOpen, setRefOpen] = useState(false);
  const [leagueAvg, setLeagueAvg] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/teams/${home.id}?league=${league}`).then((r) => r.json()).then(setH).catch(() => {});
    fetch(`/api/teams/${away.id}?league=${league}`).then((r) => r.json()).then(setA).catch(() => {});
    fetch(`/api/standings?league=${league}`).then((r) => r.json()).then((j) => {
      const rows = j.groups?.[0]?.rows || [];
      const gp = rows.reduce((s: number, r: any) => s + r.gp, 0), gf = rows.reduce((s: number, r: any) => s + r.gf, 0);
      if (gp) setLeagueAvg(+(gf / gp).toFixed(2));
    }).catch(() => {});
  }, [home.id, away.id, league]);

  const CATS: Record<string, { key: string; label: string; liga?: number | null }[]> = {
    ATAQUE: [{ key: "gols", label: "Gols marcados", liga: leagueAvg }, { key: "chutesGol", label: "Chutes no gol" }, { key: "finalizacoes", label: "Finalizações" }, { key: "xgEst", label: "xG estimado" }],
    DEFESA: [{ key: "sofridos", label: "Gols sofridos" }],
    DISCIPLINA: [{ key: "amarelos", label: "Cartões amarelos" }, { key: "faltas", label: "Faltas cometidas" }],
    OUTROS: [{ key: "escanteios", label: "Escanteios" }, { key: "posse", label: "Posse de bola %" }],
  };

  if (!h || !a) return <div className="space-y-2"><div className="skeleton h-10" /><div className="skeleton h-64" /><p className="text-[10px] text-mut text-center">Comparando os últimos 10 jogos…</p></div>;

  const fmt = (avg: any, jogos: number) => avg == null ? "—" : mode === "media" ? Number(avg).toFixed(2) : (Number(avg) * jogos).toFixed(0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex bg-panel border border-line rounded-full p-0.5">
          <button onClick={() => setMode("total")} className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${mode === "total" ? "bg-acc text-black" : "text-mut"}`}>TOTAL</button>
          <button onClick={() => setMode("media")} className={`px-3 py-1 rounded-full text-[11px] font-extrabold ${mode === "media" ? "bg-acc text-black" : "text-mut"}`}>MÉDIAS</button>
        </div>
        <span className="text-[9px] text-mut">últimos {h.averages?.jogos || 0} × {a.averages?.jogos || 0} jogos</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {Object.keys(CATS).map((c) => <button key={c} onClick={() => setCat(c)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-extrabold border ${cat === c ? "bg-acc text-black border-acc" : "bg-panel border-line text-mut"}`}>{c}</button>)}
        <span className="shrink-0 px-3 py-1.5 rounded-full text-[10px] font-extrabold border border-dashed border-line text-mut/50">🔒 PASSES (Sportmonks)</span>
      </div>
      <div className="bg-panel border border-line rounded-2xl p-3 space-y-2">
        {CATS[cat].map((row) => {
          const hv = h.averages?.[row.key], av = a.averages?.[row.key];
          return (
            <div key={row.key} className="grid grid-cols-[64px_1fr_64px] items-center gap-2">
              <span className="bg-home/15 border border-home/40 text-home font-display font-bold text-lg rounded-xl py-1.5 text-center">{fmt(hv, h.averages?.jogos || 0)}</span>
              <div className="text-center">
                <p className="text-[11px] font-bold">{row.label}</p>
                {row.liga != null && mode === "media" && <p className="text-[8px] text-mut uppercase">Média liga: {row.liga}</p>}
              </div>
              <span className="bg-away/15 border border-away/40 text-away font-display font-bold text-lg rounded-xl py-1.5 text-center">{fmt(av, a.averages?.jogos || 0)}</span>
            </div>
          );
        })}
        <SourceFoot fonte="ESPN" amostra={Math.min(h.averages?.jogos || 0, a.averages?.jogos || 0)} extra="Escanteios/faltas por equipe (não o total do jogo)" />
      </div>

      {/* Card do árbitro */}
      <button onClick={() => setRefOpen(true)} className="w-full bg-panel border border-line rounded-2xl p-3 flex items-center gap-3 card-hover">
        <span className="w-10 h-10 rounded-full bg-panel2 border border-line flex items-center justify-center"><Whistle /></span>
        <div className="text-left flex-1">
          <p className="text-[10px] text-mut uppercase font-bold">Árbitro da partida</p>
          <p className="text-[13px] font-bold">{officials?.[0]?.name || "A confirmar"}</p>
        </div>
        <span className="text-[10px] text-acc font-bold">MÉDIAS →</span>
      </button>
      <Modal open={refOpen} onClose={() => setRefOpen(false)} title="🧑‍⚖️ Árbitro">
        {officials?.length ? officials.map((o: any, i: number) => (
          <div key={i} className="flex items-center gap-2 py-2 border-b border-line">
            {o.photo ? <img src={o.photo} className="w-9 h-9 rounded-full object-cover" alt={o.name} /> : <span className="w-9 h-9 rounded-full bg-panel2 flex items-center justify-center"><Whistle /></span>}
            <div><p className="text-sm font-bold">{o.name}</p><p className="text-[10px] text-mut">{o.role}</p></div>
          </div>
        )) : <p className="text-xs text-mut">Escala de arbitragem ainda não divulgada pela ESPN.</p>}
        <p className="text-[10px] text-mut mt-3 bg-panel2 rounded-lg p-2">ℹ️ Médias de faltas/cartões por tempo do árbitro exigem histórico de arbitragem (Sportmonks). Quando a chave estiver ativa no Admin, os números aparecerão aqui — não exibimos valores inventados.</p>
      </Modal>
    </div>
  );
}

/* ================= H2H ================= */
/* Resultado relativo ao time da casa desta partida:
   V = casa venceu · E = empate · D = casa perdeu */
export function H2HTab({ d }: { d: any; league?: string }) {
  const games = d.h2h?.games || [];
  const m = d.match;
  const stats = useMemo(() => {
    if (!games.length) return null;
    let hw = 0, dr = 0, aw = 0;
    const rate = (teamId: string, fn: (g: any, my: number, op: number) => boolean) => {
      const rel = games.filter((g: any) => g.homeId === teamId || g.awayId === teamId);
      if (!rel.length) return 0;
      return Math.round(rel.filter((g: any) => fn(g, g.homeId === teamId ? g.homeScore : g.awayScore, g.homeId === teamId ? g.awayScore : g.homeScore)).length / rel.length * 100);
    };
    games.forEach((g: any) => {
      const winner = g.homeScore > g.awayScore ? g.homeId : g.homeScore < g.awayScore ? g.awayId : "draw";
      if (winner === "draw") dr++; else if (winner === m.home.id) hw++; else if (winner === m.away.id) aw++;
    });
    return {
      hw, dr, aw, total: games.length,
      o15h: rate(m.home.id, (g) => g.homeScore + g.awayScore > 1.5), o15a: rate(m.away.id, (g) => g.homeScore + g.awayScore > 1.5),
      o25h: rate(m.home.id, (g) => g.homeScore + g.awayScore > 2.5), o25a: rate(m.away.id, (g) => g.homeScore + g.awayScore > 2.5),
      bttsh: rate(m.home.id, (g) => g.homeScore > 0 && g.awayScore > 0), bttsa: rate(m.away.id, (g) => g.homeScore > 0 && g.awayScore > 0),
      csh: rate(m.home.id, (_g, _my, op) => op === 0), csa: rate(m.away.id, (_g, _my, op) => op === 0),
    };
  }, [games, m.home.id, m.away.id]);

  return (
    <div className="space-y-3">
      {stats ? (
        <>
          <div className="bg-panel border border-line rounded-2xl p-4">
            <p className="text-[10px] font-bold text-mut uppercase mb-2">Últimos {stats.total} confrontos diretos</p>
            <div className="flex h-7 rounded-lg overflow-hidden font-display font-bold text-xs">
              {stats.hw > 0 && <div className="bg-home flex items-center justify-center text-black/90" style={{ width: `${(stats.hw / stats.total) * 100}%` }}>{stats.hw}</div>}
              {stats.dr > 0 && <div className="bg-line flex items-center justify-center" style={{ width: `${(stats.dr / stats.total) * 100}%` }}>{stats.dr}</div>}
              {stats.aw > 0 && <div className="bg-away flex items-center justify-center text-black/90" style={{ width: `${(stats.aw / stats.total) * 100}%` }}>{stats.aw}</div>}
            </div>
            <div className="flex justify-between text-[9px] text-mut mt-1"><span>{m.home.name}</span><span>Empates</span><span>{m.away.name}</span></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <RadialDuo label="Over 1.5" home={stats.o15h} away={stats.o15a} />
            <RadialDuo label="Over 2.5" home={stats.o25h} away={stats.o25a} />
            <RadialDuo label="Ambas marcam" home={stats.bttsh} away={stats.bttsa} />
            <RadialDuo label="Clean sheets" home={stats.csh} away={stats.csa} />
          </div>
          {/* Lista de confrontos — círculo colorido por resultado (V/E/D) */}
          <div className="bg-panel border border-line rounded-2xl p-3 space-y-0.5">
            {games.slice(0, 10).map((g: any) => {
              const res =
                g.homeScore > g.awayScore ? "V" : g.homeScore < g.awayScore ? "D" : "E";
              const tone =
                res === "V"
                  ? "bg-acc/15 text-acc border-acc/60"
                  : res === "E"
                    ? "bg-warn/15 text-warn border-warn/60"
                    : "bg-danger/15 text-danger border-danger/60";
              return (
                <div
                  key={g.id}
                  className="flex items-center gap-2 py-2 border-b border-line/40 last:border-0 text-[11px]"
                >
                  <span className="text-mut w-[52px] shrink-0 tabular-nums">
                    {new Date(g.date).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                    })}
                  </span>
                  <Crest src={g.homeLogo} size={15} />
                  <span
                    className={`flex-1 truncate ${res === "V" ? "font-bold" : "text-mut"}`}
                    title={g.homeName}
                  >
                    {g.homeName}
                  </span>
                  <span className="font-display font-bold text-sm px-1.5 py-0.5 bg-panel2 rounded tabular-nums shrink-0">
                    {g.homeScore} - {g.awayScore}
                  </span>
                  <span
                    className={`flex-1 truncate text-right ${res === "D" ? "font-bold" : "text-mut"}`}
                    title={g.awayName}
                  >
                    {g.awayName}
                  </span>
                  <Crest src={g.awayLogo} size={15} />
                  <span
                    aria-label={res === "V" ? "Vitória do mandante" : res === "E" ? "Empate" : "Derrota do mandante"}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-extrabold shrink-0 ${tone}`}
                  >
                    {res}
                  </span>
                </div>
              );
            })}
            <SourceFoot fonte="ESPN (season series)" amostra={games.length} />
          </div>
          <p className="text-[9px] text-mut text-center -mt-1">
            Círculo: <b className="text-acc">verde</b> vitória do mandante · <b className="text-warn">laranja</b> empate · <b className="text-danger">vermelho</b> derrota do mandante
          </p>
        </>
      ) : <p className="text-xs text-mut text-center py-8 bg-panel border border-dashed border-line rounded-xl">Sem confrontos diretos recentes disponíveis nesta fonte.</p>}

      <div className="bg-panel border border-line rounded-2xl p-4">
        <p className="text-[10px] font-bold text-mut uppercase mb-2">Forma recente (últimos 5)</p>
        <div className="flex items-center justify-between py-1"><span className="text-[12px] font-bold flex items-center gap-2"><Crest src={m.home.logo} size={18} />{m.home.name}</span><FormDots form={(d.form?.home || []).map((f: any) => f.result)} size="md" /></div>
        <div className="flex items-center justify-between py-1"><span className="text-[12px] font-bold flex items-center gap-2"><Crest src={m.away.logo} size={18} />{m.away.name}</span><FormDots form={(d.form?.away || []).map((f: any) => f.result)} size="md" /></div>
      </div>
    </div>
  );
}

/* ================= ESTATÍSTICAS ================= */
const STAT_CATS = [
  { id: "gols", label: "Gols" },
  { id: "assistencias", label: "Assistências" },
  { id: "finalizacoes", label: "Finalizações" },
  { id: "finalizacoesNoGol", label: "Finalizações no Gol" },
  { id: "finalizacoesParaFora", label: "Finalizações para Fora" },
  { id: "passes", label: "Passes" },
  { id: "desarmes", label: "Desarmes" },
  { id: "interceptacoes", label: "Interceptações" },
  { id: "faltas", label: "Faltas" },
  { id: "faltasSofridas", label: "Faltas Sofridas" },
  { id: "impedimentos", label: "Impedimentos" },
  { id: "amarelos", label: "Cartões Amarelos" },
  { id: "defesas", label: "Defesas Goleiro" },
] as const;

export function StatsTab({ d, matchId, league }: { d: any; matchId: string; league: string }) {
  const [cat, setCat] = useState<(typeof STAT_CATS)[number]["id"]>("gols");
  const [side, setSide] = useState<"home" | "away">("home");
  const [data, setData] = useState<Record<string, any>>({});

  useEffect(() => {
    if (data[side]) return;
    let on = true;
    fetch(`/api/matches/${matchId}/stats?league=${league}&side=${side}`)
      .then((r) => r.json())
      .then((j) => {
        if (on) setData((p) => ({ ...p, [side]: j }));
      })
      .catch(() => {
        if (on) setData((p) => ({ ...p, [side]: { error: "Não foi possível carregar as estatísticas agora." } }));
      });
    return () => {
      on = false;
    };
  }, [matchId, league, side, data]);

  const cur = data[side];
  const loading = !cur;
  const rows: PlayerStatRow[] | null = cur?.stats?.[cat] || null;
  const reason: string | undefined = cur?.stats?.[`${cat}Reason`];
  const team = side === "home" ? d.match.home : d.match.away;

  return (
    <div className="space-y-3">
      {/* Comparativo ao vivo da partida (quando a ESPN já publicou) */}
      {d.stats?.length > 0 && (
        <div className="bg-panel border border-line rounded-2xl p-4">
          <p className="text-[10px] font-bold text-mut uppercase mb-2">Estatísticas da partida</p>
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-home">
              <Crest src={d.match.home.logo} size={18} />
              {d.match.home.short || d.match.home.name}
            </span>
            {d.match.live && <LiveBadge clock={d.match.clock} />}
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-away">
              {d.match.away.short || d.match.away.name}
              <Crest src={d.match.away.logo} size={18} />
            </span>
          </div>
          {d.stats.map((s: any) => (
            <StatCompareRow key={s.key} label={s.label} home={s.home} away={s.away} />
          ))}
          <SourceFoot fonte="ESPN ao vivo" extra="Acesso gratuito" />
        </div>
      )}

      {/* Seletor de time */}
      <div className="grid grid-cols-2 gap-2">
        {(["home", "away"] as const).map((s) => {
          const t = s === "home" ? d.match.home : d.match.away;
          return (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${side === s ? "border-acc bg-acc/10" : "border-line bg-panel"}`}
            >
              <Crest src={t.logo} size={22} />
              <span className="text-[11px] font-bold truncate">{t.name}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-abas de métricas */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {STAT_CATS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${cat === c.id ? "bg-acc text-black border-acc" : "bg-panel border-line text-mut"}`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && !cur && (
        <div className="space-y-2">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
          <p className="text-[10px] text-mut text-center">Lendo os jogos reais deste time…</p>
        </div>
      )}

      {cur?.error && <PlayerStatsEmpty label={team.name} reason={cur.error} />}

      {cur && !cur.error && rows && rows.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-mut font-bold uppercase">
            Top {rows.length} · {STAT_CATS.find((c) => c.id === cat)?.label} · {team.name}
          </p>
          {rows.map((r, i) => (
            <PlayerStatCard key={r.id} row={r} rank={i + 1} metricLabel="Média" />
          ))}
          <SourceFoot
            fonte={cur.source || "ESPN"}
            amostra={cur.sample}
            extra="Bolinhas: verde > 0 · cinza = 0 · mais antigo → mais recente"
          />
        </div>
      )}

      {cur && !cur.error && (!rows || rows.length === 0) && (
        <PlayerStatsEmpty label={`${STAT_CATS.find((c) => c.id === cat)?.label} — ${team.name}`} reason={reason} />
      )}

      {!cur && !loading && <PlayerStatsEmpty label="Estatísticas" />}
    </div>
  );
}

/* ================= CLASSIFICAÇÃO ================= */
export function TabelaTab({ league, homeId, awayId }: { league: string; homeId: string; awayId: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch(`/api/standings?league=${league}`).then((r) => r.json()).then(setData).catch(() => {}); }, [league]);
  if (!data) return <div className="skeleton h-80" />;
  const groups = data.groups || [];
  if (!groups.length) return <p className="text-xs text-mut text-center py-8">Classificação indisponível para esta competição (formato de copa).</p>;
  return (
    <div className="space-y-3">
      {groups.map((g: any, gi: number) => (
        <div key={gi} className="bg-panel border border-line rounded-2xl p-2 overflow-x-auto">
          <p className="text-[10px] font-bold text-mut uppercase px-2 py-1">{g.name}</p>
          <table className="w-full text-[11px]">
            <thead><tr className="text-mut text-[9px] uppercase"><th className="text-left pl-2 py-1">#</th><th className="text-left">Time</th><th>P</th><th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th></tr></thead>
            <tbody>
              {g.rows.map((r: any) => {
                const hl = r.teamId === homeId || r.teamId === awayId;
                return (
                  <tr key={r.teamId} className={`border-t border-line/50 ${hl ? "bg-acc/10" : ""}`}>
                    <td className={`pl-2 py-1.5 font-bold ${r.rank <= 4 ? "text-acc" : r.rank >= g.rows.length - 3 ? "text-danger" : "text-mut"}`}>{r.rank}</td>
                    <td><Link href={`/times/${r.teamId}?league=${league}`} className="flex items-center gap-1.5 font-semibold"><Crest src={r.logo} size={16} /><span className="truncate max-w-28">{r.short || r.name}</span></Link></td>
                    <td className="text-center font-display font-bold">{r.pts}</td><td className="text-center text-mut">{r.gp}</td><td className="text-center">{r.w}</td><td className="text-center">{r.d}</td><td className="text-center">{r.l}</td><td className="text-center text-mut">{r.gd}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      <SourceFoot fonte="ESPN" />
    </div>
  );
}

/* ================= FORMAÇÕES ================= */
export function FormacoesTab({ d, matchId, league }: { d: any; matchId: string; league: string }) {
  const [prov, setProv] = useState<any>(null);
  const needsProv = d.vip && !d.hasLineups;
  useEffect(() => {
    if (!needsProv) return;
    Promise.all([
      fetch(`/api/teams/${d.match.home.id}?league=${league}`).then((r) => r.json()),
      fetch(`/api/teams/${d.match.away.id}?league=${league}`).then((r) => r.json()),
    ]).then(([h, a]) => setProv({ h, a })).catch(() => {});
  }, [needsProv, d.match?.home?.id, d.match?.away?.id, league]);

  if (!d.vip) return <VipLock label="Escalações são VIP"><div className="h-80 pitch opacity-40 rounded-xl" /></VipLock>;
  if (d.hasLineups) return (
    <div className="bg-panel border border-line rounded-2xl p-3">
      <p className="text-[10px] font-bold text-acc uppercase mb-2">✅ Escalações oficiais</p>
      <LineupPitch home={d.lineups.home} away={d.lineups.away} homeName={d.match.home.name} awayName={d.match.away.name} />
      <SourceFoot fonte="ESPN" />
    </div>
  );
  if (!prov) return <div className="space-y-2"><div className="skeleton h-72" /><p className="text-[10px] text-mut text-center">Montando escalação provável pelo último jogo real…</p></div>;
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-warn uppercase">📋 Escalação PROVÁVEL — baseada no XI real do último jogo (estatística, não confirmação)</p>
      {prov.h?.lineupProvavel && (
        <div className="bg-panel border border-line rounded-2xl p-3">
          <LineupPitch home={prov.h.lineupProvavel} homeName={d.match.home.name} single />
          <p className="text-[9px] text-mut mt-1">Base: {prov.h.lineupBase}</p>
        </div>
      )}
      {prov.a?.lineupProvavel && (
        <div className="bg-panel border border-line rounded-2xl p-3">
          <LineupPitch home={prov.a.lineupProvavel} homeName={d.match.away.name} single />
          <p className="text-[9px] text-mut mt-1">Base: {prov.a.lineupBase}</p>
        </div>
      )}
      {!prov.h?.lineupProvavel && !prov.a?.lineupProvavel && <p className="text-xs text-mut text-center py-6">Sem jogo anterior com escalação registrada nesta liga.</p>}
    </div>
  );
}

/* ================= JOGADORES (Matriz Last 10 + Campo) ================= */
export function JogadoresTab({ matchId, league, home, away, lineups, vip }: { matchId: string; league: string; home: Team; away: Team; lineups: any; vip: boolean }) {
  const [side, setSide] = useState<"home" | "away">("home");
  const [view, setView] = useState<"matriz" | "campo">("matriz");
  const [data, setData] = useState<Record<string, any>>({});
  useEffect(() => {
    if (data[side]) return;
    fetch(`/api/matches/${matchId}/opportunities?league=${league}&side=${side}`).then((r) => r.json()).then((j) => setData((p) => ({ ...p, [side]: j }))).catch(() => {});
  }, [side, data, matchId, league]);
  const team = side === "home" ? home : away;
  const cur = data[side];
  const xi = lineups?.[side]?.xi?.map((p: any) => p.name) || [];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        {(["home", "away"] as const).map((s) => {
          const t = s === "home" ? home : away;
          return <button key={s} onClick={() => setSide(s)} className={`flex items-center gap-2 p-2 rounded-xl border ${side === s ? "border-acc bg-acc/10" : "border-line bg-panel"}`}><Crest src={t.logo} size={22} /><span className="text-[11px] font-bold truncate">{t.name}</span></button>;
        })}
      </div>
      <div className="flex bg-panel border border-line rounded-full p-0.5 w-fit mb-3">
        <button onClick={() => setView("matriz")} className={`px-4 py-1.5 rounded-full text-[11px] font-extrabold ${view === "matriz" ? "bg-acc text-black" : "text-mut"}`}>MATRIZ LAST 10</button>
        <button onClick={() => setView("campo")} className={`px-4 py-1.5 rounded-full text-[11px] font-extrabold ${view === "campo" ? "bg-acc text-black" : "text-mut"}`}>CAMPO</button>
      </div>
      {view === "matriz" && (!cur ? <div className="space-y-2"><div className="skeleton h-24" /><div className="skeleton h-24" /><div className="skeleton h-24" /></div> : <Last10Matrix rows={cur.matrix || []} teamName={team.name} xiNames={xi} />)}
      {view === "campo" && (vip ? (
        lineups?.home?.xi?.length ? <div className="bg-panel border border-line rounded-2xl p-3"><LineupPitch home={lineups.home} away={lineups.away} homeName={home.name} awayName={away.name} /></div>
          : <p className="text-xs text-mut text-center py-6">Escalação não divulgada — veja a provável na aba FORMAÇÕES.</p>
      ) : <VipLock label="Campo tático é VIP"><div className="h-72 pitch opacity-40 rounded-xl" /></VipLock>)}
    </div>
  );
}

/* ================= MONEY TIPS (pick card reutilizável) ================= */
const STATUS_L: Record<string, string> = { pendente: "Pendente", ao_vivo: "Ao vivo", green: "Green", red: "Red", anulada: "Anulada" };
const STATUS_C: Record<string, string> = { pendente: "bg-panel2 text-mut", ao_vivo: "bg-danger/15 text-danger", green: "bg-acc/15 text-acc", red: "bg-danger/15 text-danger", anulada: "bg-warn/15 text-warn" };

export function PickCard({ pick, compact }: { pick: any; compact?: boolean }) {
  const [sel, setSel] = useState<number | null>(null);
  const op = pick.oportunidade;
  const jogos = op.jogosDetalhe || [];
  const n = op.totalJogos || 0;
  const small = n < 10 || op.amostraPequena;
  const line = parseFloat(String(op.linha || "0.5").replace("+", "").replace(",", ".")) || 0.5;
  const ev = op.ev;
  return (
    <div className="space-y-3">
      <div className="bg-panel border border-line rounded-2xl p-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <p className="text-[10px] text-mut uppercase font-bold">{pick.jogo.liga} · {pick.jogo.horario}</p>
          {pick.status && <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-full ${STATUS_C[pick.status] || "bg-panel2 text-mut"}`}>{STATUS_L[pick.status] || pick.status}</span>}
        </div>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex flex-col items-center gap-1 w-24"><Crest src={pick.jogo.logoCasa} size={44} /><span className="text-[11px] font-bold leading-tight">{pick.jogo.timeCasa}</span></div>
          <span className="font-display font-bold text-2xl text-mut">VS</span>
          <div className="flex flex-col items-center gap-1 w-24"><Crest src={pick.jogo.logoFora} size={44} /><span className="text-[11px] font-bold leading-tight">{pick.jogo.timeFora}</span></div>
        </div>
      </div>
      {!compact && <p className="text-[12px] leading-relaxed text-ink/90 bg-panel border border-line rounded-2xl p-4 text-justify">{pick.analiseTexto}</p>}
      <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: "linear-gradient(135deg, #4c1d95, #7c3aed 55%, #a855f7)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-bold text-sm">{op.time}</p>
            <p className="text-white/70 text-[10px] uppercase">{op.periodo}</p>
          </div>
          <span className="text-3xl">🧙‍️</span>
        </div>
        <p className="text-white font-display font-bold text-2xl mt-2 uppercase leading-tight">OPORTUNIDADE: {op.linha} {op.mercado} · <span className={small ? "text-white/80" : "text-acc2"}>{op.acertos}/{op.totalJogos}</span></p>
        <div className="flex items-center justify-between mt-2 gap-2">
          <span className="text-white/70 text-[10px]">média {Number(op.media).toFixed(2)} por jogo · amostra {n}</span>
          <span className={`font-display font-bold px-2.5 py-1 rounded-lg ${small ? "bg-black/20 text-white/70 text-sm" : "bg-black/30 text-white"}`}>justa @{op.oddEstimada != null ? Number(op.oddEstimada).toFixed(2) : "—"}</span>
        </div>
        {small && <p className="mt-2 text-[11px] bg-black/25 rounded-lg p-2 text-warn">Amostra pequena (n={n}). A odd justa não é cotação e não é certeza — o intervalo abaixo é largo de propósito.</p>}
      </div>
      <div className="bg-panel border border-line rounded-2xl p-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-panel2 rounded-xl p-2">
          <p className="text-[9px] uppercase text-mut font-bold">Odd de mercado</p>
          <p className="font-display font-bold text-lg">{op.oddMercado != null ? `@${Number(op.oddMercado).toFixed(2)}` : "Indisponível"}</p>
          <p className="text-[9px] text-mut">{op.oddFonte || "ESPN não publicou esta linha"}</p>
        </div>
        <div className="bg-panel2 rounded-xl p-2">
          <p className="text-[9px] uppercase text-mut font-bold">EV (taxa × odd − 1)</p>
          {ev == null ? <p className="font-display font-bold text-lg text-mut">—</p> : <p className={`font-display font-bold text-lg ${ev > 0 ? "text-acc" : "text-danger"}`}>{ev > 0 ? "+" : ""}{(ev * 100).toFixed(1)}%</p>}
          <p className="text-[9px] text-mut">{ev == null ? "Sem odd de mercado, sem EV" : ev > 0 ? "Valor estimado positivo" : "Valor estimado negativo"}</p>
        </div>
        <div className="col-span-2 text-[10px] text-mut">
          IC 95% da taxa: {op.ci ? `${Math.round(op.ci.low * 100)}% – ${Math.round(op.ci.high * 100)}%` : "indisponível"}
          {op.ci && op.oddMercado ? ` · EV no intervalo: ${((op.ci.low * op.oddMercado - 1) * 100).toFixed(0)}% a ${((op.ci.high * op.oddMercado - 1) * 100).toFixed(0)}%` : ""}
          {op.ci && op.oddMercado && op.ci.low * op.oddMercado - 1 < 0 && op.ci.high * op.oddMercado - 1 > 0 ? " · EV incerto (o intervalo cruza zero)." : ""}
        </div>
      </div>
      <div className="bg-panel border border-line rounded-2xl p-4">
        <p className="text-[10px] font-bold text-mut uppercase mb-1">Últimos {op.totalJogos} jogos · toque na barra</p>
        <GoalsBars games={jogos.map((g: any) => ({ opp: g.opp, logo: g.logo, valor: g.valor }))} line={line} onSelect={(i) => setSel(i)} />
        <SourceFoot fonte="ESPN" amostra={n} extra={small ? "Amostra pequena" : `Linha ${op.linha}`} />
      </div>
      <Modal open={sel != null} onClose={() => setSel(null)} title="Detalhe do jogo">
        {sel != null && jogos[sel] && (
          <div className="text-center py-2">
            <Crest src={jogos[sel].logo} size={48} />
            <p className="font-bold mt-2">vs {jogos[sel].opp}</p>
            <p className="font-display font-bold text-3xl mt-1">{jogos[sel].gf} - {jogos[sel].ga}</p>
            <p className="text-xs text-mut mt-1">{new Date(jogos[sel].data).toLocaleDateString("pt-BR")} · estatística do jogo: <b className="text-acc">{jogos[sel].valor}</b></p>
            <Link href={`/jogos/${jogos[sel].id}?league=${jogos[sel].league}`} className="inline-block mt-3 px-4 py-1.5 rounded-full bg-acc text-black text-xs font-extrabold">ABRIR PARTIDA</Link>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function MoneyTab({ matchId }: { matchId: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch("/api/money-tips").then((r) => r.json()).then(setData).catch(() => {}); }, []);
  if (!data) return <div className="space-y-2"><div className="skeleton h-28" /><div className="skeleton h-40" /></div>;
  if (data.pick?.matchId === matchId) return <PickCard pick={data.pick} />;
  return (
    <div className="text-center py-8 bg-panel border border-line rounded-2xl px-4">
      <span className="text-4xl">🧙‍♂️</span>
      <p className="font-display font-bold uppercase text-lg mt-2">O Money Sênior escolheu outro jogo hoje</p>
      <p className="text-xs text-mut mt-1">{data.pick ? `Pick do dia: ${data.pick.jogo.timeCasa} x ${data.pick.jogo.timeFora}` : "Ainda calculando o pick do dia com os jogos disponíveis."}</p>
      <Link href="/money-tips" className="inline-block mt-4 px-5 py-2 rounded-full bg-purple text-white text-xs font-extrabold">VER MONEY TIPS →</Link>
    </div>
  );
}