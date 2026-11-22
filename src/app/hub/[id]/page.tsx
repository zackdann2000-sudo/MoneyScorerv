import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Target, GitCompareArrows, BarChart3, TriangleAlert, Info, MapPin, Clock, Activity, Users, Flame, TrendingUp, Coins } from "lucide-react";
import { Crest, StatCompareRow } from "@/components/ui";
import DestaquesConfronto from "@/components/hub/DestaquesConfronto";
import FatoresXg from "@/components/hub/FatoresXg";
import PadroesEstatisticos from "@/components/hub/PadroesEstatisticos";
import OddsMultiCasa from "@/components/hub/OddsMultiCasa";
import { hubGameDetail, type HubDetail } from "@/lib/hub/queries";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const pct = (v: number, casas = 0) => `${(v * 100).toFixed(casas)}%`;

const quando = (d: Date) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "";
  }
};

const nomeSelecao = (selection: string, d: HubDetail) =>
  selection === "Home" ? d.home.name : selection === "Away" ? d.away.name : selection === "Draw" ? "Empate" : selection;

const AO_VIVO = new Set(["INPLAY_1ST_HALF", "HT", "INPLAY_2ND_HALF", "ET", "PEN_LIVE"]);

const tomForma = (r: string) =>
  r === "V" ? "bg-acc text-black" : r === "E" ? "bg-warn text-black" : r === "D" ? "bg-danger text-white" : "bg-panel2 text-mut";

function FormaTime({
  nome,
  forma,
  jogos,
  lado,
}: {
  nome: string;
  forma: string;
  jogos: number;
  lado: "home" | "away";
}) {
  const letras = forma.split("");
  return (
    <div className="flex items-center gap-2 py-1.5 border-t border-line first:border-t-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${lado === "home" ? "bg-home" : "bg-away"}`} />
      <span className="text-[11px] font-bold truncate flex-1 min-w-0">{nome}</span>
      <div className="flex gap-1 shrink-0" aria-label={`Forma recente: ${letras.join("-")}`}>
        {letras.length ? (
          letras.map((r, i) => (
            <span
              key={`${r}-${i}`}
              title={r === "V" ? "Vitória" : r === "E" ? "Empate" : "Derrota"}
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-extrabold ${tomForma(r)}`}
            >
              {r}
            </span>
          ))
        ) : (
          <span className="text-[10px] font-bold text-mut">—</span>
        )}
      </div>
      <span className="text-[9px] text-mut tabular-nums shrink-0 w-6 text-right">{jogos}j</span>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const d = await hubGameDetail(Number(id));
    if (!d) return { title: "Jogo | Centro de Jogos" };
    return {
      title: `${d.home.name} x ${d.away.name} · ${d.league.name} | GreenScore`,
      description: `Probabilidade 1X2, top 5 placares exatos (Poisson) e estatísticas de ${d.home.name} contra ${d.away.name}.`,
    };
  } catch {
    return { title: "Jogo | Centro de Jogos" };
  }
}

function Secao({ icon, title, right, children }: { icon: React.ReactNode; title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-3">
      <div className="flex items-center gap-1.5 mb-1.5 px-0.5">
        <span className="text-acc">{icon}</span>
        <h2 className="font-display font-bold text-sm uppercase tracking-wide">{title}</h2>
        {right && <span className="ml-auto text-[10px] font-bold text-mut">{right}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function HubGamePage({ params }: Props) {
  const { id } = await params;
  const jogoId = Number(id);
  if (!Number.isFinite(jogoId)) notFound();

  const d = await hubGameDetail(jogoId);
  if (!d) notFound();

  const aoVivo = AO_VIVO.has(d.liveState);
  const encerrado = d.liveState === "FT" || d.liveState === "AET";
  const mostraPlacar = aoVivo || encerrado;
  const p = d.probabilities;
  const maiorPlacar = d.topScores.length ? Math.max(...d.topScores.map((s) => s.probability)) : 0;
  const btts = d.markets.find((m) => m.market === "BTTS" && m.selection === "Yes");
  const over25 = d.markets.find((m) => m.market === "Over/Under" && m.selection === "Over 2.5");
  const under25 = d.markets.find((m) => m.market === "Over/Under" && m.selection === "Under 2.5");

  return (
    <div>
      <Link href="/hub" className="inline-flex items-center gap-1 text-[11px] font-bold text-mut mb-2">
        <ArrowLeft size={14} /> Centro de Jogos
      </Link>

      {d.demo && (
        <div className="mb-2 rounded-xl border border-warn/40 bg-warn/10 p-2.5 flex gap-2">
          <TriangleAlert size={14} className="text-warn mt-0.5 shrink-0" />
          <p className="text-[11px] text-ink leading-snug">
            <span className="font-bold text-warn">Jogo de demonstração.</span> Os números saem do mesmo motor Poisson,
            mas os xG são fixos e as odds são de exemplo — não use para decidir aposta.
          </p>
        </div>
      )}

      {/* cabeçalho do jogo */}
      <div className="rounded-xl border border-line bg-panel p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-mut">
          <span className="truncate">{d.league.name}</span>
          {d.league.country && <span className="truncate">· {d.league.country}</span>}
          {d.league.isExperimental && <span className="px-1.5 rounded-full bg-warn/15 text-warn text-[9px] font-extrabold">EXPERIMENTAL</span>}
          {d.analysisType && (
            <span className={`ml-auto px-1.5 rounded-full text-[9px] font-extrabold ${d.analysisType === "Final" ? "bg-acc text-black" : "bg-panel2 text-mut"}`}>
              {d.analysisType === "Final" ? "ANÁLISE FINAL" : "PREVIEW"}
            </span>
          )}
        </div>

        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex flex-col items-center gap-1 min-w-0">
            <Crest src={d.home.logoUrl ?? undefined} size={40} alt={d.home.name} />
            <span className="text-[12px] font-bold text-center leading-tight line-clamp-2">{d.home.name}</span>
            {d.home.tablePosition != null && <span className="text-[9px] font-bold text-mut">{d.home.tablePosition}º colocado</span>}
          </div>
          <div className="text-center px-1">
            {mostraPlacar ? (
              <p className="font-display font-bold text-2xl leading-none tabular-nums">
                {d.homeScore} <span className="text-mut">-</span> {d.awayScore}
              </p>
            ) : (
              <p className="font-display font-bold text-lg leading-none tabular-nums">{quando(d.kickoff).split(" ").pop()}</p>
            )}
            <p className="text-[9px] font-bold text-mut mt-1 uppercase tracking-wide">
              {aoVivo ? "AO VIVO" : encerrado ? "ENCERRADO" : quando(d.kickoff)}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 min-w-0">
            <Crest src={d.away.logoUrl ?? undefined} size={40} alt={d.away.name} />
            <span className="text-[12px] font-bold text-center leading-tight line-clamp-2">{d.away.name}</span>
            {d.away.tablePosition != null && <span className="text-[9px] font-bold text-mut">{d.away.tablePosition}º colocado</span>}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-mut">
          {d.venueName && (
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin size={11} /> {d.venueName}
            </span>
          )}
          {d.roundName && (
            <span className="inline-flex items-center gap-1 truncate">
              <Clock size={11} /> {d.roundName}
            </span>
          )}
        </div>
      </div>

      {/* 1X2 do modelo */}
      <div className="mt-3">
        <Secao icon={<Target size={13} />} title="Probabilidade do modelo (1X2)" right={d.confidence != null ? `confiança ${d.confidence}%` : undefined}>
          <div className="rounded-xl border border-line bg-panel p-3">
            {p ? (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="font-display font-bold text-xl leading-none text-home tabular-nums">{pct(p.home)}</p>
                    <p className="text-[10px] font-bold text-mut mt-1 truncate">{d.home.name}</p>
                  </div>
                  <div>
                    <p className="font-display font-bold text-xl leading-none text-mut tabular-nums">{pct(p.draw)}</p>
                    <p className="text-[10px] font-bold text-mut mt-1">Empate</p>
                  </div>
                  <div>
                    <p className="font-display font-bold text-xl leading-none text-away tabular-nums">{pct(p.away)}</p>
                    <p className="text-[10px] font-bold text-mut mt-1 truncate">{d.away.name}</p>
                  </div>
                </div>
                <div className="mt-2 flex h-2 rounded-full overflow-hidden bg-panel2">
                  <div className="bg-home" style={{ width: `${p.home * 100}%` }} />
                  <div className="bg-mut/40" style={{ width: `${p.draw * 100}%` }} />
                  <div className="bg-away" style={{ width: `${p.away * 100}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-bold text-mut">
                  <span>xG casa {d.xg ? d.xg.home.toFixed(2) : "—"}</span>
                  <span className="text-center">Total {d.expectedGoals != null ? d.expectedGoals.toFixed(2) : "—"}</span>
                  <span className="text-right">xG fora {d.xg ? d.xg.away.toFixed(2) : "—"}</span>
                </div>
                {d.xgSource && (
                  <p className="mt-1.5 text-center">
                    <span
                      title={
                        d.xgSource === "real"
                          ? "xG publicado pelo fornecedor para estes times."
                          : "xG calculado pelo modelo Poisson/Dixon-Coles a partir dos últimos jogos — não é dado oficial."
                      }
                      className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wide ${
                        d.xgSource === "real" ? "bg-acc/15 text-acc" : "bg-warn/15 text-warn"
                      }`}
                    >
                      {d.xgSource === "real" ? "xG Real" : "xG Estimado"}
                    </span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-mut py-2 text-center">
                Este jogo ainda não tem análise publicada. O modelo precisa do histórico recente dos dois times para
                calcular o 1X2.
              </p>
            )}
          </div>
        </Secao>
      </div>

      {/* forma recente real, antes dos placares */}
      <Secao
        icon={<Activity size={13} />}
        title="Veredito estatístico · forma recente"
        right={d.forma ? "mais recente →" : undefined}
      >
        <div className="rounded-xl border border-line bg-panel p-3">
          {d.forma ? (
            <>
              <FormaTime nome={d.home.name} forma={d.forma.home} jogos={d.forma.homeJogos} lado="home" />
              <FormaTime nome={d.away.name} forma={d.forma.away} jogos={d.forma.awayJogos} lado="away" />
              <p className="text-[9px] text-mut mt-1.5 leading-snug">
                Últimos 10 jogos encerrados antes deste confronto, do mais recente para o mais antigo. V = vitória, E = empate, D = derrota.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-mut py-2 text-center leading-snug">
              Ainda não há jogos encerrados no banco para montar a forma recente destes times. Preferimos não estimar.
            </p>
          )}
        </div>
      </Secao>

      {/* Fatores de xG — o que o motor empurrou para cima/baixo, em % */}
      <Secao icon={<Flame size={13} />} title="Fatores de xG" right={d.xgSource === "real" ? "xG real" : d.xgSource === "estimado" ? "xG estimado" : undefined}>
        <FatoresXg home={d.home} away={d.away} xg={d.xg} fatores={d.xgFactors} />
      </Secao>

      {/* Padrões estatísticos — cache do motor sobre os últimos jogos */}
      <Secao icon={<TrendingUp size={13} />} title="Padrões estatísticos" right={d.labInsights.length ? `${d.labInsights.length} padrões` : undefined}>
        <PadroesEstatisticos padroes={d.labInsights} />
      </Secao>

      {/* Top 5 placares exatos */}
      <Secao icon={<BarChart3 size={13} />} title="Top 5 placares exatos" right="Poisson / Dixon-Coles">
        <div className="rounded-xl border border-line bg-panel p-3">
          {d.topScores.length ? (
            <div className="space-y-1.5">
              {d.topScores.map((s) => (
                <div key={`${s.home}-${s.away}`} className="flex items-center gap-2">
                  <span className="font-display font-bold text-sm tabular-nums w-10 shrink-0">
                    {s.home}-{s.away}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-panel2 overflow-hidden">
                    <div
                      className="h-full bg-acc"
                      style={{ width: `${maiorPlacar > 0 ? Math.max(4, (s.probability / maiorPlacar) * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-ink tabular-nums w-11 text-right shrink-0">{pct(s.probability, 1)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-mut py-2 text-center">Sem placares calculados: gere a análise do jogo para ver os 5 mais prováveis.</p>
          )}
        </div>
      </Secao>

      {/* outros mercados */}
      {(btts || over25 || under25) && (
        <Secao icon={<Target size={13} />} title="Outros mercados">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Ambas marcam", v: btts?.probability },
              { label: "Over 2.5", v: over25?.probability },
              { label: "Under 2.5", v: under25?.probability },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-line bg-panel p-2 text-center">
                <p className="font-display font-bold text-base tabular-nums">{m.v != null ? pct(m.v) : "—"}</p>
                <p className="text-[9px] font-bold text-mut uppercase tracking-wide mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>
        </Secao>
      )}

      {/* tag de valor: só com odd real */}
      {d.value && d.hasOdds && (
        <Secao icon={<Target size={13} />} title="Valor encontrado" right={d.value.isHotPick ? "HOT PICK" : undefined}>
          <div className="rounded-xl border border-acc/40 bg-acc/10 p-3 flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">
                {nomeSelecao(d.value.selection, d)} · {d.value.market}
              </p>
              <p className="text-[10px] text-mut">
                Probabilidade {pct(d.value.probability, 1)} · break-even @{(1 / d.value.probability).toFixed(2)}
              </p>
            </div>
            <div className="ml-auto text-right shrink-0">
              <p className="font-display font-bold text-lg leading-none text-acc tabular-nums">@{d.value.odds.toFixed(2)}</p>
              <p className="text-[10px] font-bold text-acc">+{(d.value.value * 100).toFixed(1)}% EV</p>
            </div>
          </div>
        </Secao>
      )}

      {/* Odds multi-casa: preço de cada casa + melhor preço e lucro potencial */}
      <Secao
        icon={<Coins size={13} />}
        title="Odds multi-casa"
        right={d.oddsMultiCasa.length ? "dados do cache" : undefined}
      >
        <OddsMultiCasa comparativos={d.oddsMultiCasa} home={d.home.name} away={d.away.name} />
      </Secao>

      {/* confronto direto */}
      <Secao icon={<GitCompareArrows size={13} />} title="Confronto direto" right={d.h2h ? `${d.h2h.matches} jogos` : undefined}>
        <div className="rounded-xl border border-line bg-panel p-3">
          {d.h2h ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="font-display font-bold text-lg leading-none text-home tabular-nums">{d.h2h.homeWins}</p>
                  <p className="text-[9px] font-bold text-mut mt-1 truncate">Vitórias {d.home.name}</p>
                </div>
                <div>
                  <p className="font-display font-bold text-lg leading-none text-mut tabular-nums">{d.h2h.draws}</p>
                  <p className="text-[9px] font-bold text-mut mt-1">Empates</p>
                </div>
                <div>
                  <p className="font-display font-bold text-lg leading-none text-away tabular-nums">{d.h2h.awayWins}</p>
                  <p className="text-[9px] font-bold text-mut mt-1 truncate">Vitórias {d.away.name}</p>
                </div>
              </div>
              {d.h2h.avgTotalGoals != null && (
                <p className="text-[10px] text-mut text-center mt-2">Média de {d.h2h.avgTotalGoals.toFixed(2)} gols por jogo no H2H</p>
              )}
              {d.h2h.recent.length > 0 && (
                <div className="mt-2 divide-y divide-line">
                  {d.h2h.recent.map((m, i) => (
                    <div key={`${m.date ?? "s"}-${i}`} className="flex items-center gap-2 py-1.5 text-[11px]">
                      <span className="text-mut tabular-nums w-14 shrink-0">{m.date ? String(m.date).slice(0, 10) : "—"}</span>
                      <span className="truncate">{m.home}</span>
                      <span className="ml-auto font-bold tabular-nums shrink-0 px-1">
                        {m.homeScore ?? "-"} - {m.awayScore ?? "-"}
                      </span>
                      <span className="truncate text-right">{m.away}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-mut py-2 text-center">Nenhum fornecedor trouxe o histórico do confronto para este jogo.</p>
          )}
        </div>
      </Secao>

      {/* top jogadores por mercado — scout individual */}
      <Secao icon={<Users size={13} />} title="Top jogadores por mercado" right="dados reais">
        <DestaquesConfronto fixtureId={d.id} home={d.home.name} away={d.away.name} />
      </Secao>

      {/* estatísticas do confronto */}
      <Secao icon={<BarChart3 size={13} />} title="Estatísticas" right={d.contextSource ? `fonte ${d.contextSource}` : undefined}>
        <div className="rounded-xl border border-line bg-panel p-3">
          {d.stats && Object.keys(d.stats).length ? (
            <div className="divide-y divide-line">
              {Object.entries(d.stats)
                .slice(0, 14)
                .map(([label, v]) => (
                  <StatCompareRow key={label} label={label} home={v.home} away={v.away} />
                ))}
            </div>
          ) : (
            <p className="text-[11px] text-mut py-2 text-center">
              Estatísticas de partida só existem depois do apito final — ou quando o fornecedor publica pré-jogo.
            </p>
          )}
        </div>
      </Secao>

      {/* fatores do modelo */}
      {(d.keyFactors.length > 0 || d.riskFactors.length > 0) && (
        <Secao icon={<Info size={13} />} title="Leitura do modelo">
          <div className="rounded-xl border border-line bg-panel p-3">
            {d.keyFactors.length > 0 && (
              <ul className="text-[11px] text-ink space-y-1">
                {d.keyFactors.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span className="text-acc shrink-0">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
            {d.riskFactors.length > 0 && (
              <ul className="text-[11px] text-mut space-y-1 mt-2 pt-2 border-t border-line">
                {d.riskFactors.map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span className="text-warn shrink-0">!</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Secao>
      )}

      {d.analysisText && (
        <Secao icon={<Info size={13} />} title="Análise">
          <div className="rounded-xl border border-line bg-panel p-3 text-[12px] leading-relaxed whitespace-pre-line">{d.analysisText}</div>
        </Secao>
      )}

      <p className="mt-3 text-[10px] text-mut leading-relaxed">
        Placar exato é a maior probabilidade da matriz de Poisson, não uma previsão garantida. Sem odd publicada não há
        tag de valor: a tela nunca inventa mercado. +18 · jogue com responsabilidade.
      </p>
    </div>
  );
}
