"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap, Plus, Share2, Bookmark } from "lucide-react";
import { Crest } from "@/components/ui";
import { GoalsBars } from "@/components/charts";
import { voterKey } from "@/components/supertips/bits";
import TipsGate from "@/components/TipsGate";

type Leg = { id: string; label: string; odd: number; match: string };

export default function Palpites() {
  const [sport, setSport] = useState<"football" | "nba">("football");
  const [tab, setTab] = useState<"lista" | "multiplas">("lista");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [ticket, setTicket] = useState<Leg[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("gs_ticket") || "[]"); } catch { return []; }
  });
  const [saved, setSaved] = useState("");

  useEffect(() => { localStorage.setItem("gs_ticket", JSON.stringify(ticket)); }, [ticket]);

  useEffect(() => {
    fetch(`/api/supertips/picks?sport=${sport}`).then((r) => r.json()).then((j) => { setData(j); setLoading(false); }).catch(() => setLoading(false));
  }, [sport]);

  const add = (leg: Leg) => setTicket((t) => t.some((x) => x.id === leg.id) ? t : [...t, leg]);
  const odd = ticket.reduce((s, l) => s * (l.odd || 1), ticket.length ? 1 : 0);
  const share = () => {
    const text = `SuperTips múltipla @${odd.toFixed(2)}\n` + ticket.map((l) => `• ${l.match}: ${l.label} @${l.odd}`).join("\n");
    window.open(`https://t.me/share/url?url=${encodeURIComponent(location.origin + "/supertips/palpites")}&text=${encodeURIComponent(text)}`, "_blank");
  };
  const save = async () => {
    const r = await fetch("/api/supertips/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ticket", title: "Múltipla SuperTips", legs: ticket, voterKey: voterKey() }) });
    const j = await r.json();
    setSaved(j.error || (j.ok ? "Bilhete salvo no servidor." : "Falha"));
  };

  return (
    <TipsGate>
    <div>
      <h1 className="font-display font-bold text-2xl uppercase mb-2">Palpites <span className="text-purple">IA</span></h1>
      <div className="flex gap-2 mb-2">
        <button onClick={() => setSport("football")} className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold border ${sport === "football" ? "bg-acc text-black border-acc" : "border-white/10 text-mut"}`}>⚽ Futebol</button>
        <button onClick={() => setSport("nba")} className={`flex-1 py-2 rounded-xl text-[11px] font-extrabold border ${sport === "nba" ? "bg-purple text-white border-purple" : "border-white/10 text-mut"}`}>🏀 NBA props</button>
      </div>
      <div className="flex bg-[#141820] rounded-full p-0.5 mb-3">
        <button onClick={() => setTab("lista")} className={`flex-1 py-1.5 rounded-full text-[11px] font-extrabold ${tab === "lista" ? "bg-purple text-white" : "text-mut"}`}>MERCADOS</button>
        <button onClick={() => setTab("multiplas")} className={`flex-1 py-1.5 rounded-full text-[11px] font-extrabold ${tab === "multiplas" ? "bg-purple text-white" : "text-mut"}`}>MÚLTIPLAS ({ticket.length})</button>
      </div>

      {tab === "multiplas" && (
        <div className="bg-[#141820] border border-purple/30 rounded-2xl p-4">
          {ticket.length === 0 && <p className="text-xs text-mut text-center py-6">Adicione mercados com o botão +. A odd da múltipla é o produto das odds justas (não é odd de casa).</p>}
          {ticket.map((l) => (
            <div key={l.id} className="flex items-center gap-2 py-2 border-b border-white/5 text-[12px]">
              <div className="flex-1 min-w-0"><p className="font-bold truncate">{l.label}</p><p className="text-[10px] text-mut truncate">{l.match}</p></div>
              <span className="font-display font-bold text-purple">@{l.odd.toFixed(2)}</span>
              <button onClick={() => setTicket(ticket.filter((x) => x.id !== l.id))} className="text-danger text-xs">✕</button>
            </div>
          ))}
          {ticket.length > 0 && <p className="font-display font-bold text-3xl text-center mt-3 text-acc">@{odd.toFixed(2)}</p>}
          <div className="flex gap-2 mt-3">
            <button onClick={share} disabled={!ticket.length} className="flex-1 py-2 rounded-xl bg-[#229ED9] text-white text-xs font-extrabold flex items-center justify-center gap-1"><Share2 size={13} /> TELEGRAM</button>
            <button onClick={save} disabled={!ticket.length} className="flex-1 py-2 rounded-xl bg-purple text-white text-xs font-extrabold flex items-center justify-center gap-1"><Bookmark size={13} /> SALVAR</button>
          </div>
          {saved && <p className="text-[10px] text-mut mt-2">{saved}</p>}
        </div>
      )}

      {tab === "lista" && loading && <div className="space-y-2"><div className="skeleton h-28" /><div className="skeleton h-40" /><p className="text-[10px] text-mut text-center">Cruzando os últimos jogos reais… a primeira vez demora porque busca o histórico na ESPN.</p></div>}

      {tab === "lista" && !loading && sport === "football" && (
        <div className="space-y-4">
          {(data?.blocks || []).length === 0 && <p className="text-xs text-mut text-center py-8">Nenhum jogo com 7+ acertos na amostra de hoje. Não publicamos palpite abaixo desse corte.</p>}
          {(data?.blocks || []).map((b: any) => (
            <section key={b.match.id} className="space-y-2">
              <Link href={`/supertips/jogo/${b.match.id}?league=${b.match.league}`} className="flex items-center gap-2">
                <Crest src={b.match.home.logo} size={22} /><span className="text-[12px] font-bold flex-1 truncate">{b.match.home.name} x {b.match.away.name}</span><Crest src={b.match.away.logo} size={22} />
              </Link>
              {b.markets.length === 0 && <p className="text-[11px] text-mut">Sem mercado com 7/10 nesta amostra ({b.sample.home}+{b.sample.away} jogos).</p>}
              {b.markets.map((mk: any, i: number) => {
                const best = i === 0;
                return (
                  <div key={mk.code} className={`rounded-2xl p-3 flex items-center gap-2 border ${best ? "bg-purple/20 border-purple/50" : "bg-[#141820] border-white/5"}`}>
                    <div className="w-24 shrink-0">
                      <p className="text-[10px] text-mut">{best ? "Ótimo" : mk.name}</p>
                      {best && <p className="text-[11px] font-bold">{mk.name}</p>}
                    </div>
                    <div className={`flex-1 rounded-xl px-3 py-2 ${best ? "bg-purple text-white" : "bg-black/30"}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-display font-bold text-xl">{mk.code} {best && <Zap size={14} className="inline" />}</span>
                        <span className="text-[11px]">{mk.modelP != null ? Math.round(mk.modelP * 100) + "%" : ""}</span>
                      </div>
                      <p className="text-[10px] opacity-80">{mk.odd ? `@${mk.odd} justa` : "odd indisponível"}</p>
                    </div>
                    <div className="w-16 text-right">
                      <p className="text-[11px] font-extrabold text-purple">{mk.hits}/{mk.total}</p>
                      <p className="text-[8px] text-mut">TRUST</p>
                      <div className="flex gap-0.5 justify-end mt-1">{Array.from({ length: 10 }).map((_, k) => <span key={k} className={`w-1 h-2 rounded-sm ${k < mk.hits ? "bg-purple" : "bg-white/15"}`} />)}</div>
                    </div>
                    {mk.odd && <button onClick={() => add({ id: b.match.id + mk.code, label: `${mk.name} ${mk.code}`, odd: mk.odd, match: `${b.match.home.name} x ${b.match.away.name}` })} className="p-1 text-acc" aria-label="Adicionar"><Plus size={16} /></button>}
                  </div>
                );
              })}
              {b.match.probs && (
                <div className="grid grid-cols-3 gap-1.5">
                  {[["1", b.match.probs.home], ["X", b.match.probs.draw], ["2", b.match.probs.away]].map(([k, p]: any) => (
                    <div key={k} className="bg-[#141820] rounded-xl p-2 text-center border border-white/5">
                      <p className="font-display font-bold">{k}</p>
                      <p className="text-[10px] text-mut">{p ? (1 / p).toFixed(2) : "—"} · {Math.round(p * 100)}%</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
          <p className="text-[9px] text-mut">TRUST = acertos nos últimos jogos reais do time (corte 7). O % é o modelo Poisson da tabela, separado do TRUST. Não são a mesma coisa.</p>
        </div>
      )}

      {tab === "lista" && !loading && sport === "nba" && (
        <div className="space-y-3">
          {data?.note && <p className="text-xs text-mut text-center py-6">{data.note}</p>}
          {(data?.props || []).map((p: any, i: number) => (
            <article key={i} className="bg-[#141820] border border-white/5 rounded-2xl p-3">
              <div className="flex items-center gap-2">
                {p.athlete.photo ? <img src={p.athlete.photo} alt="" className="w-10 h-10 rounded-full object-cover" /> : <span className="w-10 h-10 rounded-full bg-white/10" />}
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate">{p.athlete.name}</p>
                  <p className="text-[10px] text-mut">{p.athlete.team} · {p.market} +{p.line}</p>
                </div>
                <span className="px-2 py-1 rounded-lg bg-acc text-black font-display font-bold">{p.grade}</span>
              </div>
              <p className="font-display font-bold text-acc text-2xl mt-2">{p.hits}/{p.total} <span className="text-sm text-mut">{p.odd ? `@${p.odd}` : ""}</span></p>
              <ul className="text-[11px] text-mut mt-1 list-disc pl-4">{p.bullets.map((b: string) => <li key={b}>{b}</li>)}</ul>
              <GoalsBars games={p.hist.map((v: number, j: number) => ({ opp: `${j + 1}`, valor: v }))} line={p.line} color="#a855f7" />
              <div className="flex gap-2 mt-2">
                <button onClick={() => add({ id: p.athlete.id + p.market + p.line, label: `${p.athlete.name} ${p.market} +${p.line}`, odd: p.odd || 0, match: "NBA" })} disabled={!p.odd} className="flex-1 py-2 rounded-xl bg-purple text-white text-[11px] font-extrabold">ADICIONAR AO BILHETE</button>
                <button onClick={() => add({ id: "save-" + p.athlete.id + p.market, label: `${p.athlete.name} ${p.market} +${p.line}`, odd: p.odd || 1, match: "NBA salvo" })} className="px-3 rounded-xl border border-white/10 text-[11px] font-bold">SALVAR</button>
              </div>
            </article>
          ))}
          <p className="text-[9px] text-mut">Só props que bateram em 7+ dos últimos jogos do gamelog ESPN. A linha é a mais alta que ainda passa nesse corte — não é odd de casa.</p>
        </div>
      )}
    </div>
    </TipsGate>
  );
}