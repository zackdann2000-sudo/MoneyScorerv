"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SourceFoot } from "@/components/ui";
import { useBetSlip, type Selecao } from "@/context/BetSlipContext";
import {
  combosDoDia,
  pernasDoDia,
  retornoComBanca,
  type ComboDia,
  type OportunidadeLike,
} from "@/lib/comboDoDia";

/**
 * AI Combo Builder — múltiplas de 2, 3 e 4 pernas montadas com as oportunidades
 * de valor do dia (EV ≥ 10%).
 *
 * Nasceu como uma camada de apresentação: a conta é toda da camada pura
 * `comboDoDia`, e a UI só busca a lista que a aba OPORTUNIDADES já consome.
 *
 * O que esta tela NÃO faz, de propósito:
 *  - não inventa odd: perna sem odd > 1 é descartada na origem;
 *  - não repete jogo: mercados do mesmo jogo vêm do mesmo Poisson e são
 *    dependentes, então a combinação fica proibida (não só "avisada");
 *  - não promete lucro: o retorno é uma conta sobre a banca digitada.
 */

const RISCO_UI: Record<ComboDia["risco"], { cor: string; texto: string }> = {
  conservador: { cor: "bg-acc/15 text-acc", texto: "Conservador" },
  moderado: { cor: "bg-warn/15 text-warn", texto: "Moderado" },
  agressivo: { cor: "bg-danger/15 text-danger", texto: "Agressivo" },
};

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

type RespostaOpps = {
  oportunidades?: OportunidadeLike[];
  error?: string;
};

export default function ComboTab({ league }: { league: string }) {
  /* Estado único da busca: guarda o que veio da API (ou o erro). "carregando"
     é derivado de `estado === null` — nada de setState síncrono no efeito. */
  const [estado, setEstado] = useState<{ oportunidades: OportunidadeLike[] | null; erro: string } | null>(null);
  const [banca, setBanca] = useState(100);
  const oportunidades = estado?.oportunidades ?? null;
  const erro = estado?.erro ?? "";
  const carregando = estado === null;

  const { alternar, tem, substituir, setAberto } = useBetSlip();

  const carregar = useCallback(() => {
    fetch("/api/opportunities?limit=40&minProb=0.55&maxMatches=10")
      .then((r) => r.json())
      .then((j: RespostaOpps) => {
        if (j?.error) {
          setEstado({ oportunidades: [], erro: j.error });
          return;
        }
        setEstado({ oportunidades: Array.isArray(j?.oportunidades) ? j.oportunidades : [], erro: "" });
      })
      .catch(() => setEstado({ oportunidades: [], erro: "A fonte não respondeu. Tente de novo em alguns minutos." }));
  }, []);

  // Uma busca por montagem da aba: a lista do dia não muda a cada segundo.
  useEffect(() => {
    carregar();
  }, [carregar]);

  const pernas = useMemo(() => pernasDoDia(oportunidades), [oportunidades]);
  const combos = useMemo(() => combosDoDia(pernas, { tamanhos: [2, 3, 4] }), [pernas]);

  /** Converte uma perna do combo na seleção do bilhete global. */
  const paraSelecao = useCallback(
    (p: ComboDia["pernas"][number]): Selecao => ({
      chave: p.chave,
      fixtureId: Number(p.matchId) || 0,
      origem: "mercado",
      matchLabel: p.matchLabel,
      mercado: p.rotulo,
      league: p.league || league,
      odd: p.odd,
      // Âncora só quando a odd veio da Pinnacle: o bilhete calcula EV em cima
      // dela e não deve usar odd de casa menor como se fosse referência.
      oddPinnacle: p.oddPinnacle,
      probModelo: Math.min(0.999, Math.max(0.001, p.prob)),
    }),
    [league],
  );

  const enviarCombo = useCallback(
    (c: ComboDia) => {
      substituir(c.pernas.map(paraSelecao));
      setAberto(true);
    },
    [paraSelecao, substituir, setAberto],
  );

  if (carregando && !oportunidades) {
    return (
      <div className="space-y-2">
        <div className="skeleton h-16" />
        <div className="skeleton h-24" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cabeçalho + banca */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-display font-bold uppercase tracking-wide">🧩 AI Combo Builder</p>
            <p className="text-[11px] text-mut mt-1 leading-snug">
              Múltiplas montadas com as oportunidades de valor do dia (EV ≥ 10%). Uma perna por jogo: mercados do
              mesmo jogo dependem um do outro e não podem ser multiplicados.
            </p>
          </div>
          <button
            onClick={carregar}
            className="shrink-0 text-[10px] font-extrabold px-2 py-1 rounded-full border border-line bg-panel2 text-mut"
          >
            Recalcular
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <label className="text-[10px] font-bold uppercase text-mut">Banca</label>
          <div className="flex items-center gap-1 rounded-lg border border-line bg-panel2 px-2 py-1">
            <span className="text-[11px] font-bold text-mut">R$</span>
            <input
              type="number"
              min={0}
              step={10}
              value={banca}
              onChange={(e) => setBanca(Math.max(0, Number(e.target.value) || 0))}
              className="w-20 bg-transparent text-[12px] font-bold tabular-nums outline-none"
              aria-label="Banca em reais"
            />
          </div>
          <span className="text-[10px] text-mut">sobre o valor total da múltipla</span>
        </div>
      </div>

      {erro && (
        <div className="bg-panel border border-line rounded-2xl p-4">
          <p className="text-[11px] text-warn">{erro}</p>
        </div>
      )}

      {/* Sem combo: explicação honesta em vez de card vazio */}
      {!erro && combos.length === 0 && (
        <div className="bg-panel border border-line rounded-2xl p-4">
          <p className="text-[11px] leading-snug text-mut">
            {pernas.length < 2
              ? `Hoje só há ${pernas.length} seleção com EV ≥ 10% e odd válida. Múltipla precisa de pelo menos duas pernas em jogos diferentes — melhor não montar do que empilhar perna ruim.`
              : "As seleções de hoje estão concentradas nos mesmos jogos; juntar duas pernas do mesmo jogo não é múltipla, é aposta dobrada."}
          </p>
          <button
            onClick={carregar}
            className="mt-2 text-[10px] font-extrabold px-2.5 py-1 rounded-full bg-acc text-black"
          >
            Buscar de novo
          </button>
        </div>
      )}

      {combos.map((c) => {
        const risco = RISCO_UI[c.risco];
        const { retorno, lucro } = retornoComBanca(c, banca);
        return (
          <div key={c.tamanho} className="bg-panel border border-line rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display font-bold text-sm">
                Múltipla de {c.tamanho}
                <span className="text-mut font-normal"> · {c.pernas.length} jogos</span>
              </p>
              <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${risco.cor}`}>{risco.texto}</span>
            </div>

            <div className="mt-2 divide-y divide-line">
              {c.pernas.map((p) => {
                const sel = paraSelecao(p);
                const noBilhete = tem(p.chave);
                return (
                  <div key={p.chave} className="flex items-center gap-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold truncate">{p.rotulo}</p>
                      <p className="text-[9px] text-mut truncate">
                        {p.matchLabel} · {(p.prob * 100).toFixed(0)}% modelo · EV {p.evPct.toFixed(1)}%
                      </p>
                    </div>
                    <span className="text-[11px] font-extrabold tabular-nums text-ink">{p.odd.toFixed(2)}</span>
                    <button
                      onClick={() => alternar(sel)}
                      aria-pressed={noBilhete}
                      aria-label={noBilhete ? `Remover ${p.rotulo} do bilhete` : `Adicionar ${p.rotulo} ao bilhete`}
                      className={`h-6 w-6 shrink-0 rounded-full text-[12px] font-black flex items-center justify-center border ${
                        noBilhete ? "bg-acc text-black border-acc" : "bg-panel2 text-mut border-line"
                      }`}
                    >
                      {noBilhete ? "✓" : "+"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 grid grid-cols-3 gap-2 text-center bg-panel2 rounded-xl p-2">
              <div>
                <p className="text-[9px] uppercase text-mut font-bold">Odd total</p>
                <p className="font-display font-black text-lg text-acc tabular-nums">{c.odd.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-mut font-bold">EV</p>
                <p className="font-display font-black text-lg text-good tabular-nums">+{c.evPct.toFixed(0)}%</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-mut font-bold">Acerto (modelo)</p>
                <p className="font-display font-black text-lg text-ink tabular-nums">{(c.prob * 100).toFixed(1)}%</p>
              </div>
            </div>

            <div className="mt-1.5 flex items-center justify-between rounded-xl bg-black/25 px-2.5 py-1.5">
              <span className="text-[10px] text-mut">
                {brl(banca)} → <b className="text-ink">{brl(retorno)}</b>
              </span>
              <span className="text-[11px] font-extrabold text-acc tabular-nums">lucro {brl(lucro)}</span>
            </div>

            <button
              onClick={() => enviarCombo(c)}
              className="mt-2 w-full rounded-xl bg-acc text-black font-extrabold text-[12px] py-2"
            >
              Enviar as {c.tamanho} ao bilhete
            </button>
          </div>
        );
      })}

      {combos.length > 0 && (
        <p className="text-[10px] text-mut leading-snug px-1">
          O EV é uma estimativa do modelo, não uma garantia. Múltipla multiplica o retorno e também o risco de errar:
          com {combos[0]?.tamanho} pernas a chance de acerto já cai bastante. Aposte só o que pode perder.
        </p>
      )}

      {oportunidades && (
        <SourceFoot
          fonte="Oportunidades do dia (Poisson × odds de mercado)"
          amostra={pernas.length}
          extra="Pernas repetidas do mesmo jogo são bloqueadas"
        />
      )}

      {/* Escopo explícito: é o dia, não só este jogo. */}
      <p className="text-[10px] text-mut px-1 leading-snug">
        As pernas vêm de todos os jogos de hoje com valor, não só deste confronto. Para uma múltipla só com mercados
        deste jogo, use a aba MERCADOS.
      </p>
    </div>
  );
}
