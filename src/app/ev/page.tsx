"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import TipsGate from "@/components/TipsGate";
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
      })
      .catch(() => {
        setErr("Falha ao consultar as oportunidades.");
        setRows([]);
      });
  }, []);

  const valued = (rows || []).filter((r) => r.oportunidade?.ev != null && r.oportunidade.ev > 0 && !r.oportunidade.amostraPequena);
  const blocked = (rows || []).filter((r) => !valued.includes(r));

  return (
    <div>
      <h1 className="font-display font-bold text-2xl uppercase">Oportunidades +EV</h1>
      <p className="text-[12px] text-mut mt-1">Só entra linha com odd de mercado publicada, amostra de 10 jogos e EV positivo. Fonte: ESPN.</p>
      {at && <p className="text-[10px] text-mut mt-1">Atualizado {new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>}
      {rows === null && <div className="space-y-2 mt-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>}
      {err && <p className="text-sm text-danger mt-3">{err}</p>}
      {rows && valued.length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-line p-6 text-center">
          <p className="font-bold">Nenhuma oportunidade com valor agora</p>
          <p className="text-sm text-mut mt-1">A ESPN não publicou odd do mercado calculado, ou a amostra tem menos de 10 jogos, ou o EV não é positivo. Não completamos a lista com número estimado.</p>
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
  return (
    <Link href={`/jogos/${r.matchId}?league=${r.league}&tab=money-tips`} className={`block rounded-lg border border-line p-3 ${muted ? "opacity-80" : "bg-panel"}`}>
      <p className="text-[12px] font-bold">{r.jogo?.timeCasa} x {r.jogo?.timeFora}</p>
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
      {op.amostraPequena && <p className="text-[10px] text-warn mt-1">Amostra pequena. Fora do ranking +EV.</p>}
    </Link>
  );
}
