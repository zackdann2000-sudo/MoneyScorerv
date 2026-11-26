"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SourceFoot } from "@/components/ui";

/**
 * Validador — "como o modelo teria performado neste recorte?".
 *
 * Página de auditoria: o usuário escolhe liga + mercado + janela e vê a banca
 * caminhando pick a pick, com as odds REAIS que o ledger registrou. O número é
 * sempre do passado liquidado — nada é projetado, nada é simulado.
 *
 * Stake fixa de 1 unidade (configurável) e banca inicial de 100: mede o modelo,
 * não a gestão de banca. Composto transforma amostra pequena em curva bonita.
 */

const JANELAS = [
  { id: "7", rotulo: "7 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "90", rotulo: "90 dias" },
  { id: "", rotulo: "Tudo" },
];

type Resposta = { backtest: any; opcoes: { ligas: any[]; mercados: any[]; liquidadas: number } };

export default function Validador() {
  const [liga, setLiga] = useState("all");
  const [mercado, setMercado] = useState("all");
  const [dias, setDias] = useState("30");
  const [banca, setBanca] = useState("100");
  const [unidade, setUnidade] = useState("1");
  const [d, setD] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const q = new URLSearchParams({ liga, mercado, banca, unidade });
    if (dias) q.set("dias", dias);
    let vivo = true;
    Promise.resolve()
      .then(() => fetch(`/api/backtest?${q.toString()}`))
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j?.error) setErro(j.error);
        else setErro("");
        setD(j);
      })
      .catch(() => vivo && setErro("Não foi possível carregar o backtest."));
    return () => {
      vivo = false;
    };
  }, [liga, mercado, dias, banca, unidade]);

  const b = d?.backtest;
  const liquidadas: number = b?.liquidadas ?? 0;
  const semOdd: number = b?.semOdd ?? 0;
  const curva: any[] = useMemo(() => (Array.isArray(b?.curva) ? b.curva : []), [b]);

  const pct = (v: number | null) => (v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`);
  const uni = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}u`);
  const cor = (v: number | null) => (v == null ? "text-mut" : v > 0 ? "text-acc" : v < 0 ? "text-danger" : "text-mut");

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="text-acc" size={26} />
        <div>
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide leading-none">Validador</h1>
          <p className="text-[10px] text-mut">
            Como o modelo teria performado no passado, com as odds reais de cada pick
          </p>
        </div>
      </div>

      {/* ---------------- filtros ---------------- */}
      <div className="bg-panel border border-line rounded-2xl p-3 mb-3">
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={liga}
            onChange={(e) => setLiga(e.target.value)}
            className="bg-panel2 border border-line rounded-lg px-2 py-1.5 text-[11px]"
          >
            <option value="all">Todas as ligas</option>
            {(d?.opcoes?.ligas || []).map((l: any) => (
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
            {(d?.opcoes?.mercados || []).map((m: any) => (
              <option key={m.valor} value={m.valor}>
                {m.rotulo} ({m.picks})
              </option>
            ))}
          </select>
        </div>

        <div className="mt-1.5 flex gap-1.5 overflow-x-auto no-scrollbar">
          {JANELAS.map((j) => (
            <button
              key={j.id || "tudo"}
              onClick={() => setDias(j.id)}
              className={`shrink-0 px-3 py-1 rounded-full text-[10px] font-extrabold ${
                dias === j.id ? "bg-acc text-black" : "bg-panel2 text-mut"
              }`}
            >
              {j.rotulo}
            </button>
          ))}
        </div>

        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <label className="block">
            <span className="text-[8px] uppercase text-mut">Banca inicial (u)</span>
            <input
              type="number"
              min={1}
              value={banca}
              onChange={(e) => setBanca(e.target.value)}
              className="w-full bg-panel2 border border-line rounded-lg px-2 py-1 text-[11px] tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-[8px] uppercase text-mut">Stake por pick (u)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className="w-full bg-panel2 border border-line rounded-lg px-2 py-1 text-[11px] tabular-nums"
            />
          </label>
        </div>
      </div>

      {erro && <p className="mb-3 rounded-xl bg-danger/10 px-3 py-2 text-[11px] font-bold text-danger">{erro}</p>}

      {!d ? (
        <div className="space-y-2">
          <div className="skeleton h-24" />
          <div className="skeleton h-52" />
        </div>
      ) : !liquidadas ? (
        <div className="rounded-2xl border border-line bg-panel p-5 mb-3">
          <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-acc/30 bg-acc/10 text-acc">
            <Activity size={20} />
          </div>
          <h2 className="mt-3 text-center font-display text-lg font-bold uppercase leading-tight">
            Sem pick liquidada neste recorte
          </h2>
          <p className="mx-auto mt-2 max-w-md text-center text-[12px] leading-relaxed text-mut">
            O backtest só usa resultado real já liquidado. Aumente a janela, troque a liga ou o
            mercado — ou espere o próximo apito final. Banca nunca é desenhada com pick pendente.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              onClick={() => {
                setLiga("all");
                setMercado("all");
                setDias("");
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-acc px-4 py-2.5 text-[12px] font-black text-black"
            >
              Limpar filtros <ArrowRight size={14} />
            </button>
            <Link
              href="/desempenho"
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-panel2 px-4 py-2.5 text-[12px] font-bold"
            >
              Ver o Track Record
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ---------------- resumo ---------------- */}
          <div className="rounded-2xl border border-acc/30 bg-gradient-to-br from-acc/[0.10] to-panel p-3 mb-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wide text-acc">
                Banca com stake fixa de {String(b.unidade).replace(".", ",")}u
              </p>
              <p className="text-[9px] font-bold text-mut">
                {liquidadas} pick{liquidadas === 1 ? "" : "s"} · {b.greens}G/{b.reds}R
              </p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Cartao valor={b.bancaFinal.toFixed(2).replace(".", ",")} rotulo={`Banca final (de ${b.bancaInicial})`} destaque />
              <Cartao valor={uni(b.lucro)} rotulo="Lucro" cor={cor(b.lucro)} />
              <Cartao valor={pct(b.roi)} rotulo="ROI" cor={cor(b.roi)} />
              <Cartao valor={pct(b.acerto)} rotulo="Acerto" />
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              <Cartao
                valor={b.maiorSequenciaGreens ? `${b.maiorSequenciaGreens}G` : "—"}
                rotulo="Maior sequência"
                cor="text-acc"
              />
              <Cartao valor={`${b.drawdownMaximo.toFixed(2).replace(".", ",")}u`} rotulo="Drawdown máx" cor="text-danger" />
              <Cartao
                valor={b.sequenciaAtual ? `${b.sequenciaAtual.n}${b.sequenciaAtual.tipo === "green" ? "G" : "R"}` : "—"}
                rotulo="Sequência atual"
                cor={b.sequenciaAtual?.tipo === "green" ? "text-acc" : "text-danger"}
              />
            </div>
          </div>

          {/* ---------------- curva ---------------- */}
          <div className="bg-panel border border-line rounded-2xl p-4 mb-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[10px] font-bold uppercase text-mut">Evolução da banca</p>
              <p className="text-[9px] font-bold text-mut">
                {b.primeiro ?? "—"} → {b.ultimo ?? "—"}
              </p>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={curva} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="banca" x1="0" y1="0" x2="0" y2="1">
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
                <ReferenceLine y={b.bancaInicial} stroke="#3b4a5a" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="banca" stroke="#23e57b" strokeWidth={2} fill="url(#banca)" />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-1 flex items-center justify-between text-[9px] text-mut">
              <span className="inline-flex items-center gap-1">
                <TrendingUp size={10} className="text-acc" /> pico {b.picoBanca.toFixed(2).replace(".", ",")}u
              </span>
              <span className="inline-flex items-center gap-1">
                <TrendingDown size={10} className="text-danger" /> queda máx{" "}
                {b.drawdownMaximoPct == null ? "—" : `${b.drawdownMaximoPct.toFixed(1).replace(".", ",")}%`}
              </span>
              <span>odd média {b.oddMedia == null ? "—" : b.oddMedia.toFixed(2).replace(".", ",")}</span>
            </div>
          </div>

          <p className="text-[10px] leading-snug text-mut">
            Green rende <b>stake × (odd − 1)</b>, red custa a stake. O ROI é sobre tudo que foi
            apostado. A stake não compõe com o resultado de propósito: aqui se mede o modelo, não
            a gestão de banca — composto multiplica o erro de amostra pequena.
            {semOdd > 0 && ` ${semOdd} pick(s) sem odd válida ficaram fora da curva mas contam no acerto.`}
          </p>
        </>
      )}

      <SourceFoot
        fonte="Ledger real (value_bet_history) · liquidação automática por placar"
        extra="Backtest com as odds gravadas no pick, stake fixa e ordem cronológica"
      />
    </div>
  );
}

/** Tijolo de número. `—` quando o dado não existe: nunca 0% fake. */
function Cartao({
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
        className={`font-display font-bold text-lg tabular-nums ${
          semDado ? "text-mut" : cor ?? (destaque ? "text-acc" : "text-ink")
        }`}
      >
        {valor}
      </p>
      <p className="text-[8px] uppercase leading-tight text-mut">{rotulo}</p>
    </div>
  );
}
