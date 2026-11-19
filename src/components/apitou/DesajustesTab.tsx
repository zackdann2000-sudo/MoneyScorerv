"use client";

import { useMemo, useState } from "react";
import { Crosshair, Info } from "lucide-react";
import { useApi } from "./useApi";
import type { DesajustesResp } from "./types";
import {
  ErrorBox,
  EmptyBox,
  Spinner,
  FonteBadge,
  NivelBadge,
  EdgeText,
  ProbBar,
  QiPill,
  ValorPill,
  horaJogo,
  diaCurto,
} from "./Ui";
import LeagueFilterPill, { usePrincipaisLigas } from "@/components/LeagueFilter";

type Nivel = "quente" | "bom" | "neutro";

/**
 * Aba "Desajustes" — a lista global, da maior vantagem para a menor.
 *
 * Consome GET /api/apitou/desajustes. Aqui o filtro de nível é aplicado na API
 * (evita trafegar 300 itens quando o usuário quer só os quentes).
 */
export default function DesajustesTab({
  date,
  onAbrirJogo,
}: {
  date: string;
  onAbrirJogo: (id: number) => void;
}) {
  const [nivel, setNivel] = useState<Nivel | "">("");
  const [limite, setLimite] = useState(30);
  const [soPrincipais, setSoPrincipais] = usePrincipaisLigas();

  const url = useMemo(() => {
    const q = new URLSearchParams();
    if (nivel) q.set("nivel", nivel);
    if (date) q.set("date", date);
    // O filtro de ligas vai para a API: ela corta pelo `limit` DEPOIS de filtrar,
    // então a paginação "carregar mais" continua trazendo 30 itens por vez.
    if (soPrincipais) q.set("principais", "1");
    q.set("limit", String(limite));
    return `/api/apitou/desajustes?${q.toString()}`;
  }, [nivel, date, limite, soPrincipais]);

  const { data, loading, error, refresh } = useApi<DesajustesResp>(url, [nivel, date, limite, soPrincipais]);

  if (loading && !data) return <Spinner label="Procurando desajustes…" />;
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const contagem = data.contagem ?? {};
  const totalQuente = contagem.quente ?? 0;
  const totalBom = contagem.bom ?? 0;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-line bg-panel p-3 space-y-1">
        <p className="text-[10px] font-bold text-mut uppercase tracking-wide flex items-center gap-1">
          <Crosshair size={11} /> Desajustes modelo × mercado
        </p>
        <p className="text-[10px] text-mut leading-relaxed flex items-start gap-1">
          <Info size={11} className="mt-0.5 shrink-0" />
          Props em que o modelo vê mais chance do que a odd paga. Edges altos com probabilidade
          baixa aparecem como &quot;bom&quot;, não &quot;quente&quot; — evento improvável paga bem mas raramente
          acontece.
        </p>
      </div>

      <LeagueFilterPill principais={soPrincipais} onChange={setSoPrincipais} />

      {/* Filtros de nível */}
      <div className="flex gap-1.5">
        {(
          [
            ["", "Todos", data.total],
            ["quente", "Quentes", totalQuente],
            ["bom", "Bons", totalBom],
          ] as const
        ).map(([key, label, n]) => (
          <button
            key={key}
            onClick={() => setNivel(key as Nivel | "")}
            className={`flex-1 h-8 rounded-xl border text-[10px] font-bold transition-colors ${
              nivel === key ? "bg-acc text-bg border-acc" : "bg-panel border-line text-ink"
            }`}
          >
            {label} {n > 0 && <span className="opacity-70">({n})</span>}
          </button>
        ))}
      </div>

      {data.desajustes.length === 0 ? (
        <EmptyBox>
          {soPrincipais && data.total === 0
            ? "Nenhum desajuste nas principais ligas. Use \"Todas as Ligas\" para ver o recorte completo."
            : `Nenhum desajuste${nivel ? ` no nível "${nivel}"` : ""}. O mercado está alinhado com o modelo — o que também é informação.`}
        </EmptyBox>
      ) : (
        <ul className="space-y-2">
          {data.desajustes.map((d) => (
            <li key={d.chave} className="rounded-2xl border border-line bg-panel p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-ink truncate">{d.jogador}</p>
                  <p className="text-[10px] text-mut truncate">
                    {d.mercado} · acima de {d.linha}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <NivelBadge nivel={d.nivel} />
                  <p className="text-[10px] text-mut mt-1 tabular-nums">odd {d.odd.toFixed(2)}</p>
                </div>
              </div>

              <ProbBar modelo={d.probModelo} mercado={d.probMercado} />

              <p className="text-[9px] font-semibold text-acc tabular-nums">
                Modelo: {Math.round(d.probModelo * 100)}% de acerto | Odd: {d.odd.toFixed(2)} | Valor Esperado:{" "}
                {d.probModelo * d.odd - 1 >= 0 ? "+" : ""}
                {((d.probModelo * d.odd - 1) * 100).toFixed(1)}%
              </p>

              <div className="flex items-center justify-between pt-1 border-t border-line/60">
                <button
                  onClick={() => onAbrirJogo(d.fixtureId)}
                  className="text-[10px] font-bold text-mut hover:text-acc text-left truncate"
                >
                  {d.home} × {d.away} · {diaCurto(d.dia)} {horaJogo(d.kickoff)}
                </button>
                <span className="inline-flex items-center gap-3 shrink-0">
                  <span className="text-[10px] text-mut">
                    <EdgeText edge={d.edge} />
                  </span>
                  <QiPill qi={d.qi} />
                  <ValorPill valor={d.valor} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data.total > data.desajustes.length && (
        <button
          onClick={() => setLimite((l) => Math.min(l + 30, 300))}
          className="w-full h-9 rounded-xl border border-line text-ink text-[11px] font-bold"
        >
          Ver mais ({data.desajustes.length} de {data.total})
        </button>
      )}

      <FonteBadge geradoEm={data.geradoEm} stale={data.stale} />
    </div>
  );
}