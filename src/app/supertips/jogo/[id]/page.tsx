"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";
import { VipLock, StatCompareRow, SourceFoot, Modal, Toggle } from "@/components/ui";
import { WdlDonut, CmpBars, ChatFab } from "@/components/supertips/bits";
import { Timeline } from "@/components/match/InfoTabs";
import LineupPitch from "@/components/Lineup";
import { useApp } from "@/context/AppContext";

const TABS = [
  { id: "comparar", label: "Comparar" },
  { id: "eventos", label: "Eventos" },
  { id: "estatisticas", label: "Estatísticas" },
  { id: "escalacoes", label: "Escalações" },
  { id: "jogadores", label: "Jogadores" },
  { id: "h2h", label: "H2H" },
];

function Inner() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const league = sp.get("league") || "bra.1";
  const sport = sp.get("sport") || "football";
  const router = useRouter();
  const { flags, setFlags, addToast } = useApp();
  const [tab, setTab] = useState("comparar");
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");
  const [split, setSplit] = useState<"all" | "home" | "away">("all");
  const [bell, setBell] = useState(sp.get("bell") === "1");

  const notFootball = sport !== "football";
  const shownErr = notFootball
    ? "Comparativo completo está disponível para futebol (ESPN soccer). NBA e tênis ficam na lista de palpites."
    : err;

  useEffect(() => {
    if (sport !== "football") return; // sem fetch: a mensagem é derivada no render
    let cancelled = false;
    fetch(`/api/supertips/compare?id=${id}&league=${league}`)
      .then((r) => r.json())
      .then((j) => { if (cancelled) return; if (j.error) setErr(j.error); else { setErr(""); setD(j); } })
      .catch(() => { if (!cancelled) setErr("Falha de conexão."); });
    return () => { cancelled = true; };
  }, [id, league, sport]);

  if (shownErr) return (
    <div className="text-center py-12">
      <p className="font-display font-bold uppercase">{shownErr}</p>
      <Link href="/supertips" className="inline-block mt-3 px-4 py-2 rounded-full bg-acc text-black text-xs font-extrabold">VOLTAR</Link>
    </div>
  );
  if (!d) return <div className="space-y-2"><div className="skeleton h-16" /><div className="skeleton h-40" /><div className="skeleton h-64" /></div>;

  const m = d.match;
  const hs = d.home.split[split], as_ = d.away.split[split];
  const seasonH = d.model?.season?.home, seasonA = d.model?.season?.away;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => router.push("/supertips")} className="p-2 rounded-full bg-[#141820] border border-white/10"><ArrowLeft size={16} /></button>
        <p className="font-display font-bold text-lg flex-1 text-center truncate">{m.home.name} - {m.away.name}</p>
        <button onClick={() => setBell(true)} className="p-2 text-warn"><Bell size={16} /></button>
      </div>
      <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-white/10 mb-3">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`shrink-0 px-3 py-2 text-[11px] font-extrabold border-b-2 -mb-px ${tab === t.id ? "text-[#e8b923] border-[#e8b923]" : "text-mut border-transparent"}`}>{t.label}</button>
        ))}
      </div>

      {tab === "comparar" && (
        <div className="space-y-4">
          <div className="flex justify-center gap-4 text-[10px] font-bold"><span className="text-[#e8b923]">● {m.home.short || m.home.name}</span><span className="text-[#3b82f6]">● {m.away.short || m.away.name}</span></div>
          <section>
            <p className="font-display font-bold uppercase text-sm mb-2 border-l-4 border-[#e8b923] pl-2">Resultados da época (V·E·D)</p>
            {seasonH && seasonA ? (
              <div className="bg-[#141820] border border-white/5 rounded-2xl p-4 flex justify-around">
                <WdlDonut w={seasonH.w} d={seasonH.d} l={seasonH.l} label={m.home.short || m.home.name} />
                <WdlDonut w={seasonA.w} d={seasonA.d} l={seasonA.l} label={m.away.short || m.away.name} />
              </div>
            ) : <p className="text-xs text-mut bg-[#141820] rounded-xl p-4">Tabela da competição indisponível na ESPN — donut da época omitido.</p>}
          </section>
          <section>
            <div className="flex items-center justify-between mb-2">
              <p className="font-display font-bold uppercase text-sm border-l-4 border-[#e8b923] pl-2">Comparação</p>
              <div className="flex bg-black/30 rounded-full p-0.5">
                {([["all", "TODOS"], ["home", "EM CASA"], ["away", "FORA"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setSplit(k)} className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${split === k ? "bg-[#e8b923] text-black" : "text-mut"}`}>{l}</button>
                ))}
              </div>
            </div>
            <p className="text-[9px] text-mut mb-1">{split === "all" ? "Últimos jogos (amostra ESPN), não a tabela inteira." : `Filtro de mando na amostra recente · ${hs.gp} x ${as_.gp} jogos.`}</p>
            <CmpBars left={m.home.short || "Casa"} right={m.away.short || "Fora"} rows={[
              { label: "Partidas", a: hs.gp, b: as_.gp },
              { label: "Vitórias", a: hs.w, b: as_.w },
              { label: "Empates", a: hs.d, b: as_.d },
              { label: "Derrotas", a: hs.l, b: as_.l },
              { label: "Gols", a: hs.gf, b: as_.gf },
              { label: "Média de gols", a: hs.avg, b: as_.avg },
            ]} />
          </section>
          <section>
            <p className="font-display font-bold uppercase text-sm mb-2 border-l-4 border-[#e8b923] pl-2">Gols por minuto</p>
            <MinuteChart home={d.home.goalsMin} away={d.away.goalsMin} hn={m.home.short || "Casa"} an={m.away.short || "Fora"} />
            <SourceFoot fonte="ESPN eventos" amostra={Math.min(d.home.sample, d.away.sample)} extra="Só gols com minuto publicado" />
          </section>
          <section>
            <p className="font-display font-bold uppercase text-sm mb-2 border-l-4 border-[#e8b923] pl-2">Cartões</p>
            <CardsBlock title={m.home.name} data={d.home.cards} />
            <CardsBlock title={m.away.name} data={d.away.cards} />
          </section>
          <section>
            <p className="font-display font-bold uppercase text-sm mb-2 border-l-4 border-[#e8b923] pl-2">Recordes (amostra recente)</p>
            <div className="grid grid-cols-2 gap-2">
              <Rec title={m.home.name} r={d.home.records} />
              <Rec title={m.away.name} r={d.away.records} />
            </div>
          </section>
          <section>
            <p className="font-display font-bold uppercase text-sm mb-2 border-l-4 border-[#e8b923] pl-2">Desfalques</p>
            <Inj title={m.home.name} data={d.home.injuries} />
            <Inj title={m.away.name} data={d.away.injuries} />
          </section>
          <section>
            <p className="font-display font-bold uppercase text-sm mb-2 border-l-4 border-purple pl-2">Probabilidade</p>
            {d.model?.probs ? (
              <div className="bg-[#141820] rounded-2xl p-3 text-[12px] space-y-1">
                <p>Modelo (tabela): <b>1 {Math.round(d.model.probs.home * 100)}%</b> · X {Math.round(d.model.probs.draw * 100)}% · <b>2 {Math.round(d.model.probs.away * 100)}%</b></p>
                <p>Over 2.5 {d.model.over25 != null ? Math.round(d.model.over25 * 100) + "%" : "—"} · Ambas marcam {d.model.btts != null ? Math.round(d.model.btts * 100) + "%" : "—"}</p>
                {d.implied && <p className="text-mut">Implícita nas odds ({d.implied.provider}): 1 {Math.round(d.implied.home * 100)}% · X {Math.round(d.implied.draw * 100)}% · 2 {Math.round(d.implied.away * 100)}% · margem {(d.implied.margin * 100).toFixed(1)}%</p>}
                {!d.odds && <p className="text-mut">Odds de mercado não publicadas pela ESPN neste jogo.</p>}
              </div>
            ) : <p className="text-xs text-mut">Sem amostra na tabela para estimar probabilidade.</p>}
            {d.odds && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[11px] bg-[#141820] rounded-xl">
                  <thead><tr className="text-mut text-[9px] uppercase"><th className="text-left p-2">Casa</th><th>1</th><th>X</th><th>2</th><th>+2.5</th><th>-2.5</th></tr></thead>
                  <tbody><tr className="font-bold text-center">
                    <td className="text-left p-2">{d.odds.provider}</td>
                    <td>{d.odds.home ?? "—"}</td><td>{d.odds.draw ?? "—"}</td><td>{d.odds.away ?? "—"}</td>
                    <td>{d.odds.over ?? "—"}</td><td>{d.odds.under ?? "—"}</td>
                  </tr></tbody>
                </table>
                <p className="text-[9px] text-mut mt-1">A ESPN gratuita traz uma casa (geralmente DraftKings). Outras casas não são inventadas.</p>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "eventos" && <div className="bg-[#141820] rounded-2xl p-3"><Timeline events={d.events || []} vip={!!d.vip} /></div>}
      {tab === "estatisticas" && (
        <div className="bg-[#141820] rounded-2xl p-3">
          {(d.stats || []).length === 0 ? <p className="text-xs text-mut text-center py-6">Estatísticas ao vivo aparecem quando a ESPN publica o boxscore.</p> : d.stats.map((s: any) => <StatCompareRow key={s.key} label={s.label} home={s.home} away={s.away} />)}
          <SourceFoot fonte="ESPN" />
        </div>
      )}
      {tab === "escalacoes" && (
        d.vip ? (
          d.lineups?.home?.xi?.length ? <div className="bg-[#141820] rounded-2xl p-3"><LineupPitch home={d.lineups.home} away={d.lineups.away} homeName={m.home.name} awayName={m.away.name} /><SourceFoot fonte="ESPN" /></div>
            : <p className="text-xs text-mut text-center py-8">Escalação ainda não divulgada.</p>
        ) : <VipLock label="Escalações são VIP"><div className="h-48" /></VipLock>
      )}
      {tab === "jogadores" && (
        <div className="space-y-2">
          <p className="text-[10px] text-mut">Só entram atletas que marcaram em pelo menos 7 dos últimos jogos da amostra. Finalizações por jogador não existem na ESPN gratuita — não simulamos.</p>
          {(d.playerPicks || []).length === 0 && <p className="text-xs text-center text-mut py-8 bg-[#141820] rounded-2xl">Nenhum jogador com 7+ jogos marcando gol nesta amostra.</p>}
          {(d.playerPicks || []).map((p: any) => (
            <div key={p.name + p.team} className="bg-[#141820] border border-white/5 rounded-2xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold">{p.name.slice(0, 1)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold truncate">{p.name}</p>
                <p className="text-[10px] text-mut">{p.team} · {p.market}</p>
              </div>
              <div className="text-right">
                <p className="font-display font-bold text-xl text-acc">{p.hits}/{p.total}</p>
                <p className="text-[10px] text-mut">{p.odd ? `@${p.odd}` : "odd indisponível"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "h2h" && (
        <div className="space-y-3">
          {(d.h2h?.games || []).length === 0 ? <p className="text-xs text-mut text-center py-8">Sem confrontos diretos recentes na ESPN.</p> : (
            <>
              <H2HBar games={d.h2h.games} homeId={m.home.id} awayId={m.away.id} />
              {d.h2hRates && <p className="text-[11px] text-mut">Nos últimos {d.h2hRates.n} H2H: over 2.5 em {d.h2hRates.over25}% · ambas marcam em {d.h2hRates.btts}%.</p>}
              {d.h2h.games.slice(0, 8).map((g: any) => (
                <div key={g.id} className="flex items-center gap-2 text-[11px] bg-[#141820] rounded-xl p-2">
                  <span className="text-mut w-14">{new Date(g.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                  <span className="flex-1 truncate">{g.homeName}</span>
                  <b>{g.homeScore}-{g.awayScore}</b>
                  <span className="flex-1 truncate text-right">{g.awayName}</span>
                </div>
              ))}
            </>
          )}
          {d.indicators && (
            <div className="bg-[#141820] rounded-2xl p-3">
              <p className="text-[10px] font-extrabold uppercase text-mut mb-2">Indicadores (amostra real, sem faixa de odd)</p>
              <IndRow label="Não sofreu gol" a={d.indicators.home.cleanSheet} b={d.indicators.away.cleanSheet} />
              <IndRow label="Marcou" a={d.indicators.home.scored} b={d.indicators.away.scored} />
              <IndRow label="Não perdeu" a={d.indicators.home.unbeaten} b={d.indicators.away.unbeaten} />
              <p className="text-[9px] text-mut mt-2">{d.indicators.oddsBands.note}</p>
            </div>
          )}
        </div>
      )}

      <Modal open={bell} onClose={() => setBell(false)} title="Alertas deste jogo">
        <div className="divide-y divide-line">
          <Toggle on={flags.goals} onChange={(v) => setFlags({ ...flags, goals: v })} label="Gols" />
          <Toggle on={flags.redCards} onChange={(v) => setFlags({ ...flags, redCards: v })} label="Vermelhos" />
          <Toggle on={flags.matchEnd} onChange={(v) => setFlags({ ...flags, matchEnd: v })} label="Fim de jogo" />
        </div>
        <button onClick={() => { setFlags(flags); fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId: m.home.id, matchId: id, alerts: flags }) }); setBell(false); addToast({ title: "Alerta salvo", body: "Vale para os times deste confronto se você estiver logado." }); }} className="w-full mt-3 py-2.5 rounded-xl bg-acc text-black font-extrabold text-sm">SALVAR</button>
      </Modal>
      <ChatFab matchId={String(id)} />
    </div>
  );
}

function MinuteChart({ home, away, hn, an }: { home: any; away: any; hn: string; an: string }) {
  const max = Math.max(1, ...home.counts, ...away.counts);
  return (
    <div className="bg-[#141820] rounded-2xl p-3">
      <div className="flex justify-between text-[10px] font-bold mb-2"><span className="text-[#e8b923]">{hn}</span><span className="text-[#3b82f6]">{an}</span></div>
      {home.labels.map((lb: string, i: number) => (
        <div key={lb} className="grid grid-cols-[1fr_42px_1fr] items-center gap-1 py-0.5">
          <div className="h-2 bg-white/5 rounded-full overflow-hidden flex justify-end"><div className="h-full bg-[#e8b923]" style={{ width: `${(home.counts[i] / max) * 100}%` }} /></div>
          <span className="text-[9px] text-center text-mut">{lb}</span>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-[#3b82f6]" style={{ width: `${(away.counts[i] / max) * 100}%` }} /></div>
        </div>
      ))}
      <p className="text-[9px] text-mut mt-1">{home.events + away.events} gols com minuto na amostra</p>
    </div>
  );
}
function CardsBlock({ title, data }: { title: string; data: any }) {
  if (!data?.available) return <p className="text-[11px] text-mut mb-2">{title}: {data?.note || "sem dados"}</p>;
  return (
    <div className="bg-[#141820] rounded-2xl p-3 mb-2">
      <p className="text-[12px] font-bold">{title}</p>
      <p className="text-[11px]">Média {data.avg} cartões/jogo (time + adversário) · {data.suggestion} · {data.under}/{data.total}</p>
    </div>
  );
}
function Rec({ title, r }: { title: string; r: any }) {
  return (
    <div className="bg-[#141820] rounded-xl p-3 text-[11px]">
      <p className="font-bold mb-1">{title}</p>
      <p>Sequência: <b>{r.streak}</b></p>
      <p>Maior vitória: {r.biggestWin}</p>
      <p>Maior derrota: {r.biggestLoss}</p>
      <p>Pênaltis (amostra): {r.penalties}</p>
    </div>
  );
}
function Inj({ title, data }: { title: string; data: any }) {
  return (
    <div className="mb-2">
      <p className="text-[11px] font-bold">{title}</p>
      {data?.items?.length ? data.items.map((i: any, n: number) => (
        <p key={n} className="text-[11px] text-mut">{i.name} · <span className="text-warn">{i.status}</span> {i.detail}</p>
      )) : <p className="text-[11px] text-mut">{data?.note}</p>}
    </div>
  );
}
function H2HBar({ games, homeId, awayId }: { games: any[]; homeId: string; awayId: string }) {
  let hw = 0, dr = 0, aw = 0;
  games.forEach((g) => {
    if (g.homeScore === g.awayScore) dr++;
    else {
      const wid = g.homeScore > g.awayScore ? g.homeId : g.awayId;
      if (wid === homeId) hw++; else if (wid === awayId) aw++;
    }
  });
  const t = games.length || 1;
  return (
    <div className="flex h-7 rounded-lg overflow-hidden font-display font-bold text-xs">
      {hw > 0 && <div className="bg-home text-black flex items-center justify-center" style={{ width: `${(hw / t) * 100}%` }}>{hw}</div>}
      {dr > 0 && <div className="bg-white/20 flex items-center justify-center" style={{ width: `${(dr / t) * 100}%` }}>{dr}</div>}
      {aw > 0 && <div className="bg-away text-black flex items-center justify-center" style={{ width: `${(aw / t) * 100}%` }}>{aw}</div>}
    </div>
  );
}
function IndRow({ label, a, b }: { label: string; a: any; b: any }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[11px]">
      <span className="w-16 text-center font-bold text-acc">{a.pct}%<br /><span className="text-[9px] text-mut">{a.hits}/{a.total}</span></span>
      <span className="text-mut text-center flex-1">{label}</span>
      <span className="w-16 text-center font-bold text-[#3b82f6]">{b.pct}%<br /><span className="text-[9px] text-mut">{b.hits}/{b.total}</span></span>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="skeleton h-64" />}><Inner /></Suspense>;
}