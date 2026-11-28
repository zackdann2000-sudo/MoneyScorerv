"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Radar, ChevronDown, ChevronUp, Search } from "lucide-react";
import DateStrip, { toYmd } from "@/components/DateStrip";
import { Crest, SourceFoot, EmptyState } from "@/components/ui";
import TipsGate from "@/components/TipsGate";

// Componente de etapa declarado no escopo do módulo (criar componente dentro do render
// remonta a subárvore a cada tecla digitada e é apontado por react-hooks/static-components).
function Step({ n, title, children, done, step, setStep }: { n: number; title: string; children: React.ReactNode; done?: string; step: number; setStep: (s: number) => void }) {
  return (
    <div className="bg-panel border border-line rounded-2xl overflow-hidden">
      <button onClick={() => setStep(step === n ? 0 : n)} className="w-full flex items-center gap-3 p-3.5">
        <span className={`w-7 h-7 rounded-full flex items-center justify-center font-display font-bold text-sm ${step === n ? "bg-acc text-black" : "bg-panel2 text-acc border border-acc/40"}`}>{n}</span>
        <span className="font-display font-bold uppercase tracking-wide">{title}</span>
        {done && step !== n && <span className="ml-auto text-[10px] text-acc font-bold truncate max-w-32">{done}</span>}
        {step === n ? <ChevronUp size={15} className="text-mut ml-auto shrink-0" /> : <ChevronDown size={15} className="text-mut shrink-0" />}
      </button>
      {step === n && <div className="px-3.5 pb-3.5">{children}</div>}
    </div>
  );
}

export default function Detector() {
  const [opts, setOpts] = useState<any>(null);
  const [step, setStep] = useState(1);
  const [metric, setMetric] = useState("gf");
  const [line, setLine] = useState(0.5);
  const [date, setDate] = useState(toYmd(new Date()));
  const [league, setLeague] = useState("all");
  const [sample, setSample] = useState<5 | 10>(10);
  const [local, setLocal] = useState("both");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [modoDesapito, setModoDesapito] = useState(false);

  useEffect(() => { fetch("/api/detector").then((r) => r.json()).then(setOpts).catch(() => {}); }, []);
  const metrics = useMemo(() => opts?.metrics || [], [opts]);
  const cats = useMemo(() => [...new Set(metrics.map((m: any) => m.cat))] as string[], [metrics]);
  const curMetric = metrics.find((m: any) => m.id === metric);
  const [cat, setCat] = useState("Gols");

  const run = async () => {
    setLoading(true); setRes(null); setPage(1);
    try {
      const r = await fetch("/api/detector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, league, metric, line, sample, local }) });
      setRes(await r.json());
    } catch { setRes({ results: [] }); }
    setLoading(false);
    setTimeout(() => document.getElementById("detector-results")?.scrollIntoView({ behavior: "smooth" }), 150);
  };

  const perPage = 5;
  const results = res?.results || [];
  const pages = Math.max(1, Math.ceil(results.length / perPage));
  const paged = results.slice((page - 1) * perPage, page * perPage);

  return (
    <TipsGate>
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Radar className="text-acc" size={26} />
        <div>
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide leading-none">Detector</h1>
          <p className="text-[10px] text-mut">Scanner de oportunidades · filtros cruzados no histórico real</p>
        </div>
      </div>

      <div className="space-y-2">
        <Step n={1} step={step} setStep={setStep} title="Mercado" done={curMetric ? `${curMetric.label} +${line}` : ""}>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {cats.map((c) => <button key={c} onClick={() => { setCat(c); const first = metrics.find((m: any) => m.cat === c); if (first) { setMetric(first.id); setLine(first.lines[0]); } }} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${cat === c ? "bg-acc text-black border-acc" : "bg-panel2 border-line text-mut"}`}>{c}</button>)}
          </div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            {metrics.filter((m: any) => m.cat === cat).map((m: any) => (
              <button key={m.id} onClick={() => { setMetric(m.id); setLine(m.lines[0]); }} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${metric === m.id ? "bg-cyanx/20 text-cyanx border-cyanx/50" : "bg-panel2 border-line text-mut"}`}>{m.label} · {m.periodo}</button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(curMetric?.lines || []).map((l: number) => <button key={l} onClick={() => setLine(l)} className={`px-3.5 py-1.5 rounded-lg text-[12px] font-display font-bold border ${line === l ? "bg-acc text-black border-acc" : "bg-panel2 border-line text-mut"}`}>+{String(l).replace(".", ",")}</button>)}
          </div>
        </Step>

        <Step n={2} step={step} setStep={setStep} title="Data" done={date}>
          <DateStrip value={date} onChange={setDate} days={7} />
        </Step>

        <Step n={3} step={step} setStep={setStep} title="Liga" done={league === "all" ? "Todas" : opts?.leagues?.find((l: any) => l.code === league)?.name}>
          <select value={league} onChange={(e) => setLeague(e.target.value)} className="w-full bg-panel2 border border-line rounded-xl px-3 py-2.5 text-sm font-semibold">
            <option value="all">🌍 Todas as principais</option>
            {(opts?.leagues || []).map((l: any) => <option key={l.code} value={l.code}>{l.flag} {l.name} — {l.country}</option>)}
          </select>
        </Step>

        <Step n={4} step={step} setStep={setStep} title="Amostragem" done={`Últimos ${sample}`}>
          <div className="grid grid-cols-2 gap-2">
            {([5, 10] as const).map((s) => (
              <button key={s} onClick={() => setSample(s)} className={`py-3 rounded-xl border font-display font-bold text-lg ${sample === s ? "bg-acc/15 border-acc text-acc" : "bg-panel2 border-line text-mut"}`}>
                <span className={`inline-block w-3 h-3 rounded-full border mr-2 ${sample === s ? "bg-acc border-acc" : "border-mut"}`} />ÚLTIMOS {s}
              </button>
            ))}
          </div>
        </Step>

        <Step n={5} step={step} setStep={setStep} title="Local" done={local === "home" ? "Casa" : local === "away" ? "Fora" : "Ambos"}>
          <select value={local} onChange={(e) => setLocal(e.target.value)} className="w-full bg-panel2 border border-line rounded-xl px-3 py-2.5 text-sm font-semibold">
            <option value="both">Casa e Fora (os dois times)</option>
            <option value="home">Só mandante (jogos em casa)</option>
            <option value="away">Só visitante (jogos fora)</option>
          </select>
        </Step>
      </div>

      <button onClick={run} disabled={loading} className="w-full mt-3 py-3.5 rounded-2xl bg-home text-white font-display font-bold text-xl tracking-widest disabled:opacity-60 card-hover">
        {loading ? "ANALISANDO JOGOS REAIS…" : "GERAR RESULTADOS"}
      </button>

      <div id="detector-results" className="mt-4">
        {loading && <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-28" />)}<p className="text-[10px] text-mut text-center">Cruzando histórico na ESPN — cache inteligente acelera as próximas buscas.</p></div>}
        {res && (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-mut font-bold">{results.length} oportunidade(s) ≥70% · {res.analyzed}/{res.scanned} jogos analisados</p>
              <label className="flex items-center gap-1.5 text-[10px] font-bold text-mut"><input type="checkbox" checked={modoDesapito} onChange={(e) => setModoDesapito(e.target.checked)} className="accent-[var(--acc)]" /> Desapitos</label>
            </div>
            {results.length === 0 && <EmptyState title="Nada ≥ 70% nesta combinação" sub="Troque a linha, a data ou a amostragem. O filtro é rigoroso de propósito." actionHref="/" actionLabel="VER JOGOS DE HOJE" />}
            <div className="space-y-2">
              {paged.map((r: any, i: number) => (
                <div key={i} className="bg-panel border border-line rounded-2xl p-3">
                  <p className="text-[10px] text-mut">{r.match.flag} {r.match.country} · {r.match.leagueName} · {new Date(r.match.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}h</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Crest src={r.match.home.logo} size={22} />
                    <span className="text-[12px] font-bold flex-1 truncate">{r.match.home.name} x {r.match.away.name}</span>
                    <Crest src={r.match.away.logo} size={22} />
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-[11px] font-bold">{r.mercado} · <span className="text-mut">{r.team.side === "home" ? "mandante" : "visitante"}</span></span>
                    <span className={`font-display font-bold text-lg ${r.pct >= 70 ? "text-acc" : "text-mut"}`}>({r.acertos}/{r.total})</span>
                    {r.baseParcial && <span className="text-[8px] font-bold bg-warn/15 text-warn px-1.5 py-0.5 rounded">BASE PARCIAL</span>}
                    <div className="flex gap-1 ml-auto">
                      {r.hist.map((h: any, j: number) => <span key={j} title={`${h.v}`} className={`w-2.5 h-2.5 rounded-full ${h.hit ? "bg-acc" : "bg-danger/80"}`} />)}
                    </div>
                  </div>
                  {modoDesapito && (
                    <p className={`text-[10px] font-extrabold mt-1 ${r.media - line >= 0 ? "text-acc" : "text-danger"}`}>
                      {r.media - line >= 0 ? "+" : ""}{(r.media - line).toFixed(1).replace(".", ",")} {r.media - line >= 0 ? "ACIMA" : "ABAIXO"} DA LINHA (média {r.media})
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-mut">{r.oddEstimada ? `Odd justa @${r.oddEstimada}` : "Odd indisponível"} · Fonte: ESPN</span>
                    <Link href={`/jogos/${r.match.id}?league=${r.match.league}`} className="px-3 py-1.5 rounded-lg bg-warn text-black text-[10px] font-extrabold">VER TUDO &gt;</Link>
                  </div>
                </div>
              ))}
            </div>
            {pages > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {Array.from({ length: pages }).map((_, i) => (
                  <button key={i} onClick={() => setPage(i + 1)} className={`w-7 h-7 rounded-lg text-[11px] font-bold ${page === i + 1 ? "bg-acc text-black" : "bg-panel border border-line text-mut"}`}>{i + 1}</button>
                ))}
              </div>
            )}
            <SourceFoot fonte="ESPN" extra="Regra de saída: acerto ≥ 70% na amostra escolhida" />
          </>
        )}
        {!res && !loading && (
          <div className="text-center py-8 text-mut">
            <Search size={26} className="mx-auto mb-2 opacity-50" />
            <p className="text-xs">Configure os 5 passos e toque em GERAR RESULTADOS.<br />O motor busca o histórico real de cada time na ESPN.</p>
          </div>
        )}
      </div>
    </div>
    </TipsGate>
  );
}