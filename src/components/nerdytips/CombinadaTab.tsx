"use client";

import { useState } from "react";
import { Check, Copy, Layers, Lock, Sigma } from "lucide-react";
import { useApi } from "./useApi";
import type { Combinada } from "./types";
import { CacheBadge, ConfBar, EmptyBox, ErrorBox, Odd, Spinner } from "./Ui";

/**
 * Aba "Combinada": o Bet Builder do NerdyTips.
 *
 * O gerador livre deles (`POST /bet-builder/generate`) é exclusivo para
 * assinantes — devolve 403 `subscription_required` para qualquer visitante,
 * inclusive com cookie de sessão. O que sobra de graça é o "Free daily slip",
 * que já vem renderizado no HTML: 3 picks prontos com odd total. É isso que
 * mostramos, sem inventar seleção própria.
 */
export default function CombinadaTab() {
  const { data, loading, error, refresh } = useApi<Combinada>("/api/nerdytips/builder");
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    if (!data?.itens.length) return;
    const linhas = data.itens.map(
      (it) => `${it.casa} x ${it.fora} — ${it.texto}${it.odd != null ? ` @ ${it.odd.toFixed(2)}` : ""}`,
    );
    const texto = [
      `${data.rotulo || "Combinada"} (${data.picks ?? data.itens.length} picks)`,
      ...linhas,
      data.oddTotal != null ? `Odd total: ${data.oddTotal.toFixed(2)}` : "",
      "via NerdyTips",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  };

  return (
    <div className="space-y-3">
      {loading && !data && <Spinner label="Buscando a combinada…" />}
      {error && <ErrorBox message={error} onRetry={() => refresh()} />}

      {data && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-mut flex items-center gap-1">
              <Layers size={10} className="text-acc" />
              {data.rotulo || "Slip do dia"}
            </p>
            <CacheBadge cache={data.cache} />
          </div>

          {data.itens.length === 0 ? (
            <EmptyBox>
              O site não publicou combinada gratuita agora. O gerador completo deles é exclusivo
              para assinantes.
            </EmptyBox>
          ) : (
            <>
              {/* Total */}
              <div className="rounded-2xl border border-acc/30 bg-acc/5 p-3 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-[9px] font-extrabold text-acc uppercase tracking-wide">
                      Combinada do dia
                    </p>
                    <p className="text-[11px] text-mut">
                      {data.picks ?? data.itens.length} seleções · publicada pelo NerdyTips
                    </p>
                  </div>
                  <span className="text-xl font-extrabold tabular-nums text-acc">
                    {data.oddTotal != null ? data.oddTotal.toFixed(2) : "—"}
                  </span>
                </div>

                {/* Conferência: o produto das odds tem que fechar com o total */}
                {data.oddCalculada != null && (
                  <p className="text-[9px] text-mut flex items-center gap-1">
                    <Sigma size={9} />
                    {data.itens.map((it) => (it.odd ?? 1).toFixed(2)).join(" × ")} ={" "}
                    <b className="text-ink">{data.oddCalculada.toFixed(2)}</b>
                    {data.oddTotal != null &&
                      (Math.abs(data.oddCalculada - data.oddTotal) < 0.02 ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-400">
                          <Check size={9} /> confere
                        </span>
                      ) : (
                        <span className="text-amber-400">difere do total do site</span>
                      ))}
                  </p>
                )}

                <button
                  type="button"
                  onClick={copiar}
                  className="mt-1 inline-flex items-center gap-1 h-7 px-2.5 rounded-xl border border-line bg-panel text-[10px] font-bold text-ink"
                >
                  {copiado ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  {copiado ? "Copiado" : "Copiar combinada"}
                </button>
              </div>

              {/* Seleções */}
              <div className="space-y-1.5">
                {data.itens.map((it, i) => (
                  <div key={`${it.casa}-${i}`} className="rounded-2xl border border-line bg-panel p-2.5 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[9px] text-mut">
                      <span className="font-bold tabular-nums">{it.data}</span>
                      <span className="opacity-40">·</span>
                      <span className="truncate">
                        {it.ligaPais ? `${it.ligaPais} · ` : ""}
                        {it.ligaNome}
                      </span>
                      <span className="ml-auto shrink-0 font-extrabold text-mut/70">
                        {i + 1}/{data.itens.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <p className="truncate text-[12px] font-bold text-ink">{it.casa}</p>
                        <p className="truncate text-[12px] font-bold text-ink">{it.fora}</p>
                      </div>

                      <div className="shrink-0 text-right space-y-0.5">
                        <p className="text-[11px] font-extrabold text-acc whitespace-nowrap">
                          {it.texto || it.palpite}
                        </p>
                        <div className="flex items-center justify-end gap-1.5">
                          <ConfBar valor={it.confianca} />
                          <Odd valor={it.odd} destaque />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Limite do gratuito */}
          <div className="rounded-2xl border border-line bg-panel/60 p-3 space-y-1">
            <p className="text-[10px] font-extrabold text-ink flex items-center gap-1">
              <Lock size={10} className="text-amber-400" /> Monte a sua: só no site deles, com
              assinatura
            </p>
            <p className="text-[9px] text-mut leading-relaxed">
              {data.minTrust != null && data.maxTrust != null
                ? `No plano gratuito o site deixa escolher confiança entre ${(data.minTrust / 10).toFixed(1)} e ${(data.maxTrust / 10).toFixed(1)}, `
                : "No gerador do site você escolhe "}
              quantidade de picks, odds-alvo, janela de tempo e mercados. O endpoint que monta a
              seleção responde <code className="text-ink">subscription_required</code> para quem não
              assina — então não temos como oferecer o builder completo.
            </p>
            <p className="text-[9px] text-mut leading-relaxed">
              Esta combinada é o slip diário publicado por eles. Não é recomendação nossa e odd
              passada não garante acerto.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
