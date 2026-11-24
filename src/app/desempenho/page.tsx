"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, Target, ArrowRight, Lock, LineChart } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Donut } from "@/components/charts";
import { SourceFoot } from "@/components/ui";

export default function Desempenho() {
  const [d, setD] = useState<any>(null);
  const [period, setPeriod] = useState("30");
  const [league, setLeague] = useState("all");
  const [market, setMarket] = useState("all");
  useEffect(() => {
    fetch(`/api/track-record?period=${period}&league=${encodeURIComponent(league)}&market=${encodeURIComponent(market)}`).then((r) => r.json()).then(setD).catch(() => {});
  }, [period, league, market]);

  if (!d) return <div className="space-y-2"><div className="skeleton h-8 w-56" /><div className="skeleton h-52" /><div className="skeleton h-40" /></div>;
  const s = d.last30 || {};
  /* Números de topo vêm da MESMA auditoria que a lista detalhada usa
     (`audit.summary`), montada pelo cron /api/track-record/run. Nada aqui é
     recalculado no cliente — se está na tela, veio do banco. */
  const km = d.audit?.summary ?? null;
  const resolvidas = (km?.greens ?? 0) + (km?.reds ?? 0);
  const comOdd = km?.priced ?? 0;
  const semHistorico = resolvidas === 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="text-acc" size={26} />
        <div>
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide leading-none">Track Record</h1>
          <p className="text-[10px] text-mut">Picks e modelo — só resultado real, inclusive os erros</p>
        </div>
      </div>

      <Audit audit={d.audit} period={period} setPeriod={setPeriod} league={league} setLeague={setLeague} market={market} setMarket={setMarket} />

      {/* ---------- KPIs de prova social: acerto, ROI, lucro e amostra ---------- */}
      <div className="rounded-2xl border border-acc/30 bg-gradient-to-br from-acc/[0.10] to-panel p-3 mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-wide text-acc">
            Win rate e ROI · {period === "all" ? "tudo" : `últimos ${period} dias`}
          </p>
          <p className="text-[9px] font-bold text-mut">
            {resolvidas} pick{resolvidas === 1 ? "" : "s"} liquidada{resolvidas === 1 ? "" : "s"}
          </p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <Kpi
            valor={km?.acc != null ? `${km.acc}%` : "—"}
            rotulo="Acerto"
            destaque={!semHistorico}
          />
          <Kpi
            valor={km?.roi != null ? `${(km.roi * 100).toFixed(1)}%` : "—"}
            rotulo="ROI por unidade"
            cor={km?.roi == null ? undefined : km.roi > 0 ? "text-acc" : "text-danger"}
          />
          <Kpi
            valor={km?.profit != null && km?.priced ? `${km.profit > 0 ? "+" : ""}${km.profit.toFixed(2)}u` : "—"}
            rotulo="Lucro em unidades"
            cor={km?.profit == null ? undefined : km.profit > 0 ? "text-acc" : "text-danger"}
          />
          <Kpi
            valor={String(comOdd || 0)}
            rotulo="Picks com odd"
          />
        </div>
        {semHistorico ? (
          <p className="mt-2 text-[10px] leading-snug text-mut">
            Zero resultado ainda. Preferimos mostrar “—” a inventar um número de acerto.
          </p>
        ) : comOdd > 0 && comOdd < 30 ? (
          <p className="mt-2 text-[10px] leading-snug text-warn">
            Amostra de {comOdd} pick{comOdd === 1 ? "" : "s"} com odd: ainda é pouco para
            tratar o número como prova. Conforme o histórico crescer, ele manda.
          </p>
        ) : (
          <p className="mt-2 text-[10px] leading-snug text-mut">
            ROI calculado só nas picks que tinham odd publicada no momento do pick. Pick sem
            cotação entra no acerto, mas não no lucro.
          </p>
        )}
      </div>

      {semHistorico ? (
        <TrackRecordVazio />
      ) : (
        <div className="bg-panel border border-line rounded-2xl p-4 mb-3">
        <p className="text-[10px] font-bold text-mut uppercase text-center">Taxa de acerto global · últimos 30 dias (favorito do modelo 1X2)</p>
        <Donut greens={s.greens || 0} reds={s.reds || 0} pending={s.pending || 0} />
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {[["Greens", s.greens, "text-acc"], ["Reds", s.reds, "text-danger"], ["Pendentes", s.pending, "text-mut"], ["Total prev.", d.totalPredictions, "text-ink"]].map(([l, v, c]: any, i) => (
            <div key={i} className="bg-panel2 rounded-xl p-2"><p className={`font-display font-bold text-xl ${c}`}>{v ?? 0}</p><p className="text-[8px] text-mut uppercase">{l}</p></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2 text-center">
          <div className="bg-panel2 rounded-xl p-2">
            <p className="font-display font-bold text-lg text-cyanx">{d.brier ?? "—"}</p>
            <p className="text-[8px] text-mut uppercase">Brier Score (menor = melhor)</p>
          </div>
          <div className="bg-panel2 rounded-xl p-2">
            <p className="font-display font-bold text-lg text-mut">{d.baselineBrier}</p>
            <p className="text-[8px] text-mut uppercase">Baseline (33/33/33)</p>
          </div>
        </div>
        {s.total === 0 && <p className="text-[11px] text-mut text-center mt-3 bg-panel2 rounded-xl p-3">Ainda sem previsões liquidadas. Cada análise gerada na aba IA é salva antes do jogo e avaliada automaticamente após o apito final — sem maquiagem retroativa.</p>}
      </div>
      )}

      {d.byLeague && Object.keys(d.byLeague).length > 0 && (
        <div className="bg-panel border border-line rounded-2xl p-4 mt-3">
          <p className="text-[10px] font-bold text-mut uppercase mb-2">Desempenho por liga</p>
          {Object.entries(d.byLeague).map(([lg, v]: any) => (
            <div key={lg} className="flex items-center gap-2 py-1 text-[12px]">
              <span className="flex-1 font-semibold">{lg}</span>
              <span className="text-acc font-bold">{v.greens}/{v.total}</span>
              <span className="text-mut text-[10px]">{Math.round((v.greens / v.total) * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-panel border border-line rounded-2xl p-3 mt-3">
        <p className="text-[10px] font-bold text-mut uppercase mb-2 flex items-center gap-1"><Target size={12} /> Previsões recentes</p>
        {(d.recent || []).length === 0 && <p className="text-xs text-mut text-center py-4">Abra a aba IA de qualquer jogo para gerar a primeira previsão.</p>}
        {(d.recent || []).map((p: any) => (
          <Link key={p.matchId} href={`/jogos/${p.matchId}?tab=ia&league=${p.league}`} className="flex items-center gap-2 py-2 border-b border-line/50 last:border-0 text-[11px]">
            <span className={`w-2 h-2 rounded-full shrink-0 ${p.green == null ? "bg-mut" : p.green ? "bg-acc" : "bg-danger"}`} />
            <div className="min-w-0 flex-1">
              <p className="font-bold truncate">{p.home} x {p.away}</p>
              <p className="text-[9px] text-mut">{p.model} · {p.probs.map((x: number) => `${Math.round(x * 100)}%`).join(" / ")}</p>
            </div>
            <span className="font-display font-bold">{p.score || "pend."}</span>
          </Link>
        ))}
      </div>

      {d.picks?.length > 0 && (
        <div className="bg-panel border border-line rounded-2xl p-3 mt-3">
          <p className="text-[10px] font-bold text-mut uppercase mb-2">🧙‍️ Histórico Money Tips</p>
          {d.picks.map((p: any) => (
            <div key={p.date} className="flex items-center gap-2 py-1.5 text-[11px] border-b border-line/50 last:border-0">
              <span className="text-mut w-16">{p.date.slice(6, 8)}/{p.date.slice(4, 6)}</span>
              <span className="flex-1 truncate font-semibold">{p.payload?.jogo?.timeCasa} · {p.payload?.oportunidade?.mercado} {p.payload?.oportunidade?.linha}</span>
              <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${p.settled ? (p.green ? "bg-acc/15 text-acc" : "bg-danger/15 text-danger") : "bg-panel2 text-mut"}`}>{p.settled ? (p.green ? "GREEN" : "RED") : "PENDENTE"}</span>
            </div>
          ))}
        </div>
      )}
      <SourceFoot fonte="Modelo próprio (dc-poisson-1.0 / fallback_simples) + resultados ESPN" extra="Avaliação temporal: só dados anteriores ao jogo" />
    </div>
  );
}

function Audit({ audit, period, setPeriod, league, setLeague, market, setMarket }: any) {
  const s = audit?.summary;
  if (!audit) return <div className="skeleton h-40 mb-3" />;
  return (
    <div className="bg-panel border border-line rounded-2xl p-4 mb-3">
      <p className="font-display font-bold uppercase">Money Tips · auditoria</p>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-2">
        {[["7", "7 dias"], ["30", "30 dias"], ["90", "90 dias"], ["all", "Tudo"]].map(([id, l]) => (
          <button key={id} onClick={() => setPeriod(id)} className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-extrabold ${period === id ? "bg-acc text-black" : "bg-panel2 text-mut"}`}>{l}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-2">
        <select value={league} onChange={(e) => setLeague(e.target.value)} className="bg-panel2 border border-line rounded-lg px-2 py-1.5 text-[11px]">
          <option value="all">Todas as ligas</option>
          {(audit.leagues || []).map((l: string) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={market} onChange={(e) => setMarket(e.target.value)} className="bg-panel2 border border-line rounded-lg px-2 py-1.5 text-[11px]">
          <option value="all">Todos os mercados</option>
          {(audit.markets || []).map((l: string) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-1.5 mt-3 text-center">
        {[["Acerto", s.acc != null ? `${s.acc}%` : "—"], ["ROI", s.roi != null ? `${(s.roi * 100).toFixed(1)}%` : "—"], ["Yield", s.yield != null ? `${(s.yield * 100).toFixed(1)}%` : "—"], ["Lucro", s.profit != null && s.priced ? `${s.profit > 0 ? "+" : ""}${s.profit.toFixed(2)}u` : "—"], ["Sequência", s.streak ? `${s.streak} ${s.streakKind === "green" ? "G" : "R"}` : "—"], ["Anuladas", s.voided]].map(([l, v], i) => (
          <div key={i} className="bg-panel2 rounded-xl p-2"><p className="font-display font-bold text-lg">{v}</p><p className="text-[8px] text-mut uppercase">{l}</p></div>
        ))}
      </div>
      <p className="text-[10px] text-mut mt-2">{s.note} Greens {s.greens} · Reds {s.reds} · Ao vivo {s.live} · Pendentes {s.pending}.</p>
      {audit.curve?.length > 1 ? (
        <div className="mt-2">
          <p className="text-[10px] font-bold text-mut uppercase mb-1">Lucro acumulado (unidade)</p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={audit.curve} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#8aa694" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: "#8aa694" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0d1c13", border: "1px solid #1d3626", fontSize: 11 }} />
              <Area type="monotone" dataKey="lucro" stroke="#23e57b" fill="#23e57b" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="text-[11px] text-mut mt-2">Gráfico de lucro aparece quando houver picks liquidadas com odd de mercado. Sem cotação publicada, o lucro não é inventado.</p>}
      <div className="mt-2 max-h-80 overflow-y-auto">
        {(audit.rows || []).length === 0 && <p className="text-xs text-mut text-center py-4">Nenhuma pick publicada neste filtro.</p>}
        {(audit.rows || []).map((r: any) => (
          <Link key={r.id} href={`/jogos/${r.matchId}?league=${r.league}&tab=money-tips`} className="flex items-center gap-2 py-1.5 border-b border-line/40 text-[11px]">
            <span className={`w-2 h-2 rounded-full shrink-0 ${r.status === "green" ? "bg-acc" : r.status === "red" ? "bg-danger" : r.status === "anulada" ? "bg-warn" : "bg-mut"}`} />
            <span className="text-mut w-12 shrink-0">{r.date.slice(6, 8)}/{r.date.slice(4, 6)}</span>
            <span className="flex-1 truncate">{r.jogo?.timeCasa || "—"} · {r.oportunidade?.mercado} {r.oportunidade?.linha}{r.isPick ? " · pick" : ""}</span>
            <span className="text-[9px] font-extrabold uppercase">{r.status === "ao_vivo" ? "ao vivo" : r.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Tijolo do painel de KPIs. `—` quando o dado não existe: nunca 0% fake. */
function Kpi({
  valor,
  rotulo,
  cor,
  destaque,
}: {
  valor: string;
  rotulo: string;
  cor?: string;
  destaque?: boolean;
}) {
  const semDado = valor === "—";
  return (
    <div className="rounded-xl bg-panel2/80 p-2 text-center">
      <p
        className={`font-display font-bold text-xl tabular-nums ${
          semDado ? "text-mut" : cor ?? (destaque ? "text-acc" : "text-ink")
        }`}
      >
        {valor}
      </p>
      <p className="text-[8px] uppercase leading-tight text-mut">{rotulo}</p>
    </div>
  );
}

/**
 * Estado vazio do Track Record.
 *
 * A página sem histórico é o PRIMEIRO contato de quem chega pelo tráfego novo —
 * ela precisa explicar o que é a prova social em vez de mostrar gráfico vazio.
 */
function TrackRecordVazio() {
  const passos = [
    "Você abre a aba IA de um jogo e gera a análise.",
    "O pick é congelado com a probabilidade do modelo, antes do apito.",
    "No fim do jogo o cron liquida sozinho: green ou red, entra aqui.",
  ];
  return (
    <div className="rounded-2xl border border-line bg-panel p-5 mb-3">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-acc/30 bg-acc/10 text-acc">
        <LineChart size={20} />
      </div>
      <h2 className="mt-3 text-center font-display text-lg font-bold uppercase leading-tight text-txt">
        O placar começa vazio — e isso é proposital
      </h2>
      <p className="mx-auto mt-2 max-w-md text-center text-[12px] leading-relaxed text-mut">
        Track Record é o histórico auditável do modelo: toda previsão é registrada{" "}
        <span className="font-bold text-txt">antes do jogo</span> e liquidada automaticamente
        depois. Não existe pick publicada com o resultado já conhecido — e red também fica na
        lista.
      </p>

      <ol className="mt-4 space-y-2">
        {passos.map((t, i) => (
          <li key={i} className="flex items-start gap-2 rounded-xl border border-line bg-panel2 p-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-acc/15 text-[10px] font-black text-acc">
              {i + 1}
            </span>
            <span className="text-[11px] leading-snug text-mut">{t}</span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href="/jogos"
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-acc px-4 py-2.5 text-[12px] font-black text-black"
        >
          Gerar minha primeira análise <ArrowRight size={14} />
        </Link>
        <Link
          href="/metodologia"
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-panel2 px-4 py-2.5 text-[12px] font-bold text-txt"
        >
          Como o modelo calcula
        </Link>
      </div>

      <p className="mt-3 inline-flex w-full items-center justify-center gap-1.5 text-[10px] font-bold text-mut">
        <Lock size={11} /> Pick gravada antes do jogo · nenhuma edição retroativa
      </p>
    </div>
  );
}
