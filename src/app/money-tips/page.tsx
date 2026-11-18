"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TrendingUp } from "lucide-react";
import DateStrip, { toYmd } from "@/components/DateStrip";
import { PickCard } from "@/components/match/InfoTabs";
import TipsGate from "@/components/TipsGate";
import { Crest, SourceFoot } from "@/components/ui";

type Aba = "pick" | "melhores" | "arbitros";
const ABAS: Aba[] = ["pick", "melhores", "arbitros"];

/**
 * Money Tips com aba por URL: `/money-tips?tab=pick`.
 *
 * O banner "Pick do dia revelado" da tela do jogo navega para cá com essa
 * query, então a aba certa abre de primeira. `useSearchParams` exige limite de
 * Suspense na renderização estática.
 */
export default function MoneyTipsPage() {
  return (
    <Suspense fallback={<div className="skeleton h-64 rounded-2xl" />}>
      <MoneyTips />
    </Suspense>
  );
}

function MoneyTips() {
  const tabInicial = useSearchParams().get("tab");
  const [tab, setTab] = useState<Aba>(ABAS.includes(tabInicial as Aba) ? (tabInicial as Aba) : "pick");
  const [date, setDate] = useState(toYmd(new Date()));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/money-tips?date=${date}`).then((r) => r.json()).then((j) => { setData(j); setLoading(false); }).catch(() => setLoading(false));
  }, [date]);

  return (
    <TipsGate>
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-3xl">🧙‍♂️</span>
        <div>
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide leading-none">Money Tips</h1>
          <p className="text-[10px] text-mut">O Money Sênior analisa os últimos 10 jogos e escolhe a melhor do dia</p>
        </div>
        <Link href="/desempenho" className="ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-panel border border-line text-[10px] font-extrabold text-acc"><TrendingUp size={12} /> TRACK RECORD</Link>
      </div>

      <div className="flex gap-1 bg-panel border border-line rounded-full p-0.5 mb-2">
        {([["pick", "PICK DO DIA"], ["melhores", "MELHORES DO DIA"], ["arbitros", "ÁRBITROS"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 px-2 py-2 rounded-full text-[10px] font-extrabold ${tab === id ? "bg-purple text-white" : "text-mut"}`}>{label}</button>
        ))}
      </div>

      <DateStrip value={date} onChange={setDate} days={7} />

      {loading && <div className="space-y-2 mt-3"><div className="skeleton h-28" /><div className="skeleton h-24" /><div className="skeleton h-44" /><p className="text-[10px] text-mut text-center">🧙‍♂️ O Money Sênior está varrendo os jogos do dia na ESPN… (pode levar alguns segundos na primeira vez)</p></div>}

      <div className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-ink/90">
        <b>+18.</b> Estatística não é garantia de lucro. A odd justa é uma conta da amostra, não uma cotação. Jogos já iniciados saem da oportunidade e vão para o histórico.
      </div>

      {!loading && tab === "pick" && (data?.pick ? <div className="mt-3"><PickCard pick={data.pick} /></div> : (
        <div className="text-center py-10 bg-panel border border-dashed border-line rounded-2xl mt-3 px-4">
          <span className="text-4xl">🔮</span>
          <p className="font-display font-bold uppercase text-lg mt-2">Sem oportunidade aberta neste dia</p>
          <p className="text-xs text-mut mt-1">Ou não há jogo futuro com taxa ≥70%, ou os confrontos já começaram e foram para o histórico. Não publicamos pick de jogo em andamento.</p>
        </div>
      ))}

      {!loading && tab === "pick" && (data?.historico || []).length > 0 && (
        <div className="mt-4">
          <p className="font-display font-bold uppercase text-sm mb-2">Histórico · saíram de oportunidade</p>
          <div className="space-y-1.5">
            {data.historico.slice(0, 12).map((h: any) => (
              <Link key={h.id} href={`/jogos/${h.matchId}?league=${h.league}&tab=money-tips`} className="flex items-center gap-2 bg-panel border border-line rounded-xl p-2.5 text-[11px]">
                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded ${h.status === "green" ? "bg-acc/15 text-acc" : h.status === "red" ? "bg-danger/15 text-danger" : h.status === "ao_vivo" ? "bg-danger/15 text-danger" : "bg-panel2 text-mut"}`}>{h.status === "ao_vivo" ? "AO VIVO" : h.status === "green" ? "GREEN" : h.status === "red" ? "RED" : h.status === "anulada" ? "ANULADA" : "PENDENTE"}</span>
                <span className="flex-1 truncate font-semibold">{h.jogo?.timeCasa} · {h.oportunidade?.mercado} {h.oportunidade?.linha}</span>
                <span className="text-mut">{h.oportunidade?.acertos}/{h.oportunidade?.totalJogos}</span>
              </Link>
            ))}
          </div>
          <Link href="/desempenho" className="block text-center text-[11px] font-bold text-acc mt-2">VER TRACK RECORD COMPLETO →</Link>
        </div>
      )}

      {!loading && tab === "melhores" && (
        <div className="space-y-2 mt-3">
          {(data?.melhores || []).length === 0 && <p className="text-xs text-mut text-center py-8">Nenhuma oportunidade qualificada neste dia.</p>}
          {(data?.melhores || []).map((p: any, i: number) => (
            <Link key={i} href={`/jogos/${p.matchId}?tab=money-tips&league=${p.league}`} className="flex items-center gap-2 bg-panel border border-line rounded-xl p-3 card-hover">
              <span className={`font-display font-bold text-lg w-6 ${i === 0 ? "text-warn" : "text-mut"}`}>{i + 1}</span>
              <Crest src={p.jogo.logoCasa} size={26} /><Crest src={p.jogo.logoFora} size={26} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold truncate">{p.jogo.timeCasa} x {p.jogo.timeFora}</p>
                <p className="text-[10px] text-mut">{p.oportunidade.mercado} {p.oportunidade.linha} · {p.oportunidade.periodo} · {p.jogo.horario}</p>
              </div>
              <div className="text-right">
                <p className="font-display font-bold text-lg text-acc">{p.oportunidade.acertos}/{p.oportunidade.totalJogos}</p>
                <p className="text-[9px] text-mut">{p.oportunidade.totalJogos < 10 ? `n=${p.oportunidade.totalJogos}` : `@${p.oportunidade.oddEstimada ?? "—"}`}</p>
              </div>
            </Link>
          ))}
          <SourceFoot fonte="ESPN" extra="Ranking: maior taxa de acerto, desempate pela odd" />
        </div>
      )}

      {!loading && tab === "arbitros" && (
        <div className="mt-3 bg-panel border border-line rounded-2xl p-4 text-center">
          <span className="text-3xl">🧑‍⚖️</span>
          <p className="font-display font-bold uppercase mt-2">Árbitros por partida</p>
          <p className="text-xs text-mut mt-1 leading-relaxed">A ESPN divulga o árbitro na página de cada jogo (aba PRÉ-LIVE → card do árbitro). Médias de cartões/faltas por tempo exigem histórico de arbitragem da Sportmonks — configure a chave no Admin para ativar. Nada de números inventados por aqui.</p>
          <Link href="/" className="inline-block mt-3 px-4 py-2 rounded-full bg-acc text-black text-xs font-extrabold">ESCOLHER UM JOGO →</Link>
        </div>
      )}
    </div>
    </TipsGate>
  );
}