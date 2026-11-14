"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Crest } from "@/components/ui";
import { PickCard } from "@/components/match/InfoTabs";
import { voterKey } from "@/components/supertips/bits";
import { toYmd } from "@/components/DateStrip";
import TipsGate from "@/components/TipsGate";

export default function Tendencias() {
  const [tab, setTab] = useState<"desapitos" | "pick" | "melhores" | "indicadores">("desapitos");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, { count: number; mine: boolean }>>({});

  useEffect(() => {
    // loading já começa true; setLoading ocorre só nos callbacks do fetch
    fetch(`/api/supertips/trends?date=${toYmd(new Date())}`).then((r) => r.json()).then((j) => { setData(j); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const like = async (id: string) => {
    const r = await fetch("/api/supertips/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "like", target: id, voterKey: voterKey() }) });
    const j = await r.json();
    if (j.count != null) setLikes((p) => ({ ...p, [id]: j }));
  };

  return (
    <TipsGate>
    <div>
      <h1 className="font-display font-bold text-2xl uppercase mb-1">Tendências</h1>
      <p className="text-[10px] text-mut mb-2">Desapitos só entram com 70%+ na amostra e diferença real contra a linha.</p>
      <div className="flex gap-1 overflow-x-auto no-scrollbar mb-3">
        {([["desapitos", "DESAPITOS"], ["pick", "PICK DO DIA"], ["melhores", "MELHORES"], ["indicadores", "INDICADORES"]] as const).map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-extrabold ${tab === id ? "bg-acc text-black" : "bg-[#141820] text-mut border border-white/10"}`}>{l}</button>
        ))}
      </div>
      {loading && <div className="space-y-2"><div className="skeleton h-36" /><div className="skeleton h-36" /><p className="text-[10px] text-mut text-center">Lendo os últimos jogos na ESPN…</p></div>}

      {!loading && tab === "desapitos" && (
        <div className="space-y-3">
          {(data?.cards || []).length === 0 && <p className="text-xs text-mut text-center py-8">Nenhuma discrepância ≥70% nos jogos analisados hoje.</p>}
          {(data?.cards || []).map((c: any) => (
            <article key={c.id} className="bg-[#f4f7f2] text-[#10231a] rounded-2xl p-3">
              <div className="flex items-center gap-2 text-[11px]">
                <Crest src={c.match.home.logo} size={18} />
                <span className="font-bold flex-1 truncate">{c.match.home.name} x {c.match.away.name}</span>
                <Crest src={c.match.away.logo} size={18} />
              </div>
              <p className="text-[10px] text-[#5c7263] mt-1">{c.match.flag} {c.match.leagueName} · {new Date(c.match.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</p>
              <div className="flex items-start justify-between mt-2 gap-2">
                <p className="font-bold text-[15px] leading-tight">{c.dir === "ACIMA" ? "Mais" : "Menos"} de {String(c.line).replace(".", ",")} {c.label} · <span className="text-[#0d8f4e]">{c.team}</span></p>
                <p className={`font-display font-bold text-right leading-none ${c.dir === "ACIMA" ? "text-[#0d8f4e]" : "text-[#d92f2f]"}`}>{c.diff > 0 ? "+" : ""}{String(c.diff).replace(".", ",")}<br /><span className="text-[9px]">{c.dir} DA LINHA</span></p>
              </div>
              <p className="text-[11px] mt-1">Média <b>{String(c.media).replace(".", ",")}</b> · {c.mando === "home" ? "jogos em casa" : "jogos fora"} · ficou {c.dir === "ACIMA" ? "acima" : "abaixo"} em {c.hits} de {c.total}</p>
              <div className="flex gap-1 flex-wrap mt-2">
                {c.hist.map((v: number, i: number) => {
                  const hit = c.dir === "ACIMA" ? v > c.line : v < c.line;
                  return <span key={i} className={`min-w-7 h-7 px-1 rounded-lg text-[11px] font-bold flex items-center justify-center ${hit ? "bg-[#b7f5cf] text-[#0d8f4e]" : "bg-[#ffd0d0] text-[#d92f2f]"}`}>{v}</span>;
                })}
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {c.duplo && <span className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-[#d9fff0] text-[#0d8f4e]">✓ Desapito duplo</span>}
                {c.segura && <span className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-[#ffe8cc] text-[#9a5b00]">Adversário segura</span>}
                {c.baseParcial && <span className="text-[10px] font-extrabold px-2 py-1 rounded-full bg-[#fff3c4]">Base parcial</span>}
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => setOpen(open === c.id ? null : c.id)} className="flex-1 py-2 rounded-xl bg-white border border-[#d7e0d3] text-[11px] font-bold">Números do jogo</button>
                <button onClick={() => like(c.id)} className="px-3 py-2 rounded-xl bg-white border border-[#d7e0d3] text-[11px] font-bold flex items-center gap-1"><Heart size={12} className={likes[c.id]?.mine ? "fill-danger text-danger" : ""} /> {likes[c.id]?.count || "Curtir"}</button>
              </div>
              {open === c.id && (
                <div className="mt-2 text-[11px] bg-white rounded-xl p-2">
                  <p>{c.team} ({c.mando === "home" ? "casa" : "fora"}) · linha {c.line} · {c.hits}/{c.total}</p>
                  <Link href={`/supertips/jogo/${c.match.id}?league=${c.match.league}`} className="text-[#0d8f4e] font-bold">Abrir confronto →</Link>
                </div>
              )}
            </article>
          ))}
          <p className="text-[9px] text-mut">Fonte: ESPN · {data?.scanned || 0} jogos varridos. Árbitro: a escala sai na página do jogo quando a ESPN publica.</p>
        </div>
      )}

      {!loading && tab === "pick" && (data?.pick ? <PickCard pick={data.pick} /> : <p className="text-xs text-mut text-center py-8">Sem pick qualificado hoje (corte 70% e amostra mínima).</p>)}
      {!loading && tab === "melhores" && (
        <div className="space-y-2">
          {(data?.melhores || []).map((p: any, i: number) => (
            <Link key={i} href={`/jogos/${p.matchId}?tab=money-tips&league=${p.league}`} className="flex items-center gap-2 bg-[#141820] rounded-xl p-3">
              <span className="font-display font-bold text-acc w-5">{i + 1}</span>
              <div className="flex-1 min-w-0"><p className="text-[12px] font-bold truncate">{p.jogo.timeCasa} x {p.jogo.timeFora}</p><p className="text-[10px] text-mut">{p.oportunidade.mercado} {p.oportunidade.linha}</p></div>
              <span className="font-display font-bold text-acc">{p.oportunidade.acertos}/{p.oportunidade.totalJogos}</span>
            </Link>
          ))}
          {(data?.melhores || []).length === 0 && <p className="text-xs text-mut text-center py-8">Lista vazia hoje.</p>}
        </div>
      )}
      {!loading && tab === "indicadores" && (
        <div className="bg-[#141820] rounded-2xl p-4 text-[12px] text-mut leading-relaxed">
          <p className="font-bold text-ink mb-1">Indicadores de apostas</p>
          Os donuts de clean sheet, gols marcados e invencibilidade ficam na aba H2H de cada jogo — calculados com os últimos jogos reais, separados por mando.
          <p className="mt-2">Faixas do tipo “vitória como favorito entre 1,51 e 1,80” precisam do histórico de odds. A ESPN gratuita não entrega isso, então o bloco fica oculto em vez de mostrar porcentagem inventada.</p>
          <Link href="/supertips" className="inline-block mt-3 px-4 py-2 rounded-full bg-acc text-black text-xs font-extrabold">ESCOLHER UM JOGO</Link>
        </div>
      )}
    </div>
    </TipsGate>
  );
}