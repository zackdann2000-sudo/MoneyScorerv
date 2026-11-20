"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TipsGate from "@/components/TipsGate";
import SeloFrescor from "@/components/SeloFrescor";
import { Eye, EyeOff } from "lucide-react";
import { LIMIAR_PROB } from "@/lib/oportunidadeFiltros";
import { toYmd } from "@/components/DateStrip";

export default function EvPage() {
  return (
    <TipsGate>
      <EvInner />
    </TipsGate>
  );
}

function EvInner() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [at, setAt] = useState("");
  /* Relógio do cliente: só é marcado quando os dados chegam (nunca no SSR),
     então o selo de idade não gera divergência de hidratação. */
  const [agora, setAgora] = useState(0);
  /* Piso de elite (75%) também aqui: por padrão só aparece linha cuja
     probabilidade do MODELO passa do limite. O toggle mostra o resto. */
  const [mostrarAbaixo, setMostrarAbaixo] = useState(false);

  useEffect(() => {
    const dates = [0, 1].map((n) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return toYmd(d);
    });
    Promise.all(dates.map((d) => fetch(`/api/money-tips?date=${d}`).then((r) => r.json())))
      .then((all) => {
        const list: any[] = [];
        for (const j of all) {
          for (const item of [j.pick, ...(j.melhores || [])].filter(Boolean)) {
            const key = item.matchId + item.oportunidade?.mercado;
            if (!list.some((x) => x.matchId + x.oportunidade?.mercado === key)) list.push(item);
          }
          if (j.updatedAt) setAt(j.updatedAt);
        }
        list.sort((a, b) => (b.oportunidade?.ev ?? -9) - (a.oportunidade?.ev ?? -9));
        setRows(list);
        setAgora(Date.now());
      })
      .catch(() => {
        setErr("Falha ao consultar as oportunidades.");
        setRows([]);
      });
  }, []);

  const valorEv = (rows || []).filter((r) => r.oportunidade?.ev != null && r.oportunidade.ev > 0 && !r.oportunidade.amostraPequena);
  /* prob do modelo, não do mercado */
  const passouPiso = (r: any) => Number(r.oportunidade?.probModelo ?? 0) >= LIMIAR_PROB;
  const valued = valorEv.filter((r) => mostrarAbaixo || passouPiso(r));
  const abaixoDoPiso = valorEv.filter((r) => !passouPiso(r)).length;
  const blocked = (rows || []).filter((r) => !valued.includes(r));

  return (
    <div>
      <h1 className="font-display font-bold text-2xl uppercase">Oportunidades +EV</h1>
      <p className="text-[12px] text-mut mt-1">Só entra linha com odd de mercado publicada, amostra de 10 jogos, EV positivo e probabilidade do modelo ≥ 75%. Fonte: ESPN.</p>
      {valorEv.length > 0 && (
        <button
          type="button"
          onClick={() => setMostrarAbaixo((v) => !v)}
          aria-pressed={mostrarAbaixo}
          title="Por padrão escondemos tudo abaixo de 75% de probabilidade do modelo"
          className={`mt-2 inline-flex items-center gap-1 h-6 rounded-full border px-2 text-[9px] font-extrabold ${
            mostrarAbaixo ? "border-warn/60 bg-warn/15 text-warn" : "border-line bg-panel text-mut"
          }`}
        >
          {mostrarAbaixo ? <Eye size={10} /> : <EyeOff size={10} />}
          Mostrar abaixo de 75%{abaixoDoPiso > 0 ? ` (${abaixoDoPiso})` : ""}
        </button>
      )}
      {at && (
        <div className="mt-1.5">
          <SeloFrescor
            idadeMs={agora && at ? Math.max(0, agora - Date.parse(at)) : null}
            titulo={`Último cálculo da lista: ${new Date(at).toLocaleString("pt-BR")}`}
          />
        </div>
      )}
      {rows === null && <div className="space-y-2 mt-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>}
      {err && <p className="text-sm text-danger mt-3">{err}</p>}
      {rows && valued.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-line p-6 text-center">
          <p className="font-bold">Nenhuma oportunidade de elite (75%+) encontrada para este dia/filtro</p>
          <p className="text-sm text-mut mt-1">
            Use &apos;Mostrar abaixo de 75%&apos; para ver as linhas de valor. A ESPN também pode não ter
            publicado odd do mercado calculado, ou a amostra ter menos de 10 jogos, ou o EV não ser positivo —
            não completamos a lista com número estimado.
          </p>
        </div>
      )}
      <div className="mt-3 space-y-2">
        {valued.map((r) => <Card key={r.matchId + r.oportunidade.mercado} r={r} />)}
      </div>
      {blocked.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-bold uppercase text-mut mb-2">Calculadas, mas fora do filtro +EV</p>
          {blocked.slice(0, 8).map((r) => <Card key={"b" + r.matchId + r.oportunidade.mercado} r={r} muted />)}
        </div>
      )}
      <Link href="/metodologia" className="block mt-4 text-sm font-bold text-live">Como o EV é calculado</Link>
    </div>
  );
}

function Card({ r, muted }: { r: any; muted?: boolean }) {
  const op = r.oportunidade;
  const ev = op.ev;
  // Motivo de o palpite ter ficado fora do filtro +EV — nunca fica sem explicação.
  const motivos: string[] = [];
  if (op.oddMercado == null) motivos.push("Sem odd");
  if (op.amostraPequena) motivos.push("Amostra < 10");
  if (ev != null && ev <= 0) motivos.push("EV negativo");
  if (!motivos.length && ev == null) motivos.push("Sem odd");
  return (
    <Link href={`/jogos/${r.matchId}?league=${r.league}&tab=money-tips`} className={`block rounded-lg border border-line p-3 ${muted ? "opacity-80" : "bg-panel"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-[12px] font-bold truncate">{r.jogo?.timeCasa} x {r.jogo?.timeFora}</p>
        {muted && motivos.length > 0 && (
          <span className="shrink-0 flex flex-wrap justify-end gap-1">
            {motivos.map((m) => (
              <span key={m} className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-red-400">
                {m}
              </span>
            ))}
          </span>
        )}
      </div>
      <p className="text-[11px] text-mut">{r.jogo?.liga} · {op.mercado} {op.linha} · {op.acertos}/{op.totalJogos}</p>
      <p className="text-[12px] mt-1 tabular-nums">
        Justa {op.oddEstimada != null ? `@${Number(op.oddEstimada).toFixed(2)}` : "—"}
        {" · Mercado "}
        {op.oddMercado != null ? `@${Number(op.oddMercado).toFixed(2)}` : "não publicada"}
        {" · "}
        <span className={ev == null ? "text-mut" : ev > 0 ? "text-acc font-bold" : "text-danger font-bold"}>
          {ev == null ? "EV indisponível" : `EV ${ev > 0 ? "+" : ""}${(ev * 100).toFixed(1)}%`}
        </span>
      </p>
      {op.amostraPequena && <p className="text-[10px] text-warn mt-1">Amostra pequena. Fora do ranking +EV.</p>}    </Link>
  );
}
