"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, MessageCircle, Share2, ThumbsUp } from "lucide-react";
import { Crest } from "@/components/ui";

export function voterKey() {
  if (typeof window === "undefined") return "";
  let k = localStorage.getItem("gs_voter");
  if (!k || k.length < 8) {
    k = "v" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("gs_voter", k);
  }
  return k;
}

export function ProbRing({ probs, score, tip }: { probs?: { home: number; draw: number; away: number } | null; score?: string | null; tip?: string | null }) {
  if (!probs) {
    return <div className="w-[88px] h-[88px] rounded-full border-4 border-line flex items-center justify-center text-[9px] text-mut text-center px-2 shrink-0">sem amostra</div>;
  }
  const h = Math.round(probs.home * 100);
  const d = Math.round(probs.draw * 100);
  const grad = `conic-gradient(#e8b923 0 ${h}%, #6b7280 ${h}% ${h + d}%, #3b82f6 ${h + d}% 100%)`;
  return (
    <div className="relative w-[92px] h-[92px] rounded-full shrink-0" style={{ background: grad }}>
      <div className="absolute inset-[6px] rounded-full bg-[#10141c] flex flex-col items-center justify-center">
        <span className="font-display font-bold text-[22px] leading-none tracking-wide">{score ? score.replace("-", " : ") : "—"}</span>
        {tip && <span className="mt-1 px-2 py-[1px] rounded-full bg-[#e8b923] text-black text-[8px] font-extrabold tracking-wide">DICA {tip}</span>}
      </div>
    </div>
  );
}

const RISK: Record<string, string> = {
  Alta: "bg-acc/15 text-acc",
  Média: "bg-warn/15 text-warn",
  Arriscada: "bg-danger/15 text-danger",
};
const TRACK: Record<string, string> = {
  acertando: "bg-acc text-black",
  acertou: "bg-acc text-black",
  perdeu: "bg-danger text-white",
};
const TRACK_L: Record<string, string> = { acertando: "Acertando agora", acertou: "ACERTOU", perdeu: "PERDEU" };

export function GameCard({ c, onVote }: { c: any; onVote?: (id: string, choice: string) => void }) {
  const href = c.sport === "football" ? `/supertips/jogo/${c.id}?league=${c.league}` : `/supertips/jogo/${c.id}?league=${c.league}&sport=${c.sport}`;
  const time = c.date ? new Date(c.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "";
  const vote = async (choice: string) => {
    onVote?.(c.id, choice);
    await fetch("/api/supertips/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "vote", matchId: c.id, choice, voterKey: voterKey() }) }).catch(() => {});
  };
  return (
    <article className="bg-[#12161e] border border-white/5 rounded-2xl p-3">
      <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-extrabold">
        {c.live ? <span className="px-2 py-0.5 rounded-full bg-danger text-white flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-white live-dot" /> AO VIVO {c.clock}</span>
          : <span className="text-mut">{c.finished ? "ENCERRADO" : `${new Date(c.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${time}`}</span>}
        {c.track && <span className={`px-2 py-0.5 rounded-full ${TRACK[c.track]}`}>{TRACK_L[c.track]}</span>}
        {c.risk && <span className={`px-2 py-0.5 rounded-full ${RISK[c.risk]}`}>▮ {c.risk}</span>}
        <Link href={`${href}&bell=1`} className="ml-auto text-warn p-1" aria-label="Alerta"><Bell size={14} /></Link>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mt-3">
        <Link href={href} className="flex flex-col items-center gap-1 min-w-0">
          <Crest src={c.home.logo} size={42} alt={c.home.name} />
          <span className="text-[11px] font-bold text-center leading-tight line-clamp-2">{c.home.name}</span>
          {c.home.record && <span className="text-[9px] text-mut">{c.home.record}</span>}
        </Link>
        <Link href={href}><ProbRing probs={c.probs} score={c.predScore || (c.home.score != null ? `${c.home.score}-${c.away.score ?? 0}` : null)} tip={c.tip} /></Link>
        <Link href={href} className="flex flex-col items-center gap-1 min-w-0">
          <Crest src={c.away.logo} size={42} alt={c.away.name} />
          <span className="text-[11px] font-bold text-center leading-tight line-clamp-2">{c.away.name}</span>
          {c.away.record && <span className="text-[9px] text-mut">{c.away.record}</span>}
        </Link>
      </div>
      {(c.live || c.finished) && c.predScore && (
        <p className="text-center text-[10px] mt-1 text-mut">PLACAR <b className="text-ink">{c.home.score ?? 0} : {c.away.score ?? 0}</b>{c.ht ? ` · 1T ${c.ht.home ?? 0}:${c.ht.away ?? 0}` : ""} · palpite {c.predScore.replace("-", ":")}</p>
      )}
      {c.probs && (
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {[["1", c.probs.home, c.votes?.["1"]], ["X", c.probs.draw, c.votes?.X], ["2", c.probs.away, c.votes?.["2"]]].map(([k, p, n]: any) => (
            <button key={k} onClick={() => vote(k)} className={`rounded-xl border px-1 py-1.5 text-center ${c.votes?.mine === k ? "border-[#e8b923] bg-[#e8b923]/10" : "border-white/10 bg-black/20"}`}>
              <span className="text-[11px] font-extrabold">{k} {Math.round((p || 0) * 100)}%</span>
              <span className="flex items-center justify-center gap-1 text-[9px] text-mut"><ThumbsUp size={9} className={c.votes?.mine === k ? "text-[#e8b923]" : ""} /> {n || 0}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {c.overLabel && <span className="text-[10px] font-extrabold px-2 py-1 rounded-lg bg-white/5 border border-white/10">2.5 {c.overLabel}</span>}
        {c.bttsLabel && <span className="text-[10px] font-extrabold px-2 py-1 rounded-lg bg-white/5 border border-white/10">GG {c.bttsLabel}</span>}
        {c.predCoef && <span className="text-[10px] text-mut ml-auto">coef {c.predCoef}</span>}
        <Link href={href} className="text-mut"><MessageCircle size={14} /></Link>
      </div>
    </article>
  );
}

export function WdlDonut({ w, d, l, label }: { w: number; d: number; l: number; label: string }) {
  const t = w + d + l || 1;
  const segs = [{ v: w, c: "#23e57b" }, { v: d, c: "#8b909a" }, { v: l, c: "#ff3b3b" }];
  let acc = 0;
  const parts = segs.map((s) => { const a = acc; acc += (s.v / t) * 100; return `${s.c} ${a}% ${acc}%`; });
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-[11px] text-mut font-semibold">{label}</p>
      <div className="relative w-28 h-28 rounded-full" style={{ background: `conic-gradient(${parts.join(",")})` }}>
        <div className="absolute inset-[14px] rounded-full bg-[#141820] flex items-center justify-center font-display font-bold text-lg">{w}·{d}·{l}</div>
      </div>
    </div>
  );
}

export function CmpBars({ left, right, rows }: { left: string; right: string; rows: { label: string; a: number; b: number }[] }) {
  return (
    <div className="bg-[#141820] border border-white/5 rounded-2xl p-3">
      <div className="flex justify-between text-[12px] font-extrabold mb-2"><span className="text-[#e8b923]">{left}</span><span>{right}</span></div>
      {rows.map((r) => {
        const m = Math.max(r.a, r.b, 0.01);
        return (
          <div key={r.label} className="py-1.5">
            <div className="flex justify-between text-[12px] font-bold"><span>{r.a}</span><span className="text-[10px] text-mut font-semibold">{r.label}</span><span>{r.b}</span></div>
            <div className="relative h-1.5 mt-1 bg-white/5 rounded-full overflow-hidden">
              <div className="absolute right-1/2 top-0 h-full bg-[#e8b923] rounded-l" style={{ width: `${(r.a / m) * 50}%` }} />
              <div className="absolute left-1/2 top-0 h-full bg-[#e8b923] rounded-r" style={{ width: `${(r.b / m) * 50}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ChatFab({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(() => fetch(`/api/supertips/social?matchId=${encodeURIComponent(matchId)}`).then((r) => r.json()).then((j) => setList(j.comments || [])).catch(() => {}), [matchId]);
  useEffect(() => { if (open) load(); }, [open, load]);
  const send = async () => {
    setErr("");
    const r = await fetch("/api/supertips/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "comment", matchId, body: text }) });
    const j = await r.json();
    if (j.error) { setErr(j.error); return; }
    setText(""); setList(j.comments || []);
  };
  const share = () => {
    const msg = `SuperTips · discussão ${matchId}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(location.href)}&text=${encodeURIComponent(msg)}`, "_blank");
  };
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-24 right-4 z-[60] w-12 h-12 rounded-full bg-purple text-white shadow-lg flex items-center justify-center" aria-label="Discussão"><MessageCircle size={20} /></button>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-3xl bg-[#141820] border border-white/10 rounded-t-2xl p-4 max-h-[75vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-display font-bold uppercase">Discussão</p>
              <button onClick={share} className="text-mut flex items-center gap-1 text-[10px] font-bold"><Share2 size={12} /> Telegram</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 min-h-24">
              {list.length === 0 && <p className="text-xs text-mut text-center py-6">Nenhum comentário ainda. Entre na conta para participar.</p>}
              {list.map((c) => (
                <div key={c.id} className="bg-black/30 rounded-xl p-2">
                  <p className="text-[10px] text-acc font-bold">{c.author} <span className="text-mut font-normal">{new Date(c.at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></p>
                  <p className="text-[12px]">{c.body}</p>
                </div>
              ))}
            </div>
            {err && <p className="text-[10px] text-danger mt-1">{err}</p>}
            <div className="flex gap-2 mt-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Comentar (login necessário)" className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm" />
              <button onClick={send} className="px-3 rounded-xl bg-acc text-black font-extrabold text-xs">ENVIAR</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}