"use client";

/**
 * Bloco "Fatores de xG" da tela de detalhe do jogo (DumbleScore).
 *
 * Mostra o que o motor usou para empurrar o xG de cada lado para cima ou para
 * baixo, em pontos percentuais — mesma conta do `factorShift`, lida do cache
 * `hub_xg_factor`. Sem fator gravado, o bloco avisa em vez de sugerir motivo.
 */
import { fatoresPorLado, seloAjuste, type FatorXgBruto, type FatorXgView } from "@/lib/hub/fatoresXg";

type Props = {
  home: { name: string };
  away: { name: string };
  xg?: { home: number; away: number } | null;
  fatores: FatorXgBruto[];
};

const sinal = (pct: number) => `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

function LinhaFator({ f }: { f: FatorXgView }) {
  const cor =
    f.tom === "pos"
      ? "text-acc border-acc/40 bg-acc/10"
      : f.tom === "neg"
        ? "text-danger border-danger/40 bg-danger/10"
        : "text-mut border-line bg-panel2";
  return (
    <li className="py-1.5 border-t border-line first:border-t-0">
      <div className="flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-[11px] font-bold">{f.rotulo}</span>
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums ${cor}`}>
          {sinal(f.pct)}
        </span>
      </div>
      {f.detalhe && <p className="mt-0.5 text-[9px] leading-snug text-mut">{f.detalhe}</p>}
    </li>
  );
}

function Lado({
  nome,
  lado,
  fatores,
  xg,
  cor,
}: {
  nome: string;
  lado: "Home" | "Away";
  fatores: FatorXgBruto[];
  xg?: number | null;
  cor: string;
}) {
  const { itens, ajustePct } = fatoresPorLado(fatores, lado);
  if (!itens.length) {
    return (
      <div>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${cor}`} />
          <span className="min-w-0 truncate text-[11px] font-bold">{nome}</span>
        </div>
        <p className="mt-1 text-[10px] text-mut">Dados indisponíveis para este lado.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className={`h-2 w-2 rounded-full ${cor}`} />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{nome}</span>
        {xg != null && <span className="shrink-0 text-[9px] font-bold text-mut tabular-nums">xG {xg.toFixed(2)}</span>}
      </div>
      <p className="mt-0.5 text-[10px] font-bold text-acc">{seloAjuste(ajustePct)}</p>
      <ul className="mt-1">
        {itens.map((f) => (
          <LinhaFator key={`${lado}-${f.tipo}`} f={f} />
        ))}
      </ul>
    </div>
  );
}

export default function FatoresXg({ home, away, xg, fatores }: Props) {
  const casa = fatoresPorLado(fatores, "Home");
  const fora = fatoresPorLado(fatores, "Away");
  const vazio = !casa.itens.length && !fora.itens.length;

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      {vazio ? (
        <p className="py-2 text-center text-[11px] leading-snug text-mut">
          Dados indisponíveis: esta análise não gravou fatores de xG. Nada é estimado aqui — os fatores aparecem
          quando o motor gera a análise com histórico e escalação.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Lado nome={home.name} lado="Home" fatores={fatores} xg={xg?.home} cor="bg-home" />
          <Lado nome={away.name} lado="Away" fatores={fatores} xg={xg?.away} cor="bg-away" />
        </div>
      )}
      <p className="mt-2 border-t border-line pt-1.5 text-[9px] leading-snug text-mut">
        Percentual = quanto o fator desloca o xG deste lado na conta do modelo (impacto × peso ÷ soma dos pesos,
        limitado a ±25%). Não inclui posse de bola nem contra-ataque: esses não existem no cache desta análise.
      </p>
    </div>
  );
}
