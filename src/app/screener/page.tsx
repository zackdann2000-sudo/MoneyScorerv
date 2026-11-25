import type { Metadata } from "next";
import PropsScreener from "@/components/screener/PropsScreener";

export const metadata: Metadata = {
  title: "Screener avançado — jogadores e times que batem seu filtro",
  description:
    "Monte a consulta: jogador ou time, métrica (passes certos, finalizações, cartões, defesas), condição, janela de 3/5/10 jogos e taxa mínima. Os resultados são frequência observada, não previsão.",
};

export default function ScreenerPage() {
  return (
    <main className="mx-auto max-w-screen-md px-3 py-4 space-y-3">
      <header className="rounded-2xl border border-line bg-gradient-to-br from-acc/10 via-panel to-panel p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-acc">Screener avançado</p>
        <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight text-ink">
          Monte o filtro e veja quem bate no histórico
        </h1>
        <p className="mt-1 text-[11px] text-mut">
          Jogador ou time · métrica · condição · janela de 3, 5 ou 10 jogos · taxa mínima. O resultado mostra a
          sequência atual e a taxa de acerto de cada candidato.
        </p>
        <p className="mt-2 text-[9px] leading-snug text-mut/80">
          Isto é frequência do passado, não probabilidade do próximo jogo. Jogo sem o dado na fonte fica fora da
          conta — nunca entra como zero.
        </p>
      </header>

      <PropsScreener />
    </main>
  );
}
