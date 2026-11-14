"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ArrowLeft, Bell } from "lucide-react";
import { Suspense } from "react";
import { Crest, FormDots, FavStar, SourceFoot, VipLock, Modal, Toggle } from "@/components/ui";
import LineupPitch from "@/components/Lineup";
import { useApp } from "@/context/AppContext";

function TeamInner() {
  const { id } = useParams<{ id: string }>();
  const league = useSearchParams().get("league") || "bra.1";
  const router = useRouter();
  const { flags, setFlags, addToast } = useApp();
  const [d, setD] = useState<any>(null);
  const [bell, setBell] = useState(false);

  useEffect(() => { fetch(`/api/teams/${id}?league=${league}`).then((r) => r.json()).then(setD).catch(() => {}); }, [id, league]);

  if (!d) return <div className="space-y-2"><div className="skeleton h-36" /><div className="skeleton h-28" /><div className="skeleton h-64" /></div>;
  if (d.error) return <p className="text-center text-mut py-10">{d.error}</p>;
  const info = d.info;
  const avgs = [
    ["Gols", d.averages.gols], ["Sofridos", d.averages.sofridos], ["Escanteios", d.averages.escanteios], ["Chutes no gol", d.averages.chutesGol],
    ["Finalizações", d.averages.finalizacoes], ["Faltas", d.averages.faltas], ["Amarelos", d.averages.amarelos], ["Posse %", d.averages.posse],
  ];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => router.back()} className="p-2 bg-panel border border-line rounded-full"><ArrowLeft size={16} /></button>
        <p className="text-[11px] font-bold text-mut">Página do time · últimos {d.averages.jogos} jogos</p>
      </div>

      <div className="rounded-2xl border border-line overflow-hidden mb-3">
        <div className="p-4 flex items-center gap-3" style={{ background: `linear-gradient(120deg, #${info?.color || "14532d"}33, var(--panel))` }}>
          <Crest src={info?.logo} size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-2xl leading-tight truncate">{info?.name || "Time"}</h1>
            <p className="text-[11px] text-mut">{info?.standing || ""}</p>
            {info?.record && <p className="text-[10px] text-mut">Temporada: {info.record} (V-E-D)</p>}
          </div>
          <div className="flex flex-col gap-2 items-center">
            <FavStar team={{ id: String(id), name: info?.name || "", league, logo: info?.logo || "" }} size={20} />
            <button onClick={() => setBell(true)} className="text-warn"><Bell size={18} /></button>
          </div>
        </div>
        <div className="bg-panel px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] text-mut uppercase font-bold">Forma recente</span>
          <FormDots form={d.form} size="md" />
        </div>
      </div>

      <div className="bg-panel border border-line rounded-2xl p-3 mb-3">
        <p className="text-[10px] font-bold text-mut uppercase mb-2">Desempenho · médias por jogo (da equipe, não do jogo)</p>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {avgs.map(([l, v]: any, i) => (
            <div key={i} className="bg-panel2 rounded-xl p-2"><p className="font-display font-bold text-lg text-acc">{v ?? "—"}</p><p className="text-[8px] text-mut uppercase leading-tight">{l}</p></div>
          ))}
        </div>
        <div className="flex justify-center gap-4 mt-2 text-[11px] font-bold">
          <span className="text-acc">{d.averages.v}V</span><span className="text-warn">{d.averages.e}E</span><span className="text-danger">{d.averages.d}D</span>
        </div>
        <SourceFoot fonte="ESPN" amostra={d.averages.jogos} />
      </div>

      {/* Escalação provável */}
      <div className="mb-3">
        <p className="font-display font-bold uppercase text-lg mb-1">Escalação provável</p>
        {!d.vip ? <VipLock label="Escalações são VIP"><div className="h-48 pitch opacity-40 rounded-xl" /></VipLock> : d.lineupProvavel ? (
          <div className="bg-panel border border-line rounded-2xl p-3">
            <p className="text-[9px] text-warn font-bold uppercase mb-1">Base estatística: XI do último jogo real — {d.lineupBase}</p>
            <LineupPitch home={d.lineupProvavel} homeName={info?.name || ""} single />
          </div>
        ) : <p className="text-xs text-mut bg-panel border border-dashed border-line rounded-xl p-4 text-center">Sem escalação registrada no último jogo desta liga.</p>}
      </div>

      <p className="font-display font-bold uppercase text-lg mb-1">Últimos jogos</p>
      <div className="space-y-1.5 mb-3">
        {(d.last || []).map((m: any) => {
          const me = m.home.id === String(id) ? m.home : m.away, op = m.home.id === String(id) ? m.away : m.home;
          const res = (me.score ?? 0) > (op.score ?? 0) ? "V" : (me.score ?? 0) === (op.score ?? 0) ? "E" : "D";
          return (
            <Link key={m.id} href={`/jogos/${m.id}?league=${m.league}`} className="flex items-center gap-2 bg-panel border border-line rounded-xl p-2.5 card-hover">
              <span className={`w-6 h-6 rounded-full text-[10px] font-extrabold flex items-center justify-center ${res === "V" ? "bg-acc text-black" : res === "E" ? "bg-warn text-black" : "bg-danger text-white"}`}>{res}</span>
              <Crest src={op.logo} size={20} />
              <span className="text-[12px] font-semibold truncate flex-1">{m.home.id === String(id) ? "" : "@ "}{op.name}</span>
              <span className="font-display font-bold">{m.home.score} - {m.away.score}</span>
              <span className="text-[9px] text-mut w-12 text-right">{new Date(m.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
            </Link>
          );
        })}
      </div>

      {d.next?.length > 0 && (
        <>
          <p className="font-display font-bold uppercase text-lg mb-1">Próximos jogos</p>
          <div className="space-y-1.5">
            {d.next.map((m: any) => (
              <Link key={m.id} href={`/jogos/${m.id}?league=${m.league}`} className="flex items-center gap-2 bg-panel border border-line rounded-xl p-2.5 card-hover">
                <span className="text-[10px] text-mut w-16">{new Date(m.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {new Date(m.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
                <Crest src={m.home.logo} size={18} /><span className="text-[12px] font-semibold truncate flex-1">{m.home.name} x {m.away.name}</span><Crest src={m.away.logo} size={18} />
              </Link>
            ))}
          </div>
        </>
      )}

      <Modal open={bell} onClose={() => setBell(false)} title={`🔔 Alertas — ${info?.name || "time"}`}>
        <div className="divide-y divide-line">
          <Toggle on={flags.goals} onChange={(v) => setFlags({ ...flags, goals: v })} label="⚽ Gols" />
          <Toggle on={flags.redCards} onChange={(v) => setFlags({ ...flags, redCards: v })} label="🟥 Vermelhos" />
          <Toggle on={flags.yellowCards} onChange={(v) => setFlags({ ...flags, yellowCards: v })} label="🟨 Amarelos" />
          <Toggle on={flags.corners} onChange={(v) => setFlags({ ...flags, corners: v })} label="🚩 Escanteios" />
          <Toggle on={flags.matchEnd} onChange={(v) => setFlags({ ...flags, matchEnd: v })} label="🏁 Fim de jogo" />
          <Toggle on={flags.lineups} onChange={(v) => setFlags({ ...flags, lineups: v })} label="📋 Escalações" />
        </div>
        <button onClick={() => {
          setFlags(flags);
          fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId: String(id), alerts: flags }) }).catch(() => {});
          setBell(false); addToast({ title: "🔔 Alertas do time salvos!", body: `Você será notificado dos eventos de ${info?.name}.` });
        }} className="w-full mt-3 py-2.5 rounded-xl bg-acc text-black font-extrabold text-sm">SALVAR</button>
      </Modal>
    </div>
  );
}

export default function TeamPage() {
  return <Suspense fallback={<div className="skeleton h-64" />}><TeamInner /></Suspense>;
}