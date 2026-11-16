"use client";

import { useMemo, useState } from "react";
import { Filter, Search, Sparkles, Target } from "lucide-react";
import { useApi } from "./useApi";
import { CacheBadge, EmptyBox, ErrorBox, HitPill, Last10Bar, Spinner, TeamBadge } from "./Ui";
import { fmtTime, GROUPS, hitTone, lineLabel, scoreTone, type CacheInfo, type PropRowUI } from "./types";

type Resp = {
  date: string;
  count: number;
  total: number;
  markets: string[];
  leagues: string[];
  props: PropRowUI[];
  cache: CacheInfo;
  disclaimer: string;
};

/** Piso de score da view "Melhores Oportunidades". */
const GOLD = 90;

export default function PropsTab({
  date,
  onOpenFixture,
}: {
  date: string;
  onOpenFixture: (id: string) => void;
}) {
  // Padrão pedido: abrir mostrando o ouro (score >= 90), não a lista crua.
  const [showAll, setShowAll] = useState(false);
  const [group, setGroup] = useState<string>("todos");
  const [market, setMarket] = useState("");
  const [search, setSearch] = useState("");
  const [minOdd, setMinOdd] = useState(0);

  const url = useMemo(() => {
    // Busca o conjunto completo e filtra no cliente: o payload já vem ordenado
    // e o "Ver todos" precisa alternar sem nova ida à rede.
    const q = new URLSearchParams({ date, limit: "1000" });
    return `/api/gameread/props-radar?${q.toString()}`;
  }, [date]);

  const { data, loading, error, refresh } = useApi<Resp>(url);

  const filtered = useMemo(() => {
    let rows = data?.props ?? [];
    if (!showAll) rows = rows.filter((r) => r.score >= GOLD);
    if (group !== "todos") rows = rows.filter((r) => r.marketGroup === group);
    if (market) rows = rows.filter((r) => r.market === market);
    if (minOdd > 1) rows = rows.filter((r) => (r.odd ?? 0) >= minOdd);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.subjectName.toLowerCase().includes(q) ||
          r.homeName.toLowerCase().includes(q) ||
          r.awayName.toLowerCase().includes(q) ||
          r.leagueName.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, showAll, group, market, search, minOdd]);

  const goldCount = (data?.props ?? []).filter((r) => r.score >= GOLD).length;
  const totalCount = data?.props.length ?? 0;

  // Mercados visíveis no seletor, respeitando o grupo escolhido.
  const marketOptions = useMemo(() => {
    const rows = data?.props ?? [];
    const scoped = group === "todos" ? rows : rows.filter((r) => r.marketGroup === group);
    return Array.from(new Map(scoped.map((r) => [r.market, r.marketLabel])).entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [data, group]);

  return (
    <div className="space-y-3">
      {/* Alternância ouro / lista completa */}
      <div className="rounded-2xl border border-line bg-panel p-2.5 space-y-2.5">
        <div className="flex gap-2">
          <button
            onClick={() => setShowAll(false)}
            className={`flex-1 h-10 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
              !showAll ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
            }`}
          >
            <Sparkles size={14} /> Melhores Oportunidades
            <span className={`px-1.5 rounded-md text-[10px] ${!showAll ? "bg-acc/20" : "bg-panel2"}`}>{goldCount}</span>
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`flex-1 h-10 rounded-xl border text-xs font-extrabold inline-flex items-center justify-center gap-1.5 transition-colors ${
              showAll ? "border-acc2 text-acc2 bg-acc2/10" : "border-line text-mut"
            }`}
          >
            <Target size={14} /> Ver todos
            <span className={`px-1.5 rounded-md text-[10px] ${showAll ? "bg-acc2/20" : "bg-panel2"}`}>{totalCount}</span>
          </button>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Jogador, time ou liga..."
            className="w-full h-9 pl-9 pr-3 rounded-xl border border-line bg-panel2 text-ink text-xs placeholder:text-mut"
          />
        </div>

        {/* Grupos */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {GROUPS.map((g) => (
            <button
              key={g.key}
              onClick={() => {
                setGroup(g.key);
                setMarket("");
              }}
              className={`shrink-0 px-2.5 h-7 rounded-full border text-[10px] font-bold ${
                group === g.key ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Mercado + odd mínima */}
        <div className="flex gap-2">
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="flex-1 min-w-0 h-8 px-2 rounded-xl border border-line bg-panel2 text-ink text-[11px] font-bold"
          >
            <option value="">Todos os mercados</option>
            {marketOptions.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={minOdd}
            onChange={(e) => setMinOdd(Number(e.target.value))}
            className="shrink-0 h-8 px-2 rounded-xl border border-line bg-panel2 text-ink text-[11px] font-bold"
            title="Odd mínima"
          >
            <option value={0}>Odd 1.00+</option>
            <option value={1.5}>Odd 1.50+</option>
            <option value={1.8}>Odd 1.80+</option>
            <option value={2}>Odd 2.00+</option>
          </select>
        </div>
      </div>

      {loading && !data && <Spinner label="Decodificando props radar..." />}
      {error && <ErrorBox message={error} onRetry={() => refresh()} />}

      {data && (
        <div className="flex items-center justify-between text-[11px] text-mut px-1">
          <span className="inline-flex items-center gap-1">
            <Filter size={11} /> {filtered.length} prop{filtered.length === 1 ? "" : "s"}
            {!showAll && " · score ≥ 90"}
          </span>
          <span>ordenado por score</span>
        </div>
      )}

      {data && filtered.length === 0 && !loading && (
        <EmptyBox>
          {showAll
            ? "Nenhuma prop bate os filtros atuais. Limpe a busca ou troque o grupo."
            : `Nenhuma prop com score ≥ ${GOLD} nos filtros atuais. Use "Ver todos" para a lista completa.`}
        </EmptyBox>
      )}

      {/* Lista */}
      <ul className="space-y-2">
        {filtered.map((p) => {
          const tone = scoreTone(p.score);
          return (
            <li key={p.id}>
              <div className={`rounded-2xl border bg-panel overflow-hidden ${tone.border}`}>
                {/* Cabeçalho: score + mercado */}
                <div className={`flex items-center gap-2 px-3 py-1.5 ${tone.bg}`}>
                  <span className={`text-base font-extrabold tabular-nums leading-none ${tone.text}`}>
                    {p.score.toFixed(0)}
                  </span>
                  <span className="text-[10px] font-bold text-mut uppercase tracking-wide -ml-1">score</span>
                  <span className="ml-1 text-[11px] font-bold text-ink truncate">{p.marketLabel}</span>
                  <span
                    className={`ml-auto shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                      p.selection === "Over" ? "bg-acc/15 text-acc" : "bg-cyanx/15 text-cyanx"
                    }`}
                  >
                    {lineLabel(p.selection, p.line)}
                  </span>
                  {p.isLive && (
                    <span className="shrink-0 text-[9px] font-extrabold text-live inline-flex items-center gap-0.5">
                      <span className="w-1 h-1 rounded-full bg-live animate-pulse" />LIVE
                    </span>
                  )}
                </div>

                {/* Corpo */}
                <button
                  onClick={() => onOpenFixture(p.fixtureId)}
                  className="w-full text-left px-3 py-2 hover:bg-panel2/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {p.subjectKind === "player" && p.subjectPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.subjectPhoto}
                        alt=""
                        width={26}
                        height={26}
                        className="rounded-full object-cover bg-panel2 shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <span className="w-[26px] h-[26px] rounded-full bg-panel2 shrink-0 inline-flex items-center justify-center text-[10px] font-bold text-mut">
                        {p.subjectKind === "player" ? "?" : "TM"}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-ink truncate">{p.subjectName}</div>
                      <div className="text-[10px] text-mut truncate">
                        {p.homeName} x {p.awayName} · {fmtTime(p.kickoffUtc)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-sm font-extrabold text-ink tabular-nums">
                        {p.odd != null ? p.odd.toFixed(2) : "—"}
                      </div>
                      <div className="text-[9px] text-mut truncate max-w-[70px]">{p.bookmaker ?? "odd"}</div>
                    </div>
                  </div>

                  {/* Taxas + histórico */}
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-line/60">
                    <HitPill rate={p.hitRateL5} label="L5" tone={hitTone(p.hitRateL5)} />
                    <HitPill rate={p.hitRateL10} label="L10" tone={hitTone(p.hitRateL10)} />
                    <HitPill rate={p.hitRateSzn} label="Temporada" tone={hitTone(p.hitRateSzn)} />
                    <div className="ml-auto flex items-center gap-2">
                      {p.seasonHits != null && p.seasonEval != null && (
                        <span className="text-[10px] text-mut tabular-nums">
                          {p.seasonHits}/{p.seasonEval}
                        </span>
                      )}
                      <Last10Bar bits={p.last10} />
                    </div>
                  </div>

                  {p.availability && p.availability !== "ok" && (
                    <div className="mt-1.5 text-[10px] font-bold text-danger">
                      ⚠ {p.availability}
                      {p.injuryReason ? ` · ${p.injuryReason}` : ""}
                    </div>
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {data && <CacheBadge cache={data.cache} onRefresh={() => refresh(true)} />}
      {data && <p className="text-[10px] text-mut text-center px-4 pb-2">{data.disclaimer}</p>}
    </div>
  );
}
