import Link from "next/link";
import { leagueInfo } from "@/lib/espn";
import { analisarOportunidades, type AnaliseJogo } from "@/lib/opportunitiesEngine";
import { stakeSugerida } from "@/lib/valueBet";
import { FaixaTag, OddJustaLinha, SeloAcertos, TrustNota } from "@/components/FaixaRisco";
import { evCor } from "@/components/ValorEsperado";
import DesempenhoHistorico from "@/components/DesempenhoHistorico";
import { estatisticas, type TrackStats, anotarAcertosRecentes } from "@/lib/trackRecord";
import FiltrosLinks from "@/components/FiltrosLinks";
import { contarPorChip, passaChip, passaPiso, type ChipRapido } from "@/lib/oportunidadeFiltros";

/* MVP inspirado no Forebet (recon em replica/forebet/recon.md).
   O Forebet é conhecido por uma TABELA densa de palpites: por jogo, a
   probabilidade 1X2, o resultado previsto (com placar exato), média de gols e
   Over 2.5. Aqui reproduzimos esse formato com o nosso motor Poisson/Dixon-
   Coles (forma recente + H2H). Nada copiado do original. */

export const revalidate = 600;

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function hojeSP(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
function shiftDia(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
function rotuloDia(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${DIAS[dt.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}
function horaSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Resultado previsto (0=casa, 1=empate, 2=fora) a partir das probabilidades. */
function previsto(p: { home: number; draw: number; away: number }): 0 | 1 | 2 {
  return p.home >= p.draw && p.home >= p.away ? 0 : p.away >= p.draw ? 2 : 1;
}

function Celula({ valor, on, cor }: { valor: string; on: boolean; cor: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-9 h-6 rounded text-[10px] font-extrabold tabular-nums ${
        on ? `${cor} text-black/90` : "text-mut"
      }`}
    >
      {valor}
    </span>
  );
}

const CHIPS_VALIDOS: ChipRapido[] = ["elite", "altoEv", "favoritos", "bombas"];

/** O "probModelo" de uma linha da tabela é a probabilidade do palpite mostrado. */
function probDaLinha(j: AnaliseJogo): number {
  return Math.max(j.probs.home, j.probs.draw, j.probs.away);
}

/** Melhor oportunidade da linha (a que tem EV e TRUST para os chips). */
function melhorOportunidade(j: AnaliseJogo) {
  if (!j.oportunidades?.length) return null;
  return j.oportunidades.reduce((a, b) => (b.valor > a.valor ? b : a));
}

export default async function ForebetPage({
  searchParams,
}: {
  searchParams?: Promise<{ data?: string; min?: string; chip?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const data = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : hojeSP();
  const mostrarAbaixoDe70 = sp.min === "1";
  const chipsAtivos = (sp.chip ? sp.chip.split(",") : []).filter((c): c is ChipRapido =>
    (CHIPS_VALIDOS as string[]).includes(c),
  );

  let jogos: AnaliseJogo[] = [];
  let erro = "";
  try {
    const r = await analisarOportunidades({ date: data, maxMatches: 12, usarApiFootball: false });
    jogos = r.analisados;
    // Selo de acertos recentes em todos os picks da tabela (uma consulta só).
    await anotarAcertosRecentes(r.oportunidades).catch(() => {});
  } catch (e: any) {
    erro = e?.message || "Não foi possível carregar os palpites agora.";
  }

  let stats: TrackStats | null = null;
  try {
    stats = await estatisticas();
  } catch {
    stats = null;
  }

  /* Piso de 70% + chips (a tabela é renderizada no servidor, então vem da URL).
     As linhas filtradas são o que a tabela mostra; os contadores usam `jogos`. */
  const linhas = jogos.filter((j) => {
    const prob = probDaLinha(j);
    if (!passaPiso({ probModelo: prob, evPct: 0, trust: 0, odd: 0 }, mostrarAbaixoDe70)) return false;
    if (!chipsAtivos.length) return true;
    const best = melhorOportunidade(j);
    if (!best) return false;
    return chipsAtivos.some((c) =>
      passaChip({ probModelo: best.probModelo, evPct: best.evPct, trust: best.trust, odd: best.odd }, c),
    );
  });
  const ocultasPeloPiso = jogos.filter(
    (j) => !passaPiso({ probModelo: probDaLinha(j), evPct: 0, trust: 0, odd: 0 }, false),
  ).length;
  const contagemChips = contarPorChip(
    jogos.map((j) => {
      const b = melhorOportunidade(j);
      return {
        probModelo: b?.probModelo ?? probDaLinha(j),
        evPct: b?.evPct ?? 0,
        trust: b?.trust ?? null,
        odd: b?.odd ?? 0,
      };
    }),
  );

  const prev = shiftDia(data, -1);
  const next = shiftDia(data, 1);

  return (
    <main className="mx-auto max-w-screen-md px-3 py-4 space-y-3">
      <header className="rounded-2xl border border-line bg-gradient-to-br from-cyan/10 via-panel to-panel p-4">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-cyan">Tabela de palpites · estilo Forebet</p>
        <h1 className="font-display text-2xl font-extrabold text-ink leading-tight mt-1">
          Palpites, probabilidades e placar previsto
        </h1>
        <p className="text-[11px] text-mut mt-1">
          1X2 em %, resultado mais provável com placar exato, média de gols e Over 2.5 — por jogo.
        </p>
        <p className="text-[9px] text-acc/90 mt-2">Modelo Poisson/Dixon-Coles · forma recente (últimos 10) + H2H</p>
      </header>

      <DesempenhoHistorico stats={stats} />

      {/* Navegação por data */}
      <div className="flex items-center gap-2">
        <Link href={`/forebet?data=${prev}`} className="h-8 px-3 rounded-xl border border-line bg-panel text-[11px] font-bold text-ink inline-flex items-center">
          ← {rotuloDia(prev)}
        </Link>
        <span className="flex-1 text-center text-[11px] font-extrabold text-ink">
          {rotuloDia(data)}
          {data === hojeSP() && <span className="ml-1 text-[9px] text-acc">hoje</span>}
        </span>
        <Link href={`/forebet?data=${next}`} className="h-8 px-3 rounded-xl border border-line bg-panel text-[11px] font-bold text-ink inline-flex items-center">
          {rotuloDia(next)} →
        </Link>
      </div>

      {erro && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-[11px] text-danger">{erro}</div>
      )}

      <FiltrosLinks
        base="/forebet"
        params={{ data }}
        visiveis={linhas.length}
        total={jogos.length}
        ocultas={ocultasPeloPiso}
        mostrarAbaixoDe70={mostrarAbaixoDe70}
        chips={chipsAtivos}
        contagem={contagemChips}
      />

      {jogos.length > 0 && linhas.length === 0 && !erro && (
        <p className="text-[11px] text-mut text-center py-6 bg-panel border border-dashed border-line rounded-xl">
          {jogos.length} jogo(s) nesta data ficaram abaixo de 70% ou fora dos chips. Use
          &quot;Mostrar &lt; 70%&quot; para ver a tabela completa.
        </p>
      )}

      {jogos.length === 0 && !erro && (
        <p className="text-[11px] text-mut text-center py-8 bg-panel border border-dashed border-line rounded-xl">
          Sem jogos com histórico suficiente nesta data.
        </p>
      )}

      {linhas.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel overflow-hidden">
          <div className="w-full max-w-full overflow-x-auto">
            <table className="w-full text-[11px] border-collapse min-w-[480px]">
              <thead>
                <tr className="text-[9px] uppercase text-mut border-b border-line">
                  <th className="text-left font-bold px-2 py-1.5">Hora</th>
                  <th className="text-left font-bold px-2 py-1.5">Jogo</th>
                  <th className="text-center font-bold px-1 py-1.5" title="Probabilidade casa">1</th>
                  <th className="text-center font-bold px-1 py-1.5" title="Probabilidade empate">X</th>
                  <th className="text-center font-bold px-1 py-1.5" title="Probabilidade fora">2</th>
                  <th className="text-center font-bold px-1 py-1.5">Placar</th>
                  <th className="text-center font-bold px-1 py-1.5">Gols</th>
                  <th className="text-center font-bold px-1 py-1.5">+2.5</th>
                  <th className="text-center font-bold px-1 py-1.5" title="Over/Under 3.5 cartões e 9.5 escanteios (Poisson, últimos 10)">Cart/Esc O/U</th>
                  <th className="text-center font-bold px-1 py-1.5" title="Valor Esperado · Stake sugerida (Kelly, teto 5%) · faixa de risco e odd justa">EV · Stake</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((j) => {
                  const pred = previsto(j.probs);
                  const mediaGols = (j.lambdaHome + j.lambdaAway).toFixed(1);
                  const placar = j.topScores?.[0]?.score ?? "—";
                  const best = j.oportunidades.length
                    ? j.oportunidades.reduce((a, b) => (b.valor > a.valor ? b : a))
                    : null;
                  const stake = best ? stakeSugerida(best.probModelo, best.odd) * 100 : 0;
                  const c35 = j.extras?.cards?.probs.find((p) => p.line === 3.5)?.over;
                  const k95 = j.extras?.corners?.probs.find((p) => p.line === 9.5)?.over;
                  return (
                    <tr key={j.matchId} className="border-b border-line/50 last:border-0 hover:bg-panel2/50">
                      <td className="px-2 py-1.5 align-top whitespace-nowrap">
                        <span className="block text-[10px] font-bold text-ink tabular-nums">{horaSP(j.kickoff)}</span>
                        <span className="block text-[8px] text-mut truncate max-w-[72px]">{j.estado.startsWith("AO VIVO") ? "AO VIVO" : leagueInfo(j.league).flag + " " + (j.country || "")}</span>                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <Link href={`/apitou?jogo=${j.matchId}&data=${data}`} className="block min-w-0 hover:text-acc">
                          <span className="block text-[11px] font-bold text-ink truncate max-w-[150px]">{j.home.name}</span>
                          <span className="block text-[11px] font-bold text-ink truncate max-w-[150px]">{j.away.name}</span>
                          <span className="block text-[8px] text-mut truncate max-w-[150px]">{leagueInfo(j.league).flag} {j.leagueName}</span>
                        </Link>
                      </td>
                      <td className="text-center px-0.5"><Celula valor={pct(j.probs.home)} on={pred === 0} cor="bg-home" /></td>
                      <td className="text-center px-0.5"><Celula valor={pct(j.probs.draw)} on={pred === 1} cor="bg-mut" /></td>
                      <td className="text-center px-0.5"><Celula valor={pct(j.probs.away)} on={pred === 2} cor="bg-away" /></td>
                      <td className="text-center px-1 py-1.5 font-extrabold text-ink tabular-nums">{placar}</td>
                      <td className="text-center px-1 py-1.5 tabular-nums whitespace-nowrap">
                        <span className="text-mut">{mediaGols}</span>
                        {j.xgHome != null && j.xgAway != null && (
                          <span
                            className="ml-1 text-[8px] font-bold text-sky-400"
                            title={`xG médio das duas equipes (ajuste pela qualidade das chances, ${Math.round(j.xgCoverage * 100)}% da janela)`}
                          >
                            xG {j.xgHome + j.xgAway} {j.xgFonte === "api-football" ? "Oficial" : "Est."}
                          </span>
                        )}
                      </td>
                      <td className="text-center px-1 py-1.5 text-acc font-bold tabular-nums">{pct(j.probs.over25)}</td>
                      <td className="text-center px-1 py-1.5 tabular-nums text-[8px] text-mut whitespace-nowrap" title={`Cartões 3.5: Over ${c35 != null ? pct(c35) : "—"} / Under ${c35 != null ? pct(1 - c35) : "—"} · Escanteios 9.5: Over ${k95 != null ? pct(k95) : "—"} / Under ${k95 != null ? pct(1 - k95) : "—"}`}>
                        {c35 == null && k95 == null ? (
                          "—"
                        ) : (
                          <span className="block leading-tight">
                            {c35 != null && (
                              <span className="block">
                                <span className="text-amber-400 font-bold">C3.5</span> O{pct(c35)} U{pct(1 - c35)}
                              </span>
                            )}
                            {k95 != null && (
                              <span className="block">
                                <span className="text-sky-400 font-bold">E9.5</span> O{pct(k95)} U{pct(1 - k95)}
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="text-center px-1 py-1.5 whitespace-nowrap">
                        {best ? (
                          <span title={`${best.rotulo} · EV ${best.evPct >= 0 ? "+" : ""}${best.evPct.toFixed(1)}% · Kelly ${stake.toFixed(1)}% da banca (teto 5%)`} className="cursor-help">
                            <span className={`font-extrabold tabular-nums ${evCor(best.evPct)}`}>{best.evPct >= 0 ? "+" : ""}{best.evPct.toFixed(0)}%</span>
                            <span className="text-mut"> · </span>
                            <span className="font-extrabold tabular-nums text-acc">{stake.toFixed(1)}%</span>
                            <span className="mt-0.5 flex items-center justify-center">
                              <FaixaTag faixa={best.faixa} compacto />
                            </span>
                            <span className="mt-0.5 flex items-center justify-center">
                              <TrustNota nota={best.trust} rotulo={best.trustRotulo} amostra={best.amostra} compacto />
                            </span>
                            {best.acertosRecentes && (
                              <span className="mt-0.5 flex items-center justify-center">
                                <SeloAcertos acertosRecentes={best.acertosRecentes} serie={best.serieRecente} />
                              </span>
                            )}
                            <OddJustaLinha odd={best.odd} oddJusta={best.oddJusta} margem={best.margemMercado} className="justify-center" />
                          </span>
                        ) : (
                          <span className="text-mut">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[8px] text-mut px-3 py-2 border-t border-line/60">
            Destaque em cor = resultado mais provável do modelo. Placar = resultado exato mais provável.
            Gols = média esperada (λ casa + λ fora), com xG mesclado 50/50 quando disponível.
            "Justa" = a odd do mercado sem a comissão da casa (de-vig). TRUST = nota de confiança
            0–10 (probabilidade + EV + amostra). Probabilidades estatísticas, não garantia.
          </p>
        </div>
      )}

      <section className="rounded-2xl border border-line bg-panel/60 p-3">
        <h2 className="text-[10px] font-extrabold uppercase tracking-wide text-ink mb-1.5">O que a tabela mostra</h2>
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">1 · X · 2</b><p className="text-[9px] text-mut">Probabilidade de casa/empate/fora. A cor marca o previsto.</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">Placar</b><p className="text-[9px] text-mut">Resultado exato mais provável (matriz de Poisson).</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">Gols</b><p className="text-[9px] text-mut">Média esperada do confronto (λ casa + λ fora).</p></div>
          <div className="bg-panel2 rounded-lg p-2"><b className="text-ink">+2.5</b><p className="text-[9px] text-mut">Probabilidade de sair mais de 2.5 gols.</p></div>
        </div>
      </section>

      <footer className="text-center text-[9px] text-mut pb-4">
        MVP de recon clean-room do Forebet · dados ESPN + motor próprio ·{" "}
        <Link href="/palpites-ia" className="text-acc">ver oportunidades de valor</Link>
      </footer>
    </main>
  );
}
