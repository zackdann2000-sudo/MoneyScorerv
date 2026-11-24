"use client";

import { ShoppingBasket, X, Trash2, Plus, TrendingUp, AlertTriangle, Anchor } from "lucide-react";
import { useBetSlip } from "@/context/BetSlipContext";

/**
 * Carrinho flutuante + gaveta da combinada.
 *
 * Só aparece quando há seleções — um botão vazio fixo na tela é ruído. A gaveta
 * mostra odd total, probabilidade combinada e EV. O EV usa EXCLUSIVAMENTE a odd
 * da Pinnacle: perna sem âncora aparece como "sem âncora" e o EV do bilhete fica
 * indisponível, em vez de ser calculado com a odd de uma casa menor.
 */
export default function BetSlipDock() {
  const {
    total,
    selecoes,
    remover,
    limpar,
    oddTotal,
    probCombinada,
    evCombinado,
    correlacao,
    semAncora,
    aberto,
    setAberto,
  } = useBetSlip();

  if (total === 0) return null;

  const probPct = probCombinada * 100;
  // Odd alta com probabilidade baixíssima não é "boa"; sinalizamos a faixa.
  const corProb = probPct >= 40 ? "text-acc" : probPct >= 15 ? "text-warn" : "text-mut";

  return (
    <>
      {/* Carrinho flutuante */}
      <button
        onClick={() => setAberto(true)}
        className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 pl-3 pr-4 h-12 rounded-2xl bg-acc text-bg font-extrabold shadow-lg shadow-black/30 active:scale-95 transition-transform"
        aria-label={`Abrir combinada com ${total} ${total === 1 ? "item" : "itens"}`}
      >
        <span className="relative inline-flex">
          <ShoppingBasket size={19} />
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-bg text-acc text-[9px] font-extrabold inline-flex items-center justify-center tabular-nums">
            {total}
          </span>
        </span>
        <span className="text-[12px] leading-none">
          Combinada
          <span className="block text-[9px] font-bold opacity-70 tabular-nums">
            odd {oddTotal.toFixed(2)}
          </span>
        </span>
      </button>

      {/* Gaveta */}
      {aberto && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Sua combinada">
          {/* Fundo clicável para fechar */}
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setAberto(false)}
            aria-label="Fechar combinada"
          />

          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl bg-bg border-t border-line flex flex-col">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 border-b border-line">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-ink">Sua combinada</p>
                <p className="text-[10px] text-mut">
                  {total} {total === 1 ? "seleção" : "seleções"}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={limpar}
                  className="inline-flex items-center gap-1 px-2.5 h-8 rounded-xl border border-line text-mut text-[10px] font-bold"
                >
                  <Trash2 size={12} /> Limpar
                </button>
                <button
                  onClick={() => setAberto(false)}
                  className="w-8 h-8 rounded-xl border border-line text-ink inline-flex items-center justify-center"
                  aria-label="Fechar"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Seleções */}
            <ul className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
              {selecoes.map((s) => (
                <li key={s.chave} className="rounded-xl border border-line bg-panel p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-extrabold text-ink truncate">
                        {s.jogador || s.mercado}
                      </p>
                      <p className="text-[10px] text-mut truncate">
                        {s.jogador ? s.mercado : "Mercado de jogo"}
                        {s.linha != null ? ` · acima de ${s.linha}` : ""}
                      </p>
                      <p className="text-[9px] text-mut/80 truncate">{s.matchLabel}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-extrabold text-acc tabular-nums">
                        {s.odd > 1 ? s.odd.toFixed(2) : "—"}
                      </p>
                      <p className="text-[9px] text-mut tabular-nums">
                        {Math.round(s.probModelo * 100)}%
                      </p>
                      <p
                        className={`mt-0.5 inline-flex items-center gap-0.5 text-[8px] font-bold ${
                          s.oddPinnacle != null ? "text-acc" : "text-warn"
                        }`}
                      >
                        <Anchor size={8} />
                        {s.oddPinnacle != null ? "Pinnacle" : "sem âncora"}
                      </p>
                    </div>
                    <button
                      onClick={() => remover(s.chave)}
                      className="shrink-0 w-7 h-7 rounded-lg border border-line text-mut inline-flex items-center justify-center"
                      aria-label={`Remover ${s.jogador || s.mercado}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Totais */}
            <div className="border-t border-line px-4 py-3 space-y-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-mut">Odd total</span>
                <span className="text-lg font-extrabold text-acc tabular-nums">{oddTotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-mut">Probabilidade combinada</span>
                <span className={`text-sm font-extrabold tabular-nums ${corProb}`}>
                  {probPct.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-mut">EV (odd Pinnacle)</span>
                {evCombinado == null ? (
                  <span className="text-[10px] font-bold text-warn">indisponível</span>
                ) : (
                  <span
                    className={`text-sm font-extrabold tabular-nums inline-flex items-center gap-1 ${
                      evCombinado > 0 ? "text-acc" : "text-mut"
                    }`}
                  >
                    <TrendingUp size={11} />
                    {evCombinado >= 0 ? "+" : ""}
                    {evCombinado.toFixed(1)}%
                  </span>
                )}
              </div>

              {correlacao && (
                <div className="rounded-xl border border-warn/50 bg-warn/10 p-2">
                  <p className="flex items-center gap-1 text-[10px] font-extrabold text-warn uppercase">
                    <AlertTriangle size={11} /> Combinada correlacionada
                  </p>
                  <p className="mt-0.5 text-[9px] leading-snug text-warn/90">
                    {correlacao}. O produto das probabilidades só vale para eventos independentes —
                    aqui a chance real é <b>maior</b> que a mostrada, e o EV não é publicado.
                  </p>
                </div>
              )}

              {!correlacao && semAncora > 0 && (
                <p className="text-[9px] leading-snug text-mut">
                  {semAncora} {semAncora === 1 ? "seleção está" : "seleções estão"} sem odd da
                  Pinnacle. Sem âncora não calculamos EV — preferimos não mostrar a mostrar um
                  número puxado pela odd de uma casa menor.
                </p>
              )}

              <p className="text-[9px] text-mut leading-relaxed">
                A probabilidade é o produto das probabilidades individuais do modelo. Pernas do mesmo
                jogo ou do mesmo jogador tendem a se correlacionar: quando isso acontece, o aviso
                acima aparece e o EV é omitido.
              </p>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setAberto(false)}
                  className="flex-1 h-10 rounded-xl border border-line text-ink text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <Plus size={13} /> Adicionar mais
                </button>
                <button
                  onClick={() => setAberto(false)}
                  className="flex-1 h-10 rounded-xl bg-panel2 border border-line text-ink text-xs font-bold inline-flex items-center justify-center gap-1.5"
                >
                  <TrendingUp size={13} /> Ver análises
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
