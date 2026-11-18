"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MoveHorizontal, BarChart3, ListOrdered } from "lucide-react";
import { Crest, SourceFoot, Modal } from "@/components/ui";
import { GoalsBars } from "@/components/charts";
import MoneySeniorCountdown from "./MoneySeniorCountdown";
import OddsCards from "./OddsCards";

type Team = { id: string; name: string; logo: string };

export default function OppTab({ matchId, league, home, away, odds, oddsSource }: { matchId: string; league: string; home: Team; away: Team; odds?: any; oddsSource?: string }) {
  const router = useRouter();
  const [side, setSide] = useState<"home" | "away">("home");
  const [view, setView] = useState<"ops" | "desapitos">("ops");
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [duplo, setDuplo] = useState(false);
  const [periodo, setPeriodo] = useState("full");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [chartOf, setChartOf] = useState<any>(null);
  const [slide, setSlide] = useState(0);
  const [moneyPick, setMoneyPick] = useState<any>(null);

  const team = side === "home" ? home : away;
  const load = useCallback(async (s: "home" | "away") => {
    setLoading(true);
    try {
      const r = await fetch(`/api/matches/${matchId}/opportunities?league=${league}&side=${s}`);
      const j = await r.json();
      setData((prev) => ({ ...prev, [s]: j }));
    } catch {}
    setLoading(false);
  }, [matchId, league]);

  const hasSide = !!data[side];
  const otherSide = side === "home" ? "away" : "home";
  const hasOther = !!data[otherSide];
  useEffect(() => {
    if (hasSide) return;
    const t = setTimeout(() => { load(side); }, 0);
    return () => clearTimeout(t);
  }, [hasSide, side, load]);
  useEffect(() => {
    if (view !== "desapitos" || !duplo || hasOther) return;
    const t = setTimeout(() => { load(otherSide); }, 0);
    return () => clearTimeout(t);
  }, [view, duplo, hasOther, otherSide, load]);

  /* Pick do dia — usado pelo banner de countdown do Money Sênior */
  useEffect(() => {
    let on = true;
    fetch("/api/money-tips")
      .then((r) => r.json())
      .then((j) => { if (on) setMoneyPick(j); })
      .catch(() => {});
    return () => { on = false; };
  }, []);

  const cur = data[side];
  const ops = cur?.oportunidades || [];
  const other = data[side === "home" ? "away" : "home"];
  const desapitos = useMemo(() => {
    let list = (cur?.desapitos || []).map((d: any) => ({ ...d, teamName: team.name }));
    if (duplo && other?.desapitos) {
      list = list.filter((d: any) => other.desapitos.some((o: any) => o.mercado === d.mercado && o.direcao === d.direcao));
    }
    return list;
  }, [cur, other, duplo, team.name]);

  return (
    <div>
      {/* Banner do Money Sênior — countdown até 12:00 (Brasília).
          No estado "revelado" ele vira botão e abre a lista de picks do dia. */}
      <div className="mb-3">
        <MoneySeniorCountdown
          hasPick={!!moneyPick?.pick}
          onReveal={() => router.push("/money-tips?tab=pick")}
        />
      </div>

      {/* Odds reais: API-Football (quando acha a fixture) → ESPN */}
      <div className="mb-3">
        <OddsCards
          odds={odds}
          source={oddsSource}
          home={home}
          away={away}
        />
      </div>

      {/* pílula Times / visão */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex bg-panel border border-line rounded-full p-0.5">
          <button onClick={() => setView("ops")} className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold ${view === "ops" ? "bg-acc text-black" : "text-mut"}`}>OPORTUNIDADES</button>
          <button onClick={() => setView("desapitos")} className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold ${view === "desapitos" ? "bg-acc text-black" : "text-mut"}`}>DESAPITOS</button>
        </div>
      </div>

      {/* seletor de time */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(["home", "away"] as const).map((s) => {
          const t = s === "home" ? home : away;
          return (
            <button key={s} onClick={() => { setSide(s); setSlide(0); }} className={`flex items-center gap-2 p-2 rounded-xl border transition-colors ${side === s ? "border-acc bg-acc/10" : "border-line bg-panel"}`}>
              <Crest src={t.logo} size={24} />
              <span className="text-[11px] font-bold truncate">{t.name}</span>
              <span className="ml-auto text-[8px] text-mut uppercase">{s === "home" ? "Casa" : "Fora"}</span>
            </button>
          );
        })}
      </div>

      {loading && !cur && <div className="space-y-2"><div className="skeleton h-6 w-52" /><div className="skeleton h-40" /><p className="text-[10px] text-mut text-center">Analisando últimos 10 jogos reais na ESPN…</p></div>}

      {cur && view === "ops" && (
        <>
          {ops.length > 0 && <p className="text-[10px] text-mut flex items-center gap-1 mb-1"><MoveHorizontal size={12} /> Arraste para o lado para ver mais opções</p>}
          {ops.length === 0 ? (
            <div className="text-center py-8 bg-panel border border-dashed border-line rounded-xl">
              <p className="font-display font-bold uppercase">Sem greens ≥ 7/10 nesta amostra</p>
              <p className="text-xs text-mut mt-1">Nenhum mercado bateu 70% nos últimos jogos. Veja os Desapitos para linhas alternativas.</p>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-3 px-3 pb-2"
              onScroll={(e) => { const el = e.currentTarget; setSlide(Math.round(el.scrollLeft / (el.clientWidth * 0.72))); }}>
              {ops.map((o: any, i: number) => (
                <div key={i} className="snap-start shrink-0 w-[72%] sm:w-[46%] bg-panel border border-line rounded-2xl p-4 relative card-hover">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-display font-bold text-lg leading-tight uppercase">{o.mercado}</p>
                      <p className="text-[10px] text-mut">{o.periodo} · Linha {o.linha}</p>
                    </div>
                    {o.baseParcial && <span className="text-[8px] font-bold bg-warn/15 text-warn px-1.5 py-0.5 rounded">BASE PARCIAL</span>}
                  </div>
                  <p className={`font-display font-bold text-4xl mt-3 ${o.acertos >= 7 ? "text-acc" : "text-mut"}`}>{o.acertos}<span className="text-lg text-mut">/{o.totalJogos}</span></p>
                  <p className="text-[10px] text-mut">taxa de acerto · média {o.media.toFixed(2)}</p>
                  <div className="flex gap-1 mt-2">
                    {o.hist.map((v: number, j: number) => <span key={j} className={`w-2.5 h-2.5 rounded-full ${v > 0 ? "bg-acc" : "bg-danger/70"}`} />)}
                  </div>
                  <div className="flex items-end justify-between mt-3">
                    <span className="text-[9px] text-mut">Fonte: ESPN</span>
                    {o.oddEstimada ? (
                      <span className="px-2.5 py-1 rounded-lg bg-acc/15 border border-acc/40 text-acc font-display font-bold">@{o.oddEstimada.toFixed(2)}</span>
                    ) : <span className="text-[9px] text-mut">Odd indisponível</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {ops.length > 1 && (
            <div className="flex justify-center gap-1.5 mt-1">
              {ops.slice(0, 8).map((_: any, i: number) => <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === Math.min(slide, 7) ? "bg-acc" : "bg-line"}`} />)}
            </div>
          )}
          <SourceFoot fonte="ESPN" amostra={cur.amostra} extra="Odd justa = 1/(taxa − 6%)" />
        </>
      )}

      {cur && view === "desapitos" && (
        <>
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <label className="flex items-center gap-1.5 text-[11px] font-bold text-mut">
              <input type="checkbox" checked={duplo} onChange={(e) => setDuplo(e.target.checked)} className="accent-[var(--acc)]" /> Desapito Duplo (2 times)
            </label>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="bg-panel border border-line rounded-lg px-2 py-1 text-[11px] font-semibold">
              <option value="full">Jogo completo</option>
              <option value="ht" disabled>1º tempo (requer Sportmonks)</option>
              <option value="2t" disabled>2º tempo (requer Sportmonks)</option>
            </select>
          </div>
          {desapitos.length === 0 && <p className="text-xs text-mut text-center py-8 bg-panel border border-dashed border-line rounded-xl">Nenhuma discrepância relevante {duplo ? "em comum entre os dois times" : "nesta amostra"} (|Δ| ≥ 1 e acerto ≥ 60%).</p>}
          <div className="space-y-2">
            {desapitos.map((dp: any, i: number) => (
              <div key={i} className="bg-panel border border-line rounded-xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-mut truncate">{team.name}</p>
                    <p className="text-[13px] font-bold">{dp.direcao === "ACIMA" ? "Mais de" : "Menos de"} {String(dp.linha).replace(".", ",")} {dp.mercado.toLowerCase()}</p>
                  </div>
                  <span className={`font-display font-bold text-2xl ${dp.pct >= 70 ? "text-acc" : "text-warn"}`}>{dp.pct}%</span>
                </div>
                <div className="flex items-center gap-1 mt-2 flex-wrap">
                  {dp.hist.map((v: number, j: number) => {
                    const hit = dp.direcao === "ACIMA" ? v > dp.linha : v < dp.linha;
                    return <span key={j} className={`w-6 h-6 rounded-full text-[9px] font-bold flex items-center justify-center border ${hit ? "bg-acc text-black border-acc" : "bg-panel2 text-mut border-line"}`}>{v}</span>;
                  })}
                  <span className={`ml-auto text-[10px] font-extrabold ${dp.direcao === "ACIMA" ? "text-acc" : "text-danger"}`}>{dp.diff > 0 ? "+" : ""}{String(dp.diff).replace(".", ",")} {dp.direcao} DA LINHA</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setExpanded(expanded === `${i}` ? null : `${i}`)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-panel2 border border-line text-[10px] font-bold"><ListOrdered size={11} /> Números</button>
                  <button onClick={() => setChartOf(dp)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-panel2 border border-line text-[10px] font-bold"><BarChart3 size={11} /> Gráfico</button>
                  {dp.baseParcial && <span className="ml-auto text-[8px] font-bold bg-warn/15 text-warn px-1.5 py-0.5 rounded self-center">BASE PARCIAL</span>}
                </div>
                {expanded === `${i}` && (
                  <div className="mt-2 border-t border-line pt-2 space-y-1">
                    {(cur.jogos || []).slice(0, dp.hist.length).reverse().map((g: any, j: number) => (
                      <div key={j} className="flex items-center gap-2 text-[11px]">
                        <Crest src={g.opp.logo} size={14} />
                        <span className="truncate flex-1">{g.opp.name}</span>
                        <span className="text-mut">{g.home ? "Casa" : "Fora"}</span>
                        <span className="font-bold">{g.gf}x{g.ga}</span>
                        <span className="font-display font-bold text-acc w-6 text-right">{dp.hist[j]}</span>
                      </div>
                    ))}
                  </div>
                )}
                <SourceFoot fonte="ESPN" amostra={dp.total} />
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={!!chartOf} onClose={() => setChartOf(null)} title={chartOf ? `${chartOf.mercado} — últimos jogos` : ""}>
        {chartOf && (
          <GoalsBars line={chartOf.linha} color="#23e57b"
            games={chartOf.hist.map((v: number, j: number) => ({ opp: cur?.jogos ? [...cur.jogos].reverse()[j]?.opp?.short || `J${j + 1}` : `J${j + 1}`, logo: cur?.jogos ? [...cur.jogos].reverse()[j]?.opp?.logo : "", valor: v }))} />
        )}
        <p className="text-[10px] text-mut mt-2">Linha tracejada = {chartOf?.linha} · verde acima da linha</p>
      </Modal>
    </div>
  );
}