"use client";

import { useMemo, useState } from "react";
import { Flame, Target, TrendingUp } from "lucide-react";
import { useApi } from "./useApi";
import type { OportunidadesResp, Categoria } from "./types";
import { ErrorBox, EmptyBox, FonteBadge, ProbBar, FormBadges, CatBadge, horaJogo } from "./Ui";
import { isMainLeague, mainLeagueLabel } from "@/lib/mainLeagues";
import LeagueFilterPill, { usePrincipaisLigas } from "@/components/LeagueFilter";

type Filtro = "todas" | Categoria;

/** Quantos cards por vez. Filtro aplicado antes de paginar. */
const PAGINA = 20;

/**
 * Esqueleto do primeiro cálculo do dia.
 *
 * A rota varre o histórico das centenas de jogos do dia na fonte; na primeira
 * requisição sem cache isso leva dezenas de segundos. Um esqueleto com o
 * formato dos cards deixa claro que está carregando e evita o salto de layout.
 */
function OportunidadesSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Calculando oportunidades">
      <div className="skeleton h-8 w-64 rounded-full" />
      <div className="skeleton h-3 w-44 rounded" />
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-7 w-16 rounded-xl" />
        ))}
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-28 rounded-2xl" />
      ))}
      <p className="text-center text-[10px] text-mut leading-relaxed">
        Calculando as oportunidades do dia… o primeiro cálculo varre o histórico de cada jogo e
        pode levar até 1 minuto. Depois fica em cache por 15 minutos.
      </p>
    </div>
  );
}

/**
 * Aba "Oportunidades" — jogos que bateram o critério do modelo Poisson.
 *
 * Aviso de honestidade: as probabilidades vêm de um modelo próprio sobre o mesmo
 * histórico que o site entrega, e a "odd justa" é 1/probabilidade (referência),
 * não a cotação de uma casa. O usuário compara com a casa dele.
 */
export default function OportunidadesTab({
  date,
  onAbrirJogo,
}: {
  date: string;
  onAbrirJogo: (id: string) => void;
}) {
  const { data, loading, error, refresh } = useApi<OportunidadesResp>(
    `/api/kingstats/oportunidades${date ? `?date=${date}` : ""}`,
    [date],
  );
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [soPrincipais, setSoPrincipais] = usePrincipaisLigas();
  const [limite, setLimite] = useState(PAGINA);

  const lista = useMemo(() => {
    const todas = data?.oportunidades ?? [];
    return soPrincipais ? todas.filter((o) => isMainLeague(o.liga)) : todas;
  }, [data, soPrincipais]);

  const filtradas = useMemo(
    () => (filtro === "todas" ? lista : lista.filter((o) => o.categoria === filtro)),
    [lista, filtro],
  );

  if (loading && !data) {
    return <OportunidadesSkeleton />;
  }
  if (error) return <ErrorBox message={error} onRetry={() => refresh()} />;
  if (!data) return null;

  const contagem = {
    todas: lista.length,
    ft: lista.filter((o) => o.categoria === "ft").length,
    ht: lista.filter((o) => o.categoria === "ht").length,
    btts: lista.filter((o) => o.categoria === "btts").length,
  };

  return (
    <div className="space-y-3">
      <LeagueFilterPill
        principais={soPrincipais}
        onChange={(v) => {
          setSoPrincipais(v);
          setLimite(PAGINA);
        }}
      />

      <div className="flex items-center justify-between text-[10px] text-mut">
        <span>
          <span className="text-acc font-extrabold">{lista.length}</span> oportunidades de{" "}
          {data.analisados ?? 0} jogos analisados
        </span>
        <span className="tabular-nums">{data.dia}</span>
      </div>

      {data.parcial && (
        <p className="text-[9px] text-mut leading-snug -mt-1">
          Amostra parcial: parte dos jogos do dia ainda não tinha histórico na fonte quando este
          cálculo rodou. Na próxima atualização eles entram.
        </p>
      )}

      {/* Filtro por categoria */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(
          [
            ["todas", "Todas"],
            ["ft", "FT"],
            ["ht", "HT"],
            ["btts", "BTTS"],
          ] as [Filtro, string][]
        ).map(([k, rotulo]) => (
          <button
            key={k}
            onClick={() => {
              setFiltro(k);
              setLimite(PAGINA); /* filtro novo recomeça a paginação */
            }}
            className={`shrink-0 px-3 h-7 rounded-xl border text-[10px] font-bold transition-colors ${
              filtro === k ? "bg-acc text-bg border-acc" : "bg-panel border-line text-ink"
            }`}
          >
            {rotulo} {contagem[k]}
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <EmptyBox>
          {data.aviso
            ? data.aviso
            : soPrincipais && (data.oportunidades?.length ?? 0) > 0
              ? "Nenhuma oportunidade nas principais ligas agora. Use \"Todas as Ligas\" para ver o recorte completo."
              : "Nenhuma oportunidade bateu o critério agora. Volte mais tarde — a cada jogo no dia muda."}
        </EmptyBox>
      ) : (
        <ul className="space-y-1.5">
          {filtradas.slice(0, limite).map((o) => (
            <li key={o.jogoId}>
              <button
                onClick={() => onAbrirJogo(o.jogoId)}
                className="w-full text-left rounded-2xl border border-line bg-panel hover:border-acc/60 transition-colors p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <CatBadge cat={o.categoria} />
                    <span className="text-[11px] font-extrabold text-ink truncate">{o.mercado}</span>
                  </span>
                  <span className="text-[10px] text-mut tabular-nums shrink-0">
                    {horaJogo(o.kickoff)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex-1 truncate font-bold text-ink">{o.home}</span>
                  <span className="text-[9px] text-mut shrink-0">×</span>
                  <span className="flex-1 truncate font-bold text-ink text-right">{o.away}</span>
                </div>

                <p className="text-[9px] text-mut uppercase tracking-wide truncate">{mainLeagueLabel(o.liga)}</p>

                <ProbBar valor={o.prob * 100} destaque />

                <div className="flex items-center justify-between gap-2 pt-1 border-t border-line/60">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-acc tabular-nums">
                    <TrendingUp size={11} /> odd justa {o.oddJusta.toFixed(2)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-mut">
                    <span className="inline-flex items-center gap-1">
                      <Flame size={10} /> {(o.confianca * 100).toFixed(0)}%
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Target size={10} /> λ {o.lambdaTotal.toFixed(1)}
                    </span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] text-mut">forma casa</span>
                  <FormBadges form={o.formCasa} />
                  <span className="text-[9px] text-mut">fora</span>
                  <FormBadges form={o.formFora} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filtradas.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + PAGINA)}
          className="w-full h-9 rounded-xl border border-line text-[11px] font-bold text-ink"
        >
          Mostrar mais ({filtradas.length - limite} restantes)
        </button>
      )}

      <p className="text-[9px] text-mut leading-relaxed">
        Modelo Poisson sobre o histórico de cada equipe. A odd justa é 1/probabilidade — compare com
        a sua casa. Não é garantia de resultado.
      </p>

      <FonteBadge geradoEm={data.geradoEm} stale={data.cached && !!data.stale} />
    </div>
  );
}
