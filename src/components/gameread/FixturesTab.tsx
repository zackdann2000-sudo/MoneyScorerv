"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Radio } from "lucide-react";
import { useApi } from "./useApi";
import { CacheBadge, EmptyBox, ErrorBox, Spinner, TeamBadge } from "./Ui";
import { isMainLeague } from "@/lib/mainLeagues";
import LeagueFilterPill, { usePrincipaisLigas } from "@/components/LeagueFilter";
import { fmtTime, isPending, statusLabel, type CacheInfo, type FixtureUI } from "./types";

type Resp = {
  date: string;
  count: number;
  total: number;
  leagues: string[];
  fixtures: FixtureUI[];
  cache: CacheInfo;
};

export default function FixturesTab({
  date,
  onOpenFixture,
}: {
  date: string;
  onOpenFixture: (id: string) => void;
}) {
  const [league, setLeague] = useState("");
  const [onlyLive, setOnlyLive] = useState(false);
  const [soPrincipais, setSoPrincipais] = usePrincipaisLigas();

  const url = useMemo(() => {
    const q = new URLSearchParams({ date });
    if (league) q.set("league", league);
    if (onlyLive) q.set("live", "1");
    return `/api/gameread/fixtures?${q.toString()}`;
  }, [date, league, onlyLive]);

  const { data, loading, error, refresh } = useApi<Resp>(url);

  // Filtro de principais ligas aplicado no cliente: o cache do dia continua o
  // mesmo (nenhuma chamada nova), só a lista visível muda.
  const fixtures = useMemo(() => {
    const todas = data?.fixtures ?? [];
    return soPrincipais ? todas.filter((f) => isMainLeague(f.leagueName)) : todas;
  }, [data, soPrincipais]);

  // Agrupa por liga preservando a ordem de prioridade que a API já entrega.
  const grouped = useMemo(() => {
    const map = new Map<string, FixtureUI[]>();
    for (const f of fixtures) {
      const arr = map.get(f.leagueName) ?? [];
      arr.push(f);
      map.set(f.leagueName, arr);
    }
    return Array.from(map.entries());
  }, [fixtures]);

  return (
    <div className="space-y-3">
      <LeagueFilterPill principais={soPrincipais} onChange={setSoPrincipais} />

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOnlyLive((v) => !v)}
          className={`shrink-0 px-3 h-8 rounded-full border text-[11px] font-bold inline-flex items-center gap-1.5 ${
            onlyLive ? "border-live text-live bg-live/10" : "border-line text-mut"
          }`}
        >
          <Radio size={12} /> Ao vivo
        </button>
        <select
          value={league}
          onChange={(e) => setLeague(e.target.value)}
          className="shrink-0 px-3 h-8 rounded-full border border-line bg-panel text-ink text-[11px] font-bold max-w-[200px]"
        >
          <option value="">Todas as ligas</option>
          {(data?.leagues ?? []).map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {data && (
          <span className="text-[11px] text-mut ml-auto">
            {fixtures.length} de {data.total} jogos
          </span>
        )}
      </div>

      {loading && !data && <Spinner label="Buscando jogos do dia..." />}
      {error && <ErrorBox message={error} onRetry={() => refresh()} />}

      {data && fixtures.length === 0 && !loading && (
        <EmptyBox>
          {soPrincipais && data.fixtures.length > 0
            ? "Nenhum jogo das Principais Ligas neste dia. A grade só publica as ligas do catálogo — não existe recorte maior para abrir."
            : `Nenhum jogo encontrado para este dia${league ? ` na competição "${league}"` : ""}. Tente outra data ou remova o filtro.`}
        </EmptyBox>
      )}

      {grouped.map(([name, list]) => (
        <section key={name} className="rounded-2xl border border-line bg-panel overflow-hidden">
          <header className="flex items-center gap-2 px-3 py-2 bg-panel2 border-b border-line">
            {list[0]?.leagueLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={list[0].leagueLogo} alt="" width={16} height={16} className="object-contain" loading="lazy" />
            )}
            <h3 className="text-xs font-extrabold text-ink truncate">{name}</h3>
            <span className="ml-auto text-[10px] text-mut shrink-0">{list.length}</span>
          </header>
          <ul className="divide-y divide-line">
            {list.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => onOpenFixture(f.id)}
                  className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-panel2/60 transition-colors"
                >
                  <div className="w-11 shrink-0 text-center">
                    {f.isLive ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-live">
                        <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                        {f.elapsedMinutes ? `${f.elapsedMinutes}'` : "LIVE"}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-mut tabular-nums">{fmtTime(f.kickoffUtc)}</span>
                    )}
                    {!f.isLive && isPending(f.status) && (
                      <span
                        className="mt-0.5 block text-[8px] font-bold text-mut/80 leading-tight"
                        title={statusLabel(f.status, f.isLive, f.elapsedMinutes)}
                      >
                        aguardando
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="text-[13px] font-semibold text-ink flex items-center justify-between gap-2">
                      <TeamBadge name={f.homeName} logo={f.homeLogo} size={16} />
                      {f.homeGoals != null && <span className="tabular-nums shrink-0">{f.homeGoals}</span>}
                    </div>
                    <div className="text-[13px] font-semibold text-ink flex items-center justify-between gap-2">
                      <TeamBadge name={f.awayName} logo={f.awayLogo} size={16} />
                      {f.awayGoals != null && <span className="tabular-nums shrink-0">{f.awayGoals}</span>}
                    </div>
                  </div>

                  <ChevronRight size={15} className="text-mut shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <CacheBadge cache={data?.cache} onRefresh={() => refresh(true)} />
    </div>
  );
}
