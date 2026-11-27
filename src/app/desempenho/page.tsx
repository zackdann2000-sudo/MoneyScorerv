"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { TrendingUp, Target, ArrowRight, Lock, LineChart, Activity } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Donut } from "@/components/charts";
import { SourceFoot } from "@/components/ui";
import { camposDoMotivo, motivoEmUmaLinha, quandoCongelou } from "@/lib/motivoPick";

export default function Desempenho() {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [period, setPeriod] = useState("30");
  const [league, setLeague] = useState("all");
  const [market, setMarket] = useState("all");
  useEffect(() => {
    fetch(`/api/track-record?period=${period}&league=${encodeURIComponent(league)}&market=${encodeURIComponent(market)}`)
      .then((r) => r.json())
      .then((j) => {
        /* A rota devolve `error` junto com os blocos degradados: sem ler isso,
           banco fora do ar aparecia como "Aguardando dados" — como se o
           produto só não tivesse pick nenhuma. */
        setD(j);
        setErro(
          j?.error
            ? "Não foi possível atualizar o Track Record agora. Os números abaixo podem estar incompletos."
            : null,
        );
      })
      .catch(() => {
        setD(null);
        setErro("Não foi possível carregar o Track Record agora.");
      });
  }, [period, league, market, tentativa]);

  if (!d) {
    if (erro) {
      return (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-center">
          <p className="text-[12px] font-extrabold text-danger">{erro}</p>
          <button
            onClick={() => setTentativa((t) => t + 1)}
            className="mt-2 rounded-full bg-panel2 border border-line px-3 py-1.5 text-[10px] font-extrabold text-acc"
          >
            Tentar de novo
          </button>
        </div>
      );
    }
    return <div className="space-y-2"><div className="skeleton h-8 w-56" /><div className="skeleton h-52" /><div className="skeleton h-40" /></div>;
  }
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
        <Link
          href="/validador"
          className="ml-auto shrink-0 rounded-full bg-panel2 px-3 py-1.5 text-[10px] font-extrabold text-acc"
        >
          Validador →
        </Link>
      </div>

      {erro && (
        <p className="mb-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] font-bold text-danger">
          {erro}
        </p>
      )}

      <Audit audit={d.audit} period={period} setPeriod={setPeriod} league={league} setLeague={setLeague} market={market} setMarket={setMarket} />

      <BacktestLedger defaultLiga={league} />

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

      <FaixasOdd clv={d.clv} />

      <Competencia competencia={d.competencia} />

      <MotivoCongelado historico={d.historico} />

      {semHistorico && <TrackRecordVazio />}

      {!semHistorico && (
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

/**
 * Backtest do ledger — "e se eu tivesse começado com N unidades?".
 *
 * Pega TODAS as picks já liquidadas (green/red) com odd real e anda a banca
 * pick a pick, em ordem cronológica, com stake fixa. É a mesma matemática pura
 * de `lib/backtest.ts` (testada) exposta por `/api/backtest` — a tela só desenha.
 *
 * O usuário escolhe liga e mercado (opções vindas do próprio ledger, nunca
 * hardcoded) e a banca inicial (padrão 100). Stake é fixa de propósito: aqui se
 * mede o modelo, não a gestão de banca. Composto transforma amostra pequena em
 * curva bonita, então não usamos.
 */
function BacktestLedger({ defaultLiga }: { defaultLiga?: string }) {
  const [liga, setLiga] = useState(defaultLiga && defaultLiga !== "all" ? defaultLiga : "all");
  const [mercado, setMercado] = useState("all");
  const [banca, setBanca] = useState("100");
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const q = new URLSearchParams({ liga, mercado, banca, unidade: "1" });
    let vivo = true;
    fetch(`/api/backtest?${q.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        setErro(j?.error ? "Não foi possível simular a banca agora." : "");
        setD(j);
      })
      .catch(() => vivo && setErro("Não foi possível simular a banca agora."));
    return () => {
      vivo = false;
    };
  }, [liga, mercado, banca]);

  const b = d?.backtest;
  const opcoes = d?.opcoes;
  const curva: any[] = Array.isArray(b?.curva) ? b.curva : [];
  const liquidadas: number = b?.liquidadas ?? 0;

  const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);
  const uni = (v: number | null) =>
    v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}u`;
  const cor = (v: number | null) =>
    v == null ? "text-mut" : v > 0 ? "text-acc" : v < 0 ? "text-danger" : "text-mut";

  return (
    <div className="bg-panel border border-line rounded-2xl p-4 mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-acc">
          <LineChart size={12} /> Backtest · evolução de banca
        </p>
        <p className="text-[9px] font-bold text-mut">
          {liquidadas} pick{liquidadas === 1 ? "" : "s"} liquidada{liquidadas === 1 ? "" : "s"}
        </p>
      </div>

      <p className="mt-1 text-[10px] leading-snug text-mut">
        E se você tivesse começado com{" "}
        <span className="font-bold text-txt">{banca || "100"} unidades</span> e apostado stake fixa
        em cada pick liquidada? Percorre o ledger inteiro em ordem cronológica, com as odds
        reais de cada pick. Nada aqui é projetado — só o passado liquidado.
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <select
          value={liga}
          onChange={(e) => setLiga(e.target.value)}
          className="bg-panel2 border border-line rounded-lg px-2 py-1.5 text-[11px]"
        >
          <option value="all">Todas as ligas</option>
          {(opcoes?.ligas || []).map((l: any) => (
            <option key={l.valor} value={l.valor}>
              {l.rotulo} ({l.picks})
            </option>
          ))}
        </select>
        <select
          value={mercado}
          onChange={(e) => setMercado(e.target.value)}
          className="bg-panel2 border border-line rounded-lg px-2 py-1.5 text-[11px]"
        >
          <option value="all">Todos os mercados</option>
          {(opcoes?.mercados || []).map((m: any) => (
            <option key={m.valor} value={m.valor}>
              {m.rotulo} ({m.picks})
            </option>
          ))}
        </select>
      </div>

      <label className="mt-1.5 flex items-center gap-2">
        <span className="shrink-0 text-[9px] uppercase text-mut">Banca inicial (u)</span>
        <input
          type="number"
          min={1}
          value={banca}
          onChange={(e) => setBanca(e.target.value)}
          className="w-24 bg-panel2 border border-line rounded-lg px-2 py-1 text-[11px] tabular-nums"
        />
        <span className="text-[9px] text-mut">stake fixa de 1u por pick</span>
      </label>

      {erro && <p className="mt-2 rounded-lg bg-danger/10 px-3 py-1.5 text-[11px] font-bold text-danger">{erro}</p>}

      {!b ? (
        <div className="skeleton h-40 mt-2" />
      ) : !liquidadas ? (
        <p className="mt-3 rounded-xl bg-panel2 p-3 text-[11px] leading-snug text-mut">
          Nenhuma pick liquidada neste recorte. A banca só é desenhada com resultado real já
          fechado — troque liga ou mercado, ou espere o próximo apito final.
        </p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Kpi valor={b.bancaFinal.toFixed(2).replace(".", ",")} rotulo={`Banca final (de ${b.bancaInicial})`} destaque />
            <Kpi valor={uni(b.lucro)} rotulo="Lucro" cor={cor(b.lucro)} />
            <Kpi valor={pct(b.roi)} rotulo="ROI" cor={cor(b.roi)} />
            <Kpi valor={`${b.drawdownMaximo.toFixed(2).replace(".", ",")}u`} rotulo="Drawdown máx" cor="text-danger" />
          </div>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            <Kpi valor={`${b.greens}G / ${b.reds}R`} rotulo="Greens / Reds" />
            <Kpi
              valor={b.maiorSequenciaReds ? `${b.maiorSequenciaReds}R` : "—"}
              rotulo="Pior sequência"
              cor="text-danger"
            />
            <Kpi
              valor={b.sequenciaAtual ? `${b.sequenciaAtual.n}${b.sequenciaAtual.tipo === "green" ? "G" : "R"}` : "—"}
              rotulo="Sequência atual"
              cor={b.sequenciaAtual?.tipo === "green" ? "text-acc" : "text-danger"}
            />
          </div>

          {curva.length > 1 && (
            <div className="mt-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[9px] font-bold uppercase text-mut">Banca pick a pick</p>
                <p className="text-[9px] font-bold text-mut">
                  {b.primeiro ?? "—"} → {b.ultimo ?? "—"}
                </p>
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={curva} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="banca-desp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#23e57b" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#23e57b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" tick={{ fontSize: 9, fill: "#8aa694" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#8aa694" }}
                    axisLine={false}
                    tickLine={false}
                    domain={["dataMin - 1", "dataMax + 1"]}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0d1c13", border: "1px solid #1d3626", fontSize: 11 }}
                    labelFormatter={(i) => `Pick ${i}`}
                    formatter={(v: any, _n: any, ctx: any) => [
                      `${Number(v).toFixed(2)}u`,
                      ctx?.payload?.resultado === "inicio" ? "Banca inicial" : `Banca (${ctx?.payload?.resultado})`,
                    ]}
                  />
                  <Area type="monotone" dataKey="banca" stroke="#23e57b" strokeWidth={2} fill="url(#banca-desp)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <p className="mt-2 text-[10px] leading-snug text-mut">
            Green rende stake × (odd − 1), red custa a stake. ROI é sobre tudo apostado. A
            stake não compõe com o resultado de propósito: aqui se mede o modelo, não a gestão
            de banca.
            {(b.semOdd ?? 0) > 0 && ` ${b.semOdd} pick(s) sem odd válida ficaram fora da curva, mas contam no acerto.`}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Track record por faixa de odd + CLV da Pinnacle.
 *
 * Por que essa tabela existe: acerto agregado esconde tudo o que importa. Um
 * modelo que acerta 76% só em odds de 1.30 tem ROI diferente de um que acerta
 * 36% em odds de 3.00, e nenhum dos dois aparece no número global. A faixa
 * separa os dois mundos — e o CLV mostra se o preço que publicamos era melhor
 * que o preço de fechamento da Pinnacle, que é a única prova que não depende
 * do resultado do jogo.
 *
 * Regra de honestidade: sem as duas pontas da Pinnacle, CLV é `null` e a tela
 * mostra "—". Nunca estimamos com outra casa, nunca interpolamos.
 */
function FaixasOdd({ clv }: { clv: any }) {
  if (!clv || !Array.isArray(clv.faixas)) return null;

  const faixas = clv.faixas.filter((f: any) => (f.liquidadas ?? 0) > 0 || (f.comClv ?? 0) > 0);
  const t = clv.total ?? {};

  const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
  const comSinal = (v: number | null, sufixo = "%") =>
    v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}${sufixo}`;
  const cor = (v: number | null) => (v == null ? "text-mut" : v > 0 ? "text-acc" : v < 0 ? "text-danger" : "text-mut");

  return (
    <div className="bg-panel border border-line rounded-2xl p-4 mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-acc">
          <Activity size={12} /> Por faixa de odd · CLV
        </p>
        <p className="text-[9px] font-bold text-mut">
          {(t.comClv ?? 0)} pick{(t.comClv ?? 0) === 1 ? "" : "s"} com as 2 pontas
        </p>
      </div>

      <p className="mt-1 text-[10px] leading-snug text-mut">
        CLV = odd de abertura ÷ odd de fechamento − 1, sempre na Pinnacle. Positivo
        significa que o mercado andou na nossa direção depois do pick — não é acerto
        do jogo, é preço melhor que o de fechamento.
      </p>

      {!faixas.length ? (
        <p className="mt-3 rounded-xl bg-panel2 p-3 text-[11px] leading-snug text-mut">
          Ainda não há pick liquidada com odd publicada. A faixa usa a odd que o pick
          tinha no momento em que foi gravado; o CLV aparece quando a Pinnacle tiver
          cotado o mesmo mercado no fechamento.
        </p>
      ) : (
        <>
          <div className="mt-3 hidden grid-cols-[1.2fr_repeat(4,1fr)] gap-1 text-[9px] font-bold uppercase text-mut sm:grid">
            <span>Faixa</span>
            <span className="text-center">Picks</span>
            <span className="text-center">Acerto</span>
            <span className="text-center">ROI</span>
            <span className="text-center">CLV médio</span>
          </div>
          {faixas.map((f: any) => (
            <div
              key={f.key}
              className="mt-1 grid grid-cols-[1.2fr_repeat(4,1fr)] items-center gap-1 rounded-lg bg-panel2/70 px-2 py-1.5 text-[11px] tabular-nums"
            >
              <span className="font-bold">{f.rotulo}</span>
              <span className="text-center text-mut">
                {f.liquidadas}
                {f.greens > 0 || f.liquidadas > 0 ? (
                  <span className="text-[9px] text-mut/70"> · {f.greens}G</span>
                ) : null}
              </span>
              <span className="text-center font-bold">{pct(f.acerto)}</span>
              <span className={`text-center font-bold ${cor(f.roi)}`}>{pct(f.roi)}</span>
              <span className={`text-center font-bold ${cor(f.clvMedio)}`}>
                {comSinal(f.clvMedio)}
                {f.comClv > 0 && (
                  <span className="block text-[8px] font-normal text-mut">
                    {f.comClv} pick{f.comClv === 1 ? "" : "s"} · {pct(f.clvPositivoPct)} &gt; 0
                  </span>
                )}
              </span>
            </div>
          ))}

          <div className="mt-2 grid grid-cols-[1.2fr_repeat(4,1fr)] items-center gap-1 border-t border-line pt-2 text-[11px] font-black tabular-nums">
            <span>Total</span>
            <span className="text-center text-mut">{t.liquidadas ?? 0}</span>
            <span className="text-center">{pct(t.acerto)}</span>
            <span className={`text-center ${cor(t.roi)}`}>{pct(t.roi)}</span>
            <span className={`text-center ${cor(t.clvMedio)}`}>{comSinal(t.clvMedio)}</span>
          </div>

          {(t.comClv ?? 0) === 0 ? (
            <p className="mt-3 text-[10px] leading-snug text-warn">
              As picks acima ainda não têm CLV: falta a cotação da Pinnacle em uma das
              pontas. O acerto e o ROI da faixa continuam valendo — só o CLV fica em “—”.
            </p>
          ) : (t.comClv ?? 0) < 20 ? (
            <p className="mt-3 text-[10px] leading-snug text-warn">
              Amostra de {t.comClv} pick{(t.comClv as number) === 1 ? "" : "s"} com CLV:
              ainda é pouco para tratar a média como prova. O número ganha peso conforme
              o histórico fecha.
            </p>
          ) : (
            <p className="mt-3 text-[10px] leading-snug text-mut">
              ROI por faixa = lucro com stake fixa de 1 unidade ÷ picks liquidadas. CLV médio
              usa só as picks com abertura e fechamento da Pinnacle.
              {(clv.semOdd ?? 0) > 0 && ` ${clv.semOdd} pick(s) sem odd válida ficaram fora das faixas.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Motivo congelado por pick.
 *
 * Cada linha mostra o resumo do instante (`motivoEmUmaLinha`) e abre o retrato
 * completo: probabilidade, odd justa, edge, EV, stake, TRUST, amostra, λ, xG,
 * probabilidades do jogo e a frase que o motor escreveu. Pick antigo (sem
 * snapshot) diz que não foi gravado — não reconstruímos o passado.
 */
function MotivoCongelado({ historico }: { historico: any }) {
  const [aberto, setAberto] = useState<number | null>(null);
  const [verTodas, setVerTodas] = useState(false);
  if (!Array.isArray(historico)) return null;

  const lista = historico as any[];
  const visiveis = verTodas ? lista : lista.slice(0, 5);
  const comMotivo = lista.filter((p) => p.motivo).length;

  const badge = (status: string) =>
    status === "green"
      ? "bg-acc/15 text-acc"
      : status === "red"
        ? "bg-danger/15 text-danger"
        : "bg-panel2 text-mut";
  const rotuloStatus = (status: string) =>
    status === "green" ? "GREEN" : status === "red" ? "RED" : "PENDENTE";

  return (
    <div className="bg-panel border border-line rounded-2xl p-4 mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-acc">
          <Lock size={12} /> Motivo congelado · por pick
        </p>
        <p className="text-[9px] font-bold text-mut">
          {comMotivo}/{lista.length} com retrato
        </p>
      </div>

      <p className="mt-1 text-[10px] leading-snug text-mut">
        O retrato é gravado no instante do pick e nunca é reescrito: probabilidade do
        modelo, odd, odd justa, edge, EV, stake, TRUST, amostra, λ e xG usados. Depois do
        apito a odd fecha e o xG é recalculado — por isso “como estava” só existe se foi
        congelado antes.
      </p>

      {!lista.length ? (
        <p className="mt-3 rounded-xl bg-panel2 p-3 text-[11px] leading-snug text-mut">
          Nenhuma pick registrada no ledger ainda. O primeiro pick gravado já entra aqui
          com o motivo completo.
        </p>
      ) : (
        <div className="mt-2">
          {visiveis.map((p) => {
            const campos = camposDoMotivo(p.motivo);
            const temMotivo = campos.length > 0;
            const expandido = aberto === p.id;
            return (
              <div key={p.id} className="mt-1 rounded-xl bg-panel2/60 px-2 py-1.5">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="shrink-0 text-[9px] font-bold text-mut tabular-nums">
                    {p.matchDate ? `${p.matchDate.slice(8, 10)}/${p.matchDate.slice(5, 7)}` : "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold leading-tight">
                      {p.homeName} × {p.awayName}
                      {p.homeScore != null && p.awayScore != null && (
                        <span className="ml-1 text-mut tabular-nums">
                          {p.homeScore}–{p.awayScore}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[9px] text-mut">
                      {p.leagueName} · {p.rotulo}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-extrabold ${badge(p.status)}`}>
                    {rotuloStatus(p.status)}
                  </span>
                </div>

                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-[9px] text-mut tabular-nums">
                    {temMotivo ? motivoEmUmaLinha(p.motivo) : "Motivo não gravado (pick anterior ao registro)"}
                  </p>
                  {temMotivo && (
                    <button
                      onClick={() => setAberto(expandido ? null : p.id)}
                      aria-expanded={expandido}
                      className="shrink-0 rounded-full bg-panel px-2 py-0.5 text-[9px] font-extrabold text-acc"
                    >
                      {expandido ? "Ocultar" : "Ver detalhes"}
                    </button>
                  )}
                </div>

                {expandido && (
                  <div className="mt-1.5 border-t border-line pt-1.5">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                      {campos.map((c) => (
                        <div key={c.chave} className={c.chave === "porque" ? "col-span-2 sm:col-span-3" : ""}>
                          <p className="text-[8px] uppercase leading-tight text-mut">{c.rotulo}</p>
                          <p className={`text-[10px] font-bold leading-snug ${c.chave === "porque" ? "font-normal text-mut" : "tabular-nums"}`}>
                            {c.valor}
                          </p>
                        </div>
                      ))}
                    </div>
                    {p.motivo?.registradoEm && (
                      <p className="mt-1 text-[8px] text-mut">
                        Congelado em {quandoCongelou(p.motivo.registradoEm)} · nada aqui é recalculado depois do jogo
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {lista.length > 5 && (
            <button
              onClick={() => setVerTodas((v) => !v)}
              className="mt-2 w-full rounded-lg bg-panel2/50 py-1 text-[10px] font-bold text-mut"
            >
              {verTodas ? "Ver menos" : `Ver as ${lista.length} picks`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Competência do modelo por liga × mercado.
 *
 * É o bloco que responde "o modelo é bom NESTA liga, NESTE mercado?" sem
 * depender do total agregado — e sem publicar 2 acertos em 3 como se fosse
 * taxa. Abaixo da amostra mínima o par fica retido em "Aguardando dados".
 */
function Competencia({ competencia }: { competencia: any }) {
  const [abrirAguardando, setAbrirAguardando] = useState(false);
  if (!competencia || !Array.isArray(competencia.linhas)) return null;

  const t = competencia.total ?? {};
  const linhas: any[] = competencia.linhas ?? [];
  const aguardando: any[] = competencia.aguardando ?? [];
  const min = competencia.minAmostra ?? 10;

  const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}%`);
  const cor = (v: number | null) =>
    v == null ? "text-mut" : v > 0 ? "text-acc" : v < 0 ? "text-danger" : "text-mut";
  /** Brier: menor é melhor. 0,25 é o chute 50/50 — abaixo disso está calibrado. */
  const corBrier = (v: number | null) =>
    v == null ? "text-mut" : v < 0.25 ? "text-acc" : v < 0.3 ? "text-ink" : "text-warn";
  const num = (v: number | null) => (v == null ? "—" : v.toFixed(3).replace(".", ","));

  const grade = "grid grid-cols-[1.7fr_repeat(4,1fr)] items-center gap-1";

  /* Sem nenhum par publicado, a lista em coleta já abre: senão a seção inteira
     nasce como uma caixa vazia, e o leitor não vê que existe medição em curso. */
  const verColeta = abrirAguardando || linhas.length === 0;

  return (
    <div className="bg-panel border border-line rounded-2xl p-4 mb-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-acc">
          <Target size={12} /> Competência do modelo · liga × mercado
        </p>
        <p className="text-[9px] font-bold text-mut">
          {t.paresProntos ?? 0} par{(t.paresProntos ?? 0) === 1 ? "" : "es"} medido
          {(t.paresProntos ?? 0) === 1 ? "" : "s"}
        </p>
      </div>

      <p className="mt-1 text-[10px] leading-snug text-mut">
        Acerto sozinho engana: acertar muito com odd baixa ainda dá prejuízo. Por isso a
        tabela mostra também o ROI (lucro ÷ apostado, stake fixa de 1 unidade) e o Brier
        — a nota de calibração: média de (probabilidade publicada − resultado)², menor é
        melhor, e 0,25 é o chute 50/50.
      </p>

      {!linhas.length ? (
        <p className="mt-3 rounded-xl bg-panel2 p-3 text-[11px] leading-snug text-mut">
          Nenhum par liga × mercado chegou a {min} picks liquidadas ainda. Preferimos
          mostrar “Aguardando dados” a transformar 2 acertos em 3 num percentual.
          {aguardando.length > 0 && ` ${aguardando.length} par${aguardando.length === 1 ? "" : "es"} em coleta.`}
        </p>
      ) : (
        <>
          <div className={`${grade} mt-3 hidden text-[9px] font-bold uppercase text-mut sm:grid`}>
            <span>Liga · mercado</span>
            <span className="text-center">Picks</span>
            <span className="text-center">Acerto</span>
            <span className="text-center">Brier</span>
            <span className="text-center">ROI</span>
          </div>

          {linhas.map((l: any) => (
            <div key={l.key} className={`${grade} mt-1 rounded-lg bg-panel2/70 px-2 py-1.5 text-[11px] tabular-nums`}>
              <div className="min-w-0">
                <p className="truncate font-bold leading-tight">{l.liga}</p>
                <p className="truncate text-[9px] text-mut">{l.rotulo}</p>
              </div>
              <span className="text-center text-mut">
                {l.liquidadas}
                <span className="text-[9px] text-mut/70"> · {l.greens}G</span>
              </span>
              <span className="text-center font-bold">
                {pct(l.acerto)}
                {l.esperado != null && (
                  <span className="block text-[8px] font-normal text-mut">esp. {pct(l.esperado)}</span>
                )}
              </span>
              <span className={`text-center font-bold ${corBrier(l.brier)}`}>{num(l.brier)}</span>
              <span className={`text-center font-bold ${cor(l.roi)}`}>
                {pct(l.roi)}
                {l.comOdd != null && (
                  <span className="block text-[8px] font-normal text-mut">
                    {l.comOdd} com odd
                  </span>
                )}
              </span>
            </div>
          ))}

          <div className={`${grade} mt-2 border-t border-line pt-2 text-[11px] font-black tabular-nums`}>
            <span>Total</span>
            <span className="text-center text-mut">{t.liquidadas ?? 0}</span>
            <span className="text-center">{pct(t.acerto)}</span>
            <span className={`text-center ${corBrier(t.brier)}`}>{num(t.brier)}</span>
            <span className={`text-center ${cor(t.roi)}`}>{pct(t.roi)}</span>
          </div>
        </>
      )}

      {aguardando.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          {linhas.length > 0 && (
            <button
              onClick={() => setAbrirAguardando((v) => !v)}
              className="flex w-full items-center justify-between gap-2 text-left text-[10px] font-bold uppercase text-mut"
            >
              <span>Aguardando dados · {aguardando.length}</span>
              <span className="text-acc">{abrirAguardando ? "ocultar" : "ver"}</span>
            </button>
          )}
          {verColeta && (
            <div className="mt-1">
              {aguardando.map((l: any) => (
                <div
                  key={l.key}
                  className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-panel2/50 px-2 py-1.5 text-[11px]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-bold leading-tight text-mut">{l.liga}</p>
                    <p className="truncate text-[9px] text-mut/70">{l.rotulo}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-[9px] font-extrabold uppercase text-warn">
                    Aguardando dados · {l.liquidadas}/{min}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-snug text-mut">
        Só green e red contam: pendente, ao vivo e anulada ficam fora de qualquer
        denominador. “esp.” é a probabilidade média que o modelo publicou — se ela está
        longe do acerto, a calibração desse mercado é que precisa de revisão
        {(competencia.semLiga ?? 0) > 0 && ` ${competencia.semLiga} pick(s) sem liga ficaram fora dos pares`}.
      </p>
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
