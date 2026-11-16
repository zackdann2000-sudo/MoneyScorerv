"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, ListOrdered } from "lucide-react";
import { useApi } from "./useApi";
import { CacheBadge, EmptyBox, ErrorBox, Last10Bar, Spinner, TeamBadge } from "./Ui";
import { fmtDay, fmtTime, formArray, hitTone, lineLabel, type CacheInfo, type ComparisonUI, type LineUI } from "./types";

type LinesResp = {
  fixtureId: string;
  count: number;
  total: number;
  totalAvailable: number;
  markets: string[];
  lines: LineUI[];
  cache: CacheInfo;
};

export default function FixtureDetailTab({
  fixtureId,
  onBack,
}: {
  fixtureId: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"lines" | "comparison">("lines");

  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-mut hover:text-ink"
      >
        <ArrowLeft size={13} /> Voltar
      </button>

      <div className="flex gap-2">
        <button
          onClick={() => setTab("lines")}
          className={`flex-1 h-9 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 ${
            tab === "lines" ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
          }`}
        >
          <ListOrdered size={14} /> Linhas & Odds
        </button>
        <button
          onClick={() => setTab("comparison")}
          className={`flex-1 h-9 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 ${
            tab === "comparison" ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
          }`}
        >
          <BarChart3 size={14} /> Comparativo
        </button>
      </div>

      {tab === "lines" ? <LinesSection fixtureId={fixtureId} /> : <ComparisonSection fixtureId={fixtureId} />}
    </div>
  );
}

/* ----------------------------- Linhas ----------------------------- */

function LinesSection({ fixtureId }: { fixtureId: string }) {
  const [market, setMarket] = useState("");
  const [minHit, setMinHit] = useState(0);

  const url = useMemo(() => {
    const q = new URLSearchParams({ limit: "500" });
    if (market) q.set("market", market);
    if (minHit > 0) q.set("minHit", String(minHit));
    return `/api/gameread/fixtures/${fixtureId}/lines?${q.toString()}`;
  }, [fixtureId, market, minHit]);

  const { data, loading, error, refresh } = useApi<LinesResp>(url);

  // Agrupa visualmente por mercado para a leitura ficar organizada.
  const grouped = useMemo(() => {
    const map = new Map<string, LineUI[]>();
    for (const l of data?.lines ?? []) {
      const arr = map.get(l.marketLabel) ?? [];
      arr.push(l);
      map.set(l.marketLabel, arr);
    }
    return Array.from(map.entries());
  }, [data]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value)}
          className="flex-1 min-w-0 h-8 px-2 rounded-xl border border-line bg-panel text-ink text-[11px] font-bold"
        >
          <option value="">Todos os mercados</option>
          {(data?.markets ?? []).map((m) => (
            <option key={m} value={m}>
              {m.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select
          value={minHit}
          onChange={(e) => setMinHit(Number(e.target.value))}
          className="shrink-0 h-8 px-2 rounded-xl border border-line bg-panel text-ink text-[11px] font-bold"
        >
          <option value={0}>Acerto: todos</option>
          <option value={70}>Acerto 70%+</option>
          <option value={90}>Acerto 90%+</option>
          <option value={100}>Acerto 100%</option>
        </select>
      </div>

      {loading && !data && <Spinner label="Carregando linhas..." />}
      {error && <ErrorBox message={error} onRetry={() => refresh()} />}

      {data && (
        <p className="text-[11px] text-mut px-1">
          {data.count} linhas · {data.total} ofertas brutas agrupadas por melhor odd
        </p>
      )}

      {data && grouped.length === 0 && !loading && <EmptyBox>Nenhuma linha com estes filtros.</EmptyBox>}

      {grouped.map(([label, lines]) => (
        <section key={label} className="rounded-2xl border border-line bg-panel overflow-hidden">
          <header className="px-3 py-1.5 bg-panel2 border-b border-line">
            <h4 className="text-[11px] font-extrabold text-ink truncate">{label}</h4>
          </header>
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={`${l.market}-${l.selection}-${l.line}-${l.playerName ?? ""}`} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                      l.selection === "Over" ? "bg-acc/15 text-acc" : "bg-cyanx/15 text-cyanx"
                    }`}
                  >
                    {lineLabel(l.selection, l.line)}
                  </span>
                  {l.playerName && (
                    <span className="text-[12px] font-bold text-ink truncate min-w-0">{l.playerName}</span>
                  )}
                  {l.playerPosition && <span className="text-[10px] text-mut shrink-0">{l.playerPosition}</span>}
                  <span className="ml-auto shrink-0 text-sm font-extrabold text-ink tabular-nums">
                    {l.price != null ? l.price.toFixed(2) : "—"}
                  </span>
                </div>

                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-mut">
                    L5 <b className={hitTone(l.hitRateL5)}>{l.hitRateL5 == null ? "—" : `${Math.round(l.hitRateL5)}%`}</b>
                  </span>
                  <span className="text-[10px] text-mut">
                    L10 <b className={hitTone(l.hitRateL10)}>{l.hitRateL10 == null ? "—" : `${Math.round(l.hitRateL10)}%`}</b>
                  </span>
                  <span className="text-[10px] text-mut">
                    L20 <b className={hitTone(l.hitRateL20)}>{l.hitRateL20 == null ? "—" : `${Math.round(l.hitRateL20)}%`}</b>
                  </span>
                  {l.h2h && <span className="text-[9px] font-bold text-warn">H2H</span>}
                </div>

                {/* Casas onde a linha está disponível, da melhor para a pior odd. */}
                {l.books.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {l.books.slice(0, 6).map((b) => (
                      <span
                        key={b.name}
                        className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${
                          b.name === l.bestBook ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
                        }`}
                      >
                        {b.name} {b.price.toFixed(2)}
                      </span>
                    ))}
                    {l.books.length > 6 && (
                      <span className="px-1.5 py-0.5 text-[9px] text-mut">+{l.books.length - 6}</span>
                    )}
                  </div>
                )}

                {l.availability && l.availability !== "ok" && (
                  <div className="mt-1 text-[10px] font-bold text-danger">
                    ⚠ {l.availability}
                    {l.injuryReason ? ` · ${l.injuryReason}` : ""}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {data && <CacheBadge cache={data.cache} onRefresh={() => refresh(true)} />}
    </div>
  );
}

/* -------------------------- Comparativo -------------------------- */

function ComparisonSection({ fixtureId }: { fixtureId: string }) {
  const { data, loading, error, refresh } = useApi<ComparisonUI>(
    `/api/gameread/fixtures/${fixtureId}/comparison`,
  );

  if (loading && !data) return <Spinner label="Calculando comparativo..." />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const { home, away, winChance } = data;
  const homeWin = winChance.home ?? 0;
  const drawPct = winChance.draw ?? 0;
  const awayWin = winChance.away ?? 0;

  return (
    <div className="space-y-3">
      {/* Cabeçalho do jogo */}
      <section className="rounded-2xl border border-line bg-panel p-3">
        {data.fixture && (
          <div className="text-[10px] text-mut mb-2 text-center">
            {data.fixture.league}
            {data.fixture.round ? ` · ${data.fixture.round}` : ""} · {fmtDay(data.fixture.kickoffUtc)}{" "}
            {fmtTime(data.fixture.kickoffUtc)}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 text-center space-y-1">
            <TeamBadge name={home?.name ?? "Casa"} logo={home?.logoUrl} size={28} />
          </div>
          <span className="text-[10px] font-bold text-mut shrink-0">VS</span>
          <div className="flex-1 text-center space-y-1">
            <TeamBadge name={away?.name ?? "Fora"} logo={away?.logoUrl} size={28} />
          </div>
        </div>

        {/* Probabilidade de vitória */}
        {(homeWin > 0 || awayWin > 0) && (
          <div className="mt-3">
            <div className="flex h-2 rounded-full overflow-hidden bg-panel2">
              <div className="bg-acc h-full" style={{ width: `${homeWin}%` }} />
              {drawPct > 0 && <div className="bg-mut/50 h-full" style={{ width: `${drawPct}%` }} />}
              <div className="bg-cyanx h-full" style={{ width: `${awayWin}%` }} />
            </div>
            <div className="flex justify-between mt-1 text-[10px] font-bold tabular-nums">
              <span className="text-acc">{homeWin.toFixed(0)}%</span>
              {drawPct > 0 && <span className="text-mut">empate {drawPct.toFixed(0)}%</span>}
              <span className="text-cyanx">{awayWin.toFixed(0)}%</span>
            </div>
          </div>
        )}

        {/* Forma recente */}
        {(data.form.home || data.form.away) && (
          <div className="mt-3 space-y-1">
            <div className="text-[9px] font-bold text-mut uppercase tracking-wide">
              Forma (últimos {data.window ?? 10})
            </div>
            {(
              [
                [home?.name ?? "Casa", data.form.home],
                [away?.name ?? "Fora", data.form.away],
              ] as const
            ).map(([name, form]) => (
              <div key={name} className="flex items-center gap-1.5">
                <span className="text-[10px] text-mut truncate flex-1">{name}</span>
                <span className="flex gap-[3px] shrink-0">
                  {formArray(form).map((r, i) => (
                    <span
                      key={i}
                      className={`w-[14px] h-[14px] rounded-[3px] inline-flex items-center justify-center text-[8px] font-extrabold ${
                        r === "W"
                          ? "bg-acc/25 text-acc"
                          : r === "L"
                            ? "bg-danger/25 text-danger"
                            : "bg-panel2 text-mut"
                      }`}
                    >
                      {r}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Métricas comparadas */}
      {data.metrics.length > 0 ? (
        <section className="rounded-2xl border border-line bg-panel overflow-hidden">
          <ul className="divide-y divide-line">
            {data.metrics.map((m) => (
              <li key={m.key} className="px-3 py-2">
                <div className="flex items-center justify-between text-[11px] font-bold tabular-nums mb-1">
                  <span className="text-acc">{m.home == null ? "—" : `${m.home}${m.suffix}`}</span>
                  <span className="text-[10px] font-semibold text-mut">{m.label}</span>
                  <span className="text-cyanx">{m.away == null ? "—" : `${m.away}${m.suffix}`}</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-panel2" title={`${m.homeShare}%`}>
                  <div className="bg-acc/80 h-full" style={{ width: `${m.homeShare}%` }} />
                  <div className="bg-cyanx/80 h-full" style={{ width: `${100 - m.homeShare}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyBox>Comparativo estatístico ainda não disponível para este jogo.</EmptyBox>
      )}

      <CacheBadge cache={data.cache} onRefresh={() => refresh(true)} />
    </div>
  );
}
