"use client";
import { useMemo } from "react";
import { Target, Shield, AlertTriangle, TrendingUp } from "lucide-react";
import { resumirH2H, divergenciaPlacar, type H2HJogoReal } from "@/lib/h2hEngine";

/**
 * Aba "H2H REAL" — frequências dos últimos confrontos diretos, em contagem
 * crua. Sem dado da fonte → "Sem dados históricos". Sem odd de placar exato
 * no mercado → sem bloco de divergência (não existe divergência sem preço).
 */
export function H2HRealTab({
  games,
  oddPlacarComum,
}: {
  games?: any[] | null;
  /** Odd de mercado para o placar mais comum, quando a fonte publicar. */
  oddPlacarComum?: number | null;
}) {
  const jogos: H2HJogoReal[] = useMemo(
    () =>
      (games || []).map((g: any) => ({
        golsCasa: Number(g?.homeScore),
        golsFora: Number(g?.awayScore),
        data: g?.date,
        cartoes: g?.cards ?? null,
        faltas: g?.fouls ?? null,
        escanteios: g?.corners ?? null,
      })),
    [games],
  );

  const resumo = useMemo(() => resumirH2H(jogos), [jogos]);

  if (!resumo) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 text-center">
        <AlertTriangle className="mx-auto h-5 w-5 text-warn" />
        <div className="mt-1.5 text-[13px] font-black text-txt">Sem dados históricos</div>
        <p className="mx-auto mt-1 max-w-sm text-[11px] leading-snug text-mut">
          A fonte não entregou confrontos diretos com placar para esta partida. Preferimos deixar em
          branco a inventar número.
        </p>
      </div>
    );
  }

  const divergencia = divergenciaPlacar(resumo.placarComum, oddPlacarComum);

  const badges: { rotulo: string; valor: string; detalhe: string }[] = [];
  if (resumo.over15) badges.push({ rotulo: "Over 1.5 gols", valor: `${resumo.over15.pct}%`, detalhe: `(${resumo.over15.acertos}/${resumo.over15.total})` });
  if (resumo.over25) badges.push({ rotulo: "Over 2.5 gols", valor: `${resumo.over25.pct}%`, detalhe: `(${resumo.over25.acertos}/${resumo.over25.total})` });
  if (resumo.over35) badges.push({ rotulo: "Over 3.5 gols", valor: `${resumo.over35.pct}%`, detalhe: `(${resumo.over35.acertos}/${resumo.over35.total})` });
  if (resumo.btts) badges.push({ rotulo: "Ambas marcam", valor: `${resumo.btts.pct}%`, detalhe: `(${resumo.btts.acertos}/${resumo.btts.total})` });
  if (resumo.cleanSheets) badges.push({ rotulo: "Clean sheet", valor: `${resumo.cleanSheets.pct}%`, detalhe: `(${resumo.cleanSheets.acertos}/${resumo.cleanSheets.total})` });

  return (
    <div className="space-y-3">
      {/* resumo em texto */}
      <div className="rounded-2xl border border-line bg-panel p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-mut">
            Últimos {resumo.total} confrontos diretos
          </p>
          {!resumo.confiavel && (
            <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[9px] font-black uppercase text-warn">
              amostra curta
            </span>
          )}
        </div>
        <p className="mt-1 text-[12px] leading-snug text-txt">{resumo.texto}</p>
      </div>

      {/* badges de frequência */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {badges.map((b) => (
          <div key={b.rotulo} className="rounded-xl border border-line bg-panel px-2.5 py-2">
            <div className="text-[9px] font-black uppercase tracking-wide text-mut">{b.rotulo}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-base font-black text-acc">{b.valor}</span>
              <span className="text-[10px] font-bold text-mut">{b.detalhe}</span>
            </div>
          </div>
        ))}
      </div>

      {/* placar exato mais comum */}
      {resumo.placarComum && (
        <div className="rounded-2xl border border-acc/30 bg-acc/5 p-3.5">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-acc">
            <Target className="h-3.5 w-3.5" /> placar exato mais repetido
          </div>
          <div className="mt-1 flex items-end justify-between gap-2">
            <div>
              <div className="text-2xl font-black text-txt">{resumo.placarComum.placar.replace("-", " × ")}</div>
              <div className="text-[11px] font-bold text-mut">
                {resumo.placarComum.vezes}× em {resumo.total} jogos · {resumo.placarComum.pct}%
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[9px] font-black uppercase text-mut">odd justa</div>
              <div className="text-base font-black text-acc">{resumo.placarComum.oddJusta.toFixed(2)}</div>
            </div>
          </div>

          {divergencia && (
            <div
              className={`mt-2 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold ${
                divergencia.rotulo === "valor"
                  ? "border-good/40 bg-good/10 text-good"
                  : divergencia.rotulo === "neutro"
                    ? "border-line bg-panel2 text-mut"
                    : "border-bad/40 bg-bad/10 text-bad"
              }`}
            >
              <TrendingUp className="mr-1 inline h-3 w-3" />
              mercado paga {divergencia.oddMercado.toFixed(2)} · EV {divergencia.evPct >= 0 ? "+" : ""}
              {divergencia.evPct.toFixed(1)}%
              {divergencia.rotulo === "valor" ? " — divergência de valor" : ""}
            </div>
          )}
        </div>
      )}

      {/* médias de cartões/faltas/escanteios — só quando a fonte entrega */}
      <div className="rounded-2xl border border-line bg-panel p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-mut">
          <Shield className="h-3.5 w-3.5" /> médias reais por confronto
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([
            ["Cartões", resumo.medias.cartoes],
            ["Faltas", resumo.medias.faltas],
            ["Escanteios", resumo.medias.escanteios],
          ] as [string, number | null][]).map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded-xl border border-line bg-panel2 px-2 py-1.5 text-center">
              <div className="text-[9px] font-black uppercase text-mut">{rotulo}</div>
              <div className={`text-sm font-black ${valor == null ? "text-mut" : "text-txt"}`}>
                {valor == null ? "—" : valor.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
        {resumo.medias.cartoes == null && resumo.medias.faltas == null && resumo.medias.escanteios == null && (
          <p className="mt-1.5 text-[10px] leading-snug text-mut">Sem dados históricos de cartões, faltas e escanteios nesta fonte.</p>
        )}
      </div>
    </div>
  );
}

export default H2HRealTab;
