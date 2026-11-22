"use client";

import Link from "next/link";
import { ChevronRight, LayoutGrid, X } from "lucide-react";
import { GRUPOS, rotaAtiva } from "@/lib/navigation";

/**
 * Bottom sheet "Explorar" — substitui a faixa de 13 chips que ficava colada
 * no topo em todas as telas.
 *
 * Por que sheet e não dropdown: no celular o polegar alcança a metade de baixo,
 * e um painel de 80vh caberia 3 colunas legíveis. O dropdown ancorado no topo
 * fica longe do polegar e corta rótulos longos como "Oportunidades +EV".
 *
 * Mostra só os três grupos principais; o quarto ("Mais ferramentas") fica atrás
 * do botão "Menu completo" para o sheet não virar outra parede de links.
 */
export default function ExploreSheet({
  aberto,
  onFechar,
  onMenuCompleto,
  path,
}: {
  aberto: boolean;
  onFechar: () => void;
  onMenuCompleto: () => void;
  path: string;
}) {
  if (!aberto) return null;

  const grupos = GRUPOS.filter((g) => !g.recolhido);

  return (
    <div className="fixed inset-0 z-[85] flex items-end" role="dialog" aria-modal="true" aria-label="Explorar seções">
      <button className="absolute inset-0 bg-black/60" aria-label="Fechar" onClick={onFechar} />

      <div
        className="rise relative w-full max-h-[82vh] overflow-y-auto rounded-t-3xl border-t border-line bg-panel pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        style={{ animationDuration: ".22s" }}
      >
        {/* puxador + título */}
        <div className="sticky top-0 z-10 bg-panel/95 backdrop-blur px-4 pt-2 pb-2 border-b border-line">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" aria-hidden />
          <div className="flex items-center gap-2">
            <LayoutGrid size={16} className="text-acc" />
            <p className="text-[13px] font-black uppercase tracking-wide text-ink">Explorar</p>
            <button
              onClick={onFechar}
              aria-label="Fechar"
              className="ml-auto -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-mut hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 pt-3">
          {grupos.map((g) => (
            <section key={g.id} className="mb-4">
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-mut">
                {g.titulo}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {g.itens.map((n) => {
                  const Icon = n.icon;
                  const ativo = rotaAtiva(path, n.href);
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      onClick={onFechar}
                      className={`flex min-h-[74px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-2.5 text-center text-[10px] font-bold leading-tight ${
                        ativo
                          ? "border-acc/60 bg-acc/10 text-acc"
                          : "border-line bg-panel2/60 text-ink hover:border-acc/40"
                      }`}
                    >
                      <Icon size={18} className={ativo ? "text-acc" : "text-mut"} />
                      {n.label}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          <button
            onClick={onMenuCompleto}
            className="mt-1 flex w-full items-center justify-between rounded-2xl border border-line bg-panel2 px-4 py-3 text-[12px] font-bold text-ink"
          >
            <span>
              Menu completo
              <span className="ml-1 font-medium text-mut">· times, duelos, rankings, fontes</span>
            </span>
            <ChevronRight size={16} className="text-mut" />
          </button>
        </div>
      </div>
    </div>
  );
}
