"use client";
import { useState } from "react";
import { ChevronDown, Layers } from "lucide-react";
import type { Decomposicao, Pilar } from "@/lib/pilares";

/**
 * Pilares decompostos — a explicação do número, não um número novo.
 *
 * Regras desta tela:
 *  1. A barra é o **peso** do pilar no λ (fatia do desvio). Pilar que não entra
 *     no λ (hit rate, value) aparece sem barra, rotulado "leitura de apoio".
 *  2. Pilar sem base não é desenhado: vai para a linha "sem base", com o motivo.
 *  3. O total das barras é 100% do desvio do λ — não é uma "nota de 0 a 100"
 *     misturada com probabilidade.
 */

const fmtX = (f: number | null) =>
  f == null ? "—" : `×${f.toFixed(2).replace(".", ",")}`;

/** Cor por nota: mesma escala do resto do app (65 verde / 40 amarelo). */
function corNota(nota: number | null): { barra: string; texto: string } {
  if (nota == null) return { barra: "bg-line", texto: "text-mut" };
  if (nota >= 65) return { barra: "bg-acc", texto: "text-acc" };
  if (nota >= 40) return { barra: "bg-warn", texto: "text-warn" };
  return { barra: "bg-danger", texto: "text-danger" };
}

function LinhaPilar({ p }: { p: Pilar }) {
  const cor = corNota(p.nota);
  const peso = p.peso;
  return (
    <li className="py-2 border-t border-line first:border-t-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-extrabold text-ink">{p.nome}</span>
        {p.fator != null && (
          <span className="rounded bg-panel2 border border-line px-1 py-0.5 text-[9px] font-bold tabular-nums text-mut">
            {fmtX(p.fator)}
          </span>
        )}
        {peso == null && (
          <span className="rounded border border-line px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-mut/80">
            leitura
          </span>
        )}
        <span className={`ml-auto text-[11px] font-extrabold tabular-nums ${cor.texto}`}>
          {p.nota == null ? "—" : p.nota}
        </span>
      </div>

      {/* Barra = contribuição no λ. Sem peso no λ, sem barra (nem a trilha). */}
      {peso != null && (
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-panel2">
          <div
            className={`h-full rounded-full ${cor.barra}`}
            style={{ width: `${Math.max(2, Math.min(100, peso))}%` }}
          />
        </div>
      )}

      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[9px] text-mut tabular-nums">
          {peso == null ? "não entra no λ" : `${peso}% do λ`}
        </span>
        <span className="text-[9px] text-mut/70 leading-snug">{p.explicacao}</span>
      </div>

      {p.detalhe && <p className="mt-1 text-[9px] leading-snug text-mut/90">{p.detalhe}</p>}
    </li>
  );
}

export default function PilaresAnalise({ decomp }: { decomp: Decomposicao }) {
  const [aberto, setAberto] = useState(true);

  const comBase = decomp.pilares.filter((p) => p.nota != null);
  const semBase = decomp.pilares.filter((p) => p.nota == null);
  if (!comBase.length && !decomp.aviso) return null;

  const somaPeso = comBase.reduce((s, p) => s + (p.peso ?? 0), 0);

  return (
    <section
      aria-label="Pilares da análise"
      className="rounded-2xl border border-line bg-panel p-4"
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 text-left"
      >
        <Layers size={13} className="shrink-0 text-purple" />
        <p className="text-[10px] font-bold uppercase tracking-wide text-mut">
          Pilares da análise
        </p>
        {decomp.score != null && (
          <span className="rounded-md border border-purple/40 bg-purple/15 px-1.5 py-0.5 text-[9px] font-extrabold text-purple">
            {decomp.mercado ? `${decomp.mercado} · ` : ""}
            {decomp.score}%
          </span>
        )}
        <ChevronDown
          size={14}
          className={`ml-auto shrink-0 text-mut transition-transform ${aberto ? "" : "-rotate-90"}`}
        />
      </button>

      <p className="mt-1 text-[9px] leading-snug text-mut">
        A mesma conta do modelo, aberta: cada barra é a fatia daquele pilar no total
        esperado. <span className="font-bold text-ink/80">1,00 no modificador é neutro</span> —
        acima puxa para cima, abaixo puxa para baixo.
      </p>

      {decomp.aviso && (
        <p className="mt-2 rounded-xl border border-warn/40 bg-warn/10 px-2.5 py-1.5 text-[9px] font-bold leading-snug text-warn">
          {decomp.aviso}
        </p>
      )}

      {aberto && (
        <>
          <ul className="mt-2">{comBase.map((p) => <LinhaPilar key={p.id} p={p} />)}</ul>

          {decomp.modificadores.length > 0 && (
            <div className="mt-3">
              <p className="text-[9px] font-bold uppercase tracking-wide text-mut">
                Modificadores aplicados
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {decomp.modificadores.map((m) => {
                  const paraCima = m.fator != null && m.fator > 1.005;
                  const paraBaixo = m.fator != null && m.fator < 0.995;
                  const classe = paraCima
                    ? "border-acc/45 bg-acc/10 text-acc"
                    : paraBaixo
                      ? "border-danger/45 bg-danger/10 text-danger"
                      : "border-line bg-panel2 text-mut";
                  return (
                    <span
                      key={m.id}
                      title={m.detalhe}
                      className={`rounded-md border px-1.5 py-1 text-[10px] font-bold tabular-nums ${classe}`}
                    >
                      {m.rotulo} {fmtX(m.fator)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {semBase.length > 0 && (
            <div className="mt-3 rounded-xl border border-line bg-panel2/50 px-2.5 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-wide text-mut">Sem base</p>
              <ul className="mt-0.5 space-y-0.5">
                {semBase.map((p) => (
                  <li key={p.id} className="text-[9px] leading-snug text-mut">
                    <span className="font-bold text-ink/70">{p.nome}:</span> {p.motivo ?? "sem dado"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-2 text-[9px] leading-snug text-mut/80">
            Peso = fatia do desvio logarítmico do λ ({somaPeso > 0 ? `${somaPeso}% distribuído` : "sem desvio relevante"}).
            Hit rate e Value são leitura de apoio: não alteram o número.
          </p>
        </>
      )}
    </section>
  );
}
