import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarClock, Gauge, History, Repeat } from "lucide-react";
import { EmptyState, SourceFoot } from "@/components/ui";
import type { ArbitroAgregado } from "@/lib/arbitros";
import { montarDossie } from "@/lib/arbitrosFonte";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Árbitro | GreenScore",
  description:
    "Médias de cartões, faltas e pênaltis por jogo, próximo jogo apitado e histórico completo de partidas do árbitro.",
};

type Props = { params: Promise<{ slug: string }> };

const n2 = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
};

const horaBR = (iso: string | null | undefined) => {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
};

function Metrica({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel2/50 p-2">
      <div className="text-[9px] font-bold uppercase tracking-wide text-mut">{rotulo}</div>
      <div className="text-[16px] font-display font-bold tabular-nums leading-tight">{valor}</div>
      {nota && <div className="text-[9px] text-mut">{nota}</div>}
    </div>
  );
}

export default async function ArbitroPage({ params }: Props) {
  const { slug } = await params;

  let erro: string | null = null;
  let dossie: Awaited<ReturnType<typeof montarDossie>> | null = null;
  try {
    dossie = await montarDossie(slug);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  const arbitro: ArbitroAgregado | null = dossie?.arbitro ?? null;
  if (!arbitro && !erro) notFound();

  const jogos = dossie?.historico ?? [];
  const dist = dossie?.distribuicao ?? [];
  const totalDist = dist.reduce((s, f) => s + f.jogos, 0);
  const base = arbitro
    ? arbitro.base === "feed"
      ? `agregado publicado (${arbitro.jogos} jogos)`
      : `nossos registros (${arbitro.jogos} jogos)`
    : "";

  return (
    <div>
      <div className="flex items-start gap-2 mb-1">
        <Gauge size={20} className="text-acc mt-1 shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display font-bold text-[20px] leading-tight truncate">{arbitro?.nome ?? "Árbitro"}</h1>
          <p className="text-[11px] text-mut">
            {arbitro ? `${arbitro.jogos} jogos na base · média de ${base}` : "sem dados"}
            {arbitro?.amostraCurta && <span className="text-warn"> · amostra curta</span>}
          </p>
        </div>
        <Link
          href="/arbitros"
          className="ml-auto text-[11px] font-bold text-acc shrink-0 self-center inline-flex items-center gap-1"
        >
          <ArrowLeft size={12} /> Árbitros
        </Link>
      </div>

      {erro && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-[11px]">
          Falha ao ler os dados: {erro}
        </div>
      )}

      {arbitro && (
        <>
          {/* Médias por jogo */}
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <Metrica rotulo="Cartões/jogo" valor={n2(arbitro.medias.cartoes)} nota="amarelos + vermelhos" />
            <Metrica rotulo="Amarelos/jogo" valor={n2(arbitro.medias.amarelos)} />
            <Metrica rotulo="Vermelhos/jogo" valor={n2(arbitro.medias.vermelhos)} nota={`${pct(arbitro.vermelhoPct)} dos jogos`} />
            <Metrica rotulo="Faltas/jogo" valor={n2(arbitro.medias.faltas)} />
            <Metrica rotulo="Pênaltis/jogo" valor={n2(arbitro.medias.penaltis)} />
            <Metrica rotulo="Jogos na base" valor={String(arbitro.jogos)} nota={`${arbitro.aparicoes} registrados por nós`} />
          </div>

          {/* Próximo jogo */}
          <div className="mt-3 rounded-xl border border-line bg-panel p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">
              <CalendarClock size={11} /> Próximo jogo apitado
            </div>
            {arbitro.proximoJogo ? (
              <div className="mt-1">
                <div className="text-[13px] font-bold">
                  {arbitro.proximoJogo.home} <span className="text-mut">x</span> {arbitro.proximoJogo.away}
                </div>
                <div className="text-[10px] text-mut">
                  {arbitro.proximoJogo.liga || "competição não informada"} · {dataBR(arbitro.proximoJogo.data)} ·{" "}
                  {horaBR(arbitro.proximoJogo.data)}
                </div>
              </div>
            ) : (
              <p className="mt-1 text-[11px] text-mut">Nenhum jogo futuro registrado na base.</p>
            )}
          </div>

          {/* Distribuição de cartões: mostra se é constante ou alterna */}
          <div className="mt-3 rounded-xl border border-line bg-panel p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">
              <BarChart3 size={11} /> Distribuição de cartões por jogo
            </div>
            {totalDist === 0 ? (
              <p className="mt-1 text-[11px] text-mut">
                A fonte publica só o total do árbitro, não cartão por jogo. A distribuição aparece quando o jogo
                apitado tiver o dado registrado.
              </p>
            ) : (
              <div className="mt-1.5 space-y-1">
                {dist.map((f) => {
                  const w = totalDist ? Math.round((f.jogos / totalDist) * 100) : 0;
                  return (
                    <div key={f.faixa} className="flex items-center gap-2">
                      <span className="w-8 text-[10px] text-mut tabular-nums">{f.faixa}</span>
                      <div className="flex-1 h-2 rounded-full bg-panel2 overflow-hidden">
                        <div className="h-full bg-acc" style={{ width: `${w}%` }} />
                      </div>
                      <span className="w-10 text-right text-[10px] tabular-nums text-mut">
                        {f.jogos} · {w}%
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Histórico */}
          <div className="mt-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-mut mb-1">
              <History size={11} /> Histórico de jogos
              <span className="ml-auto normal-case font-normal">{jogos.length} registro(s)</span>
            </div>

            {jogos.length === 0 ? (
              <EmptyState
                title="Sem histórico ainda"
                sub="O histórico cresce a cada sync: cada jogo do feed com este árbitro entra na base."
                actionHref="/arbitros"
                actionLabel="Ver tabela"
              />
            ) : (
              <div className="rounded-xl border border-line bg-panel overflow-hidden">
                <div className="grid grid-cols-[46px_1fr_58px] gap-1 px-2.5 py-1.5 bg-panel2/60 text-[9px] font-bold uppercase tracking-wide text-mut">
                  <span>Data</span>
                  <span>Partida</span>
                  <span className="text-center">Cartões</span>
                </div>
                {jogos.map((j, i) => {
                  const cartoes = j.amarelos == null && j.vermelhos == null ? null : Number(j.amarelos ?? 0) + Number(j.vermelhos ?? 0);
                  return (
                    <div
                      key={`${j.fonteRef ?? i}-${i}`}
                      className="grid grid-cols-[46px_1fr_58px] gap-1 px-2.5 py-1.5 border-t border-line items-center"
                    >
                      <span className="text-[10px] text-mut tabular-nums">{dataBR(j.data)}</span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold truncate">
                          {j.home} <span className="text-mut">x</span> {j.away}
                          {j.homeScore != null && j.awayScore != null && (
                            <span className="text-acc2 ml-1 tabular-nums">
                              {j.homeScore}-{j.awayScore}
                            </span>
                          )}
                        </div>
                        <div className="text-[9px] text-mut truncate">{j.liga || "—"}</div>
                      </div>
                      <span className="text-center text-[11px] tabular-nums">
                        {cartoes == null ? <span className="text-mut">—</span> : cartoes}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <SourceFoot
            fonte="apitou + banco próprio"
            amostra={arbitro.jogos}
            extra={arbitro.base === "feed" ? "média pelo agregado da fonte" : "média pelos nossos registros"}
          />

          <div className="mt-3 rounded-xl border border-line bg-panel p-2.5 text-[10px] text-mut">
            <p className="font-bold text-ink text-[11px] mb-1 inline-flex items-center gap-1">
              <Repeat size={11} /> Como esse número é usado
            </p>
            <p>
              Cartões/jogo e faltas/jogo são o insumo do mercado de disciplina (total de cartões, cartões por time).
              Com o número do árbitro escalado, a análise compara a média do jogo com a média dele — quando as duas
              divergem muito, a linha de cartões está mal precificada.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
