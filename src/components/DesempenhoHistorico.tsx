import type { TrackStats } from "@/lib/trackRecord";

/**
 * Desempenho Histórico (Track Record): total, taxa de acerto, unidades e ROI.
 * Unidade = % da banca apostada (Half-Kelly). Serve para /forebet e /apitou.
 */
export default function DesempenhoHistorico({ stats }: { stats: TrackStats | null }) {
  const s = stats;
  // "Aguardando" em vez de traço: traço parece número quebrado, não estado vazio.
  const AGUARDANDO = "Aguardando";
  const unidadeTxt = s ? `${s.unidades >= 0 ? "+" : ""}${s.unidades.toFixed(2)} u` : AGUARDANDO;
  const roi = s?.roi ?? null;
  const cor = (v: number | null) => (v == null ? "text-mut" : v > 0 ? "text-emerald-400" : v < 0 ? "text-danger" : "text-ink");

  const cards: { label: string; valor: string; cor: string; sub: string; pequeno?: boolean }[] = [
    {
      label: "Oportunidades",
      valor: s ? String(s.total) : "0",
      cor: "text-ink",
      sub: s ? `${s.pendentes} pendentes` : "nenhuma registrada",
    },
    {
      label: "Taxa de acerto",
      valor: s?.hitRate == null ? AGUARDANDO : `${s.hitRate.toFixed(1)}%`,
      cor: s?.hitRate == null ? "text-mut" : "text-cyan",
      sub: s ? `${s.greens}G · ${s.reds}R` : "sem liquidação",
      pequeno: s?.hitRate == null,
    },
    {
      label: "Lucro / prejuízo",
      valor: unidadeTxt,
      cor: cor(s?.unidades ?? null),
      sub: s ? `stake ${s.stakeTotal.toFixed(2)} u` : AGUARDANDO,
      pequeno: !s,
    },
    {
      label: "ROI",
      valor: roi == null ? AGUARDANDO : `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`,
      cor: roi == null ? "text-mut" : cor(roi),
      sub: roi == null ? "aguardando liquidação" : "retorno / apostado",
      pequeno: roi == null,
    },
  ];

  return (
    <section className="rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-ink">Desempenho histórico</h2>
        <span className="text-[9px] text-mut">Half-Kelly · 1 u = 1% da banca</span>
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-gradient-to-br from-ink/5 to-transparent p-2">
            <p className="text-[9px] font-bold uppercase tracking-wide text-mut leading-tight">{c.label}</p>
            <p className={`mt-0.5 tabular-nums leading-none ${c.pequeno ? "text-[11px] font-bold" : "text-lg font-extrabold"} ${c.cor}`}>{c.valor}</p>
            <p className="mt-1 text-[9px] text-mut leading-tight">{c.sub}</p>
          </div>
        ))}
      </div>

      {s && s.total === 0 && (
        <p className="mt-2 text-[9px] text-mut">Ainda sem palpites registrados — rode a liquidação/registro para começar o histórico.</p>
      )}
    </section>
  );
}