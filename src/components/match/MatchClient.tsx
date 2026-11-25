"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Bell, MapPin } from "lucide-react";
import { Crest, FavStar, LiveBadge, Modal, Toggle } from "@/components/ui";
import { useApp } from "@/context/AppContext";
import TipsGate from "@/components/TipsGate";
import OppTab from "./OppTab";
import MercadosTab from "./MercadosTab";
import IaTab from "./IaTab";
import { PreLiveTab, H2HTab, StatsTab, TabelaTab, LiveTab, MoneyTab, FormacoesTab, JogadoresTab } from "./InfoTabs";
import ComboTab from "./ComboTab";
import { H2HRealTab } from "./H2HTab";
import PropsTab from "./PropsTab";

const TABS = [
  { id: "oportunidades", label: "OPORTUNIDADES" },
  { id: "mercados", label: "MERCADOS" },
  { id: "combo", label: "COMBO" },
  { id: "prelive", label: "PRÉ LIVE" },
  { id: "live", label: "LIVE" },
  { id: "h2h", label: "H2H" },
  { id: "h2hreal", label: "H2H REAL" },
  { id: "jogadores", label: "JOGADORES" },
  { id: "props", label: "PROPS" },
  { id: "estatisticas", label: "ESTATÍSTICAS" },
];

/* Funcionalidades que não são abas principais, mas continuam acessíveis */
const EXTRA_CHIPS = [
  { id: "ia", label: "IA ANALISTA", icon: "🤖" },
  { id: "formacoes", label: "FORMAÇÕES", icon: "📋" },
  { id: "tabela", label: "CLASSIFICAÇÃO", icon: "🏆" },
  { id: "money-tips", label: "MONEY 🧙", icon: "" },
];

const ALL_IDS = [...TABS.map((t) => t.id), ...EXTRA_CHIPS.map((c) => c.id)];

export default function MatchClient({ id, league }: { id: string; league: string }) {
  const sp = useSearchParams();
  const router = useRouter();
  const { flags, setFlags, addToast } = useApp();
  const [tab, setTab] = useState(sp.get("tab") && ALL_IDS.includes(sp.get("tab")!) ? sp.get("tab")! : "oportunidades");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [bellOpen, setBellOpen] = useState(false);
  const [spec, setSpec] = useState<any>(null);
  const [specLoading, setSpecLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    try {
      const r = await fetch(`/api/matches/${id}?league=${league}`);
      const j = await r.json();
      if (j.error) { if (!silent) setErr(j.error); return; }
      setD(j); setErr("");
    } catch { if (!silent) setErr("Falha de conexão. Tente novamente."); }
  }, [id, league]);

  useEffect(() => {
    (async () => {
      try {
        const j = await fetch(`/api/matches/${id}?league=${league}`).then((r) => r.json());
        if (j.error) { setErr(j.error); return; }
        setD(j); setErr("");
      } catch { setErr("Falha de conexão. Tente novamente."); }
    })();
  }, [id, league]);
  useEffect(() => {
    fetch(`/api/matches/${id}/strategy?league=${league}`).then((r) => r.json()).then((j) => { setSpec(j); setSpecLoading(false); }).catch(() => setSpecLoading(false));
  }, [id, league]);
  useEffect(() => {
    if (!d?.match?.live) return;
    const t = setInterval(() => load(true), 40000);
    return () => clearInterval(t);
  }, [d?.match?.live, load]);

  const m = d?.match;
  /* Jogo encerrado: a aba LIVE passa a se chamar RESUMO, e os componentes de
     análise recebem a flag para não falarem em "ao vivo" nem mostrar FIRE. */
  const encerrado = !!m?.finished;
  const saveBell = () => {
    setFlags(flags);
    if (m) {
      fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId: m.home.id, matchId: id, alerts: flags }) }).catch(() => {});
      fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId: m.away.id, matchId: id, alerts: flags }) }).catch(() => {});
    }
    setBellOpen(false);
    addToast({ title: "🔔 Alertas salvos!", body: "Você será avisado dos eventos selecionados deste confronto." });
  };

  if (err) return (
    <div className="text-center py-16">
      <p className="font-display font-bold text-xl uppercase">Partida indisponível</p>
      <p className="text-xs text-mut mt-1">{err}</p>
      <Link href="/" className="inline-block mt-4 px-4 py-2 rounded-full bg-acc text-black text-xs font-extrabold">← VOLTAR AOS JOGOS</Link>
    </div>
  );
  if (!d) return <div className="space-y-2"><div className="skeleton h-44" /><div className="skeleton h-10" /><div className="skeleton h-72" /></div>;

  const score = m.state === "pre" ? new Date(m.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : `${m.home.score ?? 0} - ${m.away.score ?? 0}`;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => router.back()} className="p-2 bg-panel border border-line rounded-full"><ArrowLeft size={16} /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-acc truncate">{m.flag} {m.leagueName}</p>
          <p className="text-[10px] text-mut truncate">{new Date(m.date).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "America/Sao_Paulo" })}{d.venue ? ` · ${d.venue}` : ""}</p>
        </div>
        <button onClick={() => setBellOpen(true)} aria-label="Alertas deste jogo" className="p-2 bg-panel border border-line rounded-full text-warn"><Bell size={16} /></button>
      </div>

      {/* Cabeçalho estilo Flashscore */}
      <div className="bg-panel border border-line rounded-2xl p-4 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05] pitch pointer-events-none" />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col items-center gap-1.5 min-w-0">
            <Link href={`/times/${m.home.id}?league=${league}`}><Crest src={m.home.logo} size={56} alt={m.home.name} /></Link>
            <Link href={`/times/${m.home.id}?league=${league}`} className="text-[12px] font-bold text-center leading-tight line-clamp-2">{m.home.name}</Link>
            <FavStar team={{ id: m.home.id, name: m.home.name, league, logo: m.home.logo }} />
          </div>
          <div className="text-center px-1">
            <p className={`font-display font-bold text-5xl tabular-nums ${m.live ? "text-danger" : ""}`}>{score}</p>
            <div className="mt-1 flex justify-center">
              {m.live ? <LiveBadge clock={m.clock} /> : (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.finished ? "bg-panel2 text-mut" : "bg-acc/15 text-acc"}`}>{m.finished ? "ENCERRADO" : "AGENDADO"}</span>
              )}
            </div>
            {d.odds?.home && (
              <p className="text-[9px] text-mut mt-1.5">
                1 <b className="text-ink">{d.odds.home}</b> · X <b className="text-ink">{d.odds.draw}</b> · 2 <b className="text-ink">{d.odds.away}</b>
                {d.oddsSource && d.oddsSource !== "indisponível" && (
                  <span className={`ml-1.5 text-[8px] font-extrabold px-1 py-0.5 rounded-full ${d.oddsSource === "API-Football" ? "bg-acc/15 text-acc" : "bg-panel2 text-mut"}`}>{d.oddsSource}</span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col items-center gap-1.5 min-w-0">
            <Link href={`/times/${m.away.id}?league=${league}`}><Crest src={m.away.logo} size={56} alt={m.away.name} /></Link>
            <Link href={`/times/${m.away.id}?league=${league}`} className="text-[12px] font-bold text-center leading-tight line-clamp-2">{m.away.name}</Link>
            <FavStar team={{ id: m.away.id, name: m.away.name, league, logo: m.away.logo }} />
          </div>
        </div>
        {d.venue && <p className="relative text-center text-[9px] text-mut mt-2 flex items-center justify-center gap-1"><MapPin size={9} /> {d.venue}</p>}
        {specLoading && <p className="relative text-[11px] text-mut text-center mt-3">Lendo os últimos 10 jogos reais deste confronto...</p>}
        {!specLoading && spec?.strategy && (
          <div className="relative mt-3 flex items-center justify-between gap-2 rounded-lg bg-panel2 px-3 py-2">
            <div>
              <p className="text-[10px] uppercase font-bold text-mut">Melhor linha deste jogo · {spec.strategy.source}</p>
              <p className="text-sm font-bold text-ink">{spec.strategy.label} · {spec.strategy.pct}% em {spec.strategy.sample}</p>
            </div>
            {spec.strategy.result === "green" && <span className="text-acc text-xl font-bold" aria-label="Acertou">✓</span>}
            {spec.strategy.result === "red" && <span className="text-danger text-xl font-bold" aria-label="Errou">✗</span>}
            {!spec.strategy.result && <span className="text-[10px] font-bold text-mut">Aguardando início</span>}
          </div>
        )}
        {!specLoading && spec?.alternatives?.length > 0 && (
          <p className="relative text-[10px] text-mut mt-1">{spec.alternatives.map((a: any) => `${a.label} ${a.sample}`).join(" · ")}</p>
        )}
        {!specLoading && !spec?.strategy && <p className="relative text-[10px] text-mut text-center mt-2">{spec?.note || "Nenhuma linha com 70% nos jogos recentes destes times."}</p>}
        <p className="relative text-[10px] text-mut text-center mt-2">As odds podem mudar. Os valores são informativos e não garantem acerto.</p>
      </div>

      {/* Abas horizontais principais */}
      <div className="sticky top-14 z-40 bg-bg pt-2 pb-1 -mx-3 px-3">
        <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined} className={`shrink-0 px-3 py-2 text-[11px] font-extrabold tracking-wide border-b-2 -mb-px transition-colors ${tab === t.id ? "text-acc border-acc" : "text-mut border-transparent"}`}>{t.id === "live" && encerrado ? "RESUMO" : t.label}</button>
          ))}
        </div>
        {/* Chips secundários — mantém IA, Formações, Classificação e Money acessíveis */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-2 pb-0.5">
          {EXTRA_CHIPS.map((c) => (
            <button key={c.id} onClick={() => setTab(c.id)} aria-current={tab === c.id ? "page" : undefined} className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-extrabold border transition-colors ${tab === c.id ? "bg-acc text-black border-acc" : "bg-panel border-line text-mut"}`}>
              {c.icon ? `${c.icon} ` : ""}{c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-3 rise" key={tab}>
        {tab === "oportunidades" && <TipsGate><OppTab matchId={id} league={league} home={m.home} away={m.away} odds={d.odds} oddsSource={d.oddsSource} /></TipsGate>}
        {tab === "mercados" && <MercadosTab matchId={id} league={league} home={m.home} away={m.away} odds={d.odds} />}
        {tab === "combo" && <ComboTab league={league} />}
        {tab === "ia" && <TipsGate><IaTab matchId={id} league={league} odds={d.odds} /></TipsGate>}
        {tab === "prelive" && <PreLiveTab home={m.home} away={m.away} league={league} officials={d.officials} h2h={d.h2h} matchId={id} />}
        {tab === "live" && <LiveTab d={d} matchId={id} league={league} finished={encerrado} />}
        {tab === "h2h" && <H2HTab d={d} league={league} />}
        {tab === "h2hreal" && <H2HRealTab games={d.h2h?.games} oddPlacarComum={(d as any).odds?.placarComum ?? null} />}
        {tab === "jogadores" && <JogadoresTab matchId={id} league={league} home={m.home} away={m.away} lineups={d.lineups} vip={d.vip} />}
        {tab === "props" && <PropsTab matchId={id} league={league} home={m.home.name} away={m.away.name} />}
        {tab === "estatisticas" && <StatsTab d={d} matchId={id} league={league} />}
        {tab === "formacoes" && <FormacoesTab d={d} matchId={id} league={league} />}
        {tab === "tabela" && <TabelaTab league={league} homeId={m.home.id} awayId={m.away.id} />}
        {tab === "money-tips" && <TipsGate><MoneyTab matchId={id} /></TipsGate>}
      </div>

      {/* Modal de alertas do confronto */}
      <Modal open={bellOpen} onClose={() => setBellOpen(false)} title="🔔 Alertas deste jogo">
        <p className="text-[11px] text-mut mb-2">Escolha o que quer receber. Vale para os dois times deste confronto.</p>
        <div className="divide-y divide-line">
          <Toggle on={flags.goals} onChange={(v) => setFlags({ ...flags, goals: v })} label="⚽ Gols (e pênaltis)" />
          <Toggle on={flags.redCards} onChange={(v) => setFlags({ ...flags, redCards: v })} label="🟥 Cartões vermelhos" />
          <Toggle on={flags.yellowCards} onChange={(v) => setFlags({ ...flags, yellowCards: v })} label="🟨 Cartões amarelos" />
          <Toggle on={flags.corners} onChange={(v) => setFlags({ ...flags, corners: v })} label="🚩 Escanteios (agrupados)" />
          <Toggle on={flags.fouls} onChange={(v) => setFlags({ ...flags, fouls: v })} label="⚠️ Faltas" />
          <Toggle on={flags.offsides} onChange={(v) => setFlags({ ...flags, offsides: v })} label="🚫 Impedimentos" />
          <Toggle on={flags.matchStart} onChange={(v) => setFlags({ ...flags, matchStart: v })} label="🟢 Início de jogo" />
          <Toggle on={flags.matchEnd} onChange={(v) => setFlags({ ...flags, matchEnd: v })} label="🏁 Fim de jogo" />
          <Toggle on={flags.lineups} onChange={(v) => setFlags({ ...flags, lineups: v })} label="📋 Escalações divulgadas" />
          <Toggle on={flags.substitutions} onChange={(v) => setFlags({ ...flags, substitutions: v })} label="🔄 Substituições" />
        </div>
        <button onClick={saveBell} className="w-full mt-3 py-2.5 rounded-xl bg-acc text-black font-extrabold text-sm">SALVAR ALERTAS</button>
      </Modal>
    </div>
  );
}