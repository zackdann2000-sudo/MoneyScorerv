import { Sparkles } from "lucide-react";
import { palpitesH2H, resumoH2H, MAX_H2H, MIN_JOGOS, type H2HJogo } from "@/lib/h2hPalpite";

/**
 * Card "Palpite fixo" do H2H.
 *
 * Lê os confrontos diretos já disponíveis (nenhuma chamada nova, nenhum dado
 * inventado) e destaca o mercado que mais se repetiu. A frase vem pronta do
 * módulo puro `@/lib/h2hPalpite`, com a contagem real (acertos/total).
 *
 * `jogos` deve vir do mais recente para o mais antigo. Limitamos a 7 aqui
 * também, para o card nunca sair do escopo pedido, mesmo que a tela passe mais.
 */
export default function H2HPalpiteCard({
  jogos,
  className = "",
}: {
  jogos: H2HJogo[];
  className?: string;
}) {
  const resumo = resumoH2H((jogos ?? []).slice(0, MAX_H2H));

  // Sem amostra mínima não há palpite — melhor não mostrar nada que inventar.
  if (resumo.total < MIN_JOGOS) return null;

  const { principal, secundario, total, mediaGols } = resumo;
  /* Over 1.5 e BTTS são os dois mercados que o pedido cita no texto fixo.
     Saem da MESMA janela de 7 confrontos já usada no restante do card —
     nenhuma chamada nova e nenhum número inventado. */
  const ranking = palpitesH2H((jogos ?? []).slice(0, MAX_H2H));
  const over15 = ranking.find((p) => p.id === "over15");
  const btts = ranking.find((p) => p.id === "btts");
  const corForca =
    principal?.forca === "forte"
      ? "bg-acc/20 text-acc border-acc/50"
      : principal?.forca === "moderado"
        ? "bg-warn/15 text-warn border-warn/40"
        : "bg-panel2 text-mut border-line";

  return (
    <div
      className={`rounded-2xl border border-acc/40 bg-gradient-to-br from-acc/15 via-panel to-panel p-3 space-y-1.5 ${className}`}
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-acc uppercase tracking-wide">
          <Sparkles size={12} /> Palpite fixo · H2H
        </span>
        {principal && (
          <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border ${corForca}`}>
            {principal.pct}% · {principal.acertos}/{principal.total}
          </span>
        )}
      </div>

      {principal ? (
        <>
          <p className="text-[10px] text-mut leading-snug">
            O que mais acontece quando essas equipes se enfrentam?
          </p>
          <p className="text-[13px] leading-snug font-extrabold text-ink">
            {principal.texto}
          </p>
          {(over15 || btts) && (
            <p className="text-[10px] font-bold text-ink leading-snug tabular-nums">
              {over15 && (
                <>
                  Over 1.5 gols bateu em <span className="text-acc">{over15.pct}%</span> ({over15.acertos}/{over15.total})
                </>
              )}
              {over15 && btts ? " · " : null}
              {btts && (
                <>
                  BTTS em <span className="text-acc">{btts.pct}%</span> ({btts.acertos}/{btts.total})
                </>
              )}
            </p>
          )}
          <p className="text-[10px] text-mut leading-snug">
            Nos últimos <span className="font-bold text-ink">{total}</span> confrontos diretos, é o que
            mais aconteceu{secundario ? (
              <>
                {" "}— logo atrás, <span className="text-ink font-semibold">{secundario.mercado.toLowerCase()}</span>{" "}
                em {secundario.acertos}/{secundario.total}.
              </>
            ) : (
              "."
            )}
          </p>
        </>
      ) : (
        <p className="text-[11px] font-bold text-ink leading-snug">
          Sem padrão claro nos últimos {total} confrontos — nenhum mercado passou de 57%.
        </p>
      )}

      <p className="text-[9px] text-mut/80">
        Base: {total} de {MAX_H2H} H2H mais recentes · média {mediaGols.toFixed(1)} gols/jogo · dados reais
      </p>
    </div>
  );
}
