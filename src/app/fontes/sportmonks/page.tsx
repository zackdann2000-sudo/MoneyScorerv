"use client";
import { useEffect, useState } from "react";
import { Crest } from "@/components/ui";

export default function SportmonksFeed() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/fontes/sportmonks").then((r) => r.json()).then(setData).catch(() => setErr("Falha ao consultar a Sportmonks."));
  }, []);
  const games = data?.matches || [];
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest text-mut">FEED SPORTS ALERT</p>
      <h1 className="font-display font-bold text-3xl">Jogos do dia</h1>
      <p className="text-sm text-mut">Logos, horário e status no formato recebido da Sportmonks. Sem chave, a lista fica vazia.</p>
      {err && <p className="text-danger text-sm mt-3">{err}</p>}
      {data?.error && <p className="text-sm text-mut mt-3">{data.error}</p>}
      <p className="text-[11px] text-mut mt-3">Fonte: sportmonks · {games.length} jogos</p>
      <div className="mt-3 space-y-2">
        {games.map((g: any) => (
          <div key={g.id} className="rounded-2xl border border-line bg-panel p-4 text-center">
            <p className="text-[10px] text-mut">{g.league || g.country || ""} · {g.status}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center mt-2 gap-2">
              <div><Crest src={g.homeTeamLogo} size={48} /><p className="text-xs font-bold mt-1">{g.homeTeam}</p></div>
              <span className="font-display font-bold text-2xl">{g.isFinished || g.isLive ? "" : new Date(g.kickoff_utc).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
              <div><Crest src={g.awayTeamLogo} size={48} /><p className="text-xs font-bold mt-1">{g.awayTeam}</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}