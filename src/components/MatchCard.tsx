"use client";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { Crest, FavStar, LiveBadge } from "./ui";

export type MatchLite = {
  id: string; league: string; leagueName: string; country: string; flag: string; date: string;
  state: "pre" | "in" | "post"; status: string; clock: string; live: boolean; finished: boolean;
  home: { id: string; name: string; short: string; logo: string; score: number | null; winner?: boolean };
  away: { id: string; name: string; short: string; logo: string; score: number | null; winner?: boolean };
  odds?: { details?: string; ou?: number } | null;
};

export default function MatchCard({ m }: { m: MatchLite }) {
  const time = new Date(m.date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const href = `/jogos/${m.id}?league=${m.league}`;
  const row = (t: MatchLite["home"]) => {
    const dim = m.finished && t.winner === false;
    return (
      <div className="flex items-center gap-2 min-w-0">
        <Crest src={t.logo} size={20} alt={t.name} />
        <span className={`truncate text-[13px] ${dim ? "text-mut" : "font-semibold"}`}>{t.name}</span>
        <span className={`ml-auto font-display font-bold text-base tabular-nums ${m.live ? "text-danger" : dim ? "text-mut" : ""}`}>{m.state === "pre" ? "" : t.score ?? 0}</span>
      </div>
    );
  };
  return (
    <div className="bg-panel border border-line rounded-xl card-hover flex items-stretch overflow-hidden">
      <Link href={href} className="w-14 shrink-0 flex flex-col items-center justify-center gap-0.5 border-r border-line bg-panel2/50 py-2">
        {m.live ? <LiveBadge clock={m.clock?.replace("'", "′") || "LIVE"} /> : m.finished ? (
          <><span className="text-[10px] font-bold text-mut">FIM</span><span className="text-[9px] text-mut">{time}</span></>
        ) : (
          <><span className="font-display font-bold text-sm">{time}</span><span className="text-[8px] text-mut uppercase">{new Date(m.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })}</span></>
        )}
      </Link>
      <Link href={href} className="flex-1 min-w-0 py-2 px-3 space-y-1.5">
        {row(m.home)}
        {row(m.away)}
      </Link>
      <div className="flex flex-col items-center justify-center gap-1.5 pr-2 py-2">
        <FavStar team={{ id: m.home.id, name: m.home.name, league: m.league, logo: m.home.logo }} size={14} />
        <FavStar team={{ id: m.away.id, name: m.away.name, league: m.league, logo: m.away.logo }} size={14} />
      </div>
      <Link href={`${href}&tab=ia`} aria-label="Análise IA" className="flex flex-col items-center justify-center px-2 border-l border-line bg-panel2/30 text-acc">
        <Sparkles size={14} />
        <span className="text-[8px] font-bold mt-0.5">IA</span>
        <ChevronRight size={12} className="text-mut" />
      </Link>
    </div>
  );
}