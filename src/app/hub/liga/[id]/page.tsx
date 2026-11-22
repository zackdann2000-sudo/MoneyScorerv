import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarClock, ChevronRight, Goal, History, Info, Shield, Table2, TrendingUp } from "lucide-react";
import TabelaClassificacao from "@/components/hub/TabelaClassificacao";
import { Crest } from "@/components/ui";
import { dadosDaCompeticao, type Artilheiro, type JogoResumo, type MediasLiga } from "@/lib/hub/competicao";
import { zonasDaLiga } from "@/lib/hub/zonas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Competição | GreenScore",
  description: "Página central da competição: classificação, artilharia, próximos jogos, últimos resultados e médias de gols e cartões.",
};

type Props = { params: Promise<{ id: string }> };

const dia = (d: Date) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(d);
  } catch {
    return "";
  }
};

const hora = (d: Date) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return "--:--";
  }
};

const AO_VIVO = new Set(["INPLAY_1ST_HALF", "HT", "INPLAY_2ND_HALF", "ET", "PEN_LIVE"]);

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const num = (v: number | null, casas = 2) => (v == null ? "—" : v.toFixed(casas).replace(".", ","));

function JogoLinha({ j, mostraPlacar }: { j: JogoResumo; mostraPlacar: boolean }) {
  const aoVivo = AO_VIVO.has(j.liveState);
  return (
    <Link href={`/hub/${j.id}`} className="block px-2.5 py-2 border-t border-line/60 first:border-t-0 hover:bg-panel2/50">
      <div className="flex items-center gap-1.5 text-[9px] font-bold text-mut">
        <span className="tabular-nums">{dia(j.kickoff)}</span>
        {!mostraPlacar && <span className="tabular-nums">{hora(j.kickoff)}</span>}
        {j.roundName && <span className="truncate">· {j.roundName}</span>}
        {aoVivo && <span className="ml-1 px-1.5 rounded-full bg-live text-white text-[9px] font-extrabold">AO VIVO</span>}
        {j.liveState === "POSTPONED" && <span className="ml-1 px-1.5 rounded-full bg-warn text-black text-[9px] font-extrabold">ADIADO</span>}
        <ChevronRight size={11} className="ml-auto shrink-0" />
      </div>
      <div className="mt-1 flex items-center gap-1.5 min-w-0">
        <Crest src={j.homeLogo ?? undefined} size={16} alt={j.homeName} />
        <span className="text-[11px] font-bold truncate">{j.homeName}</span>
        {mostraPlacar && (
          <span className="ml-auto font-display font-bold text-[12px] tabular-nums shrink-0">
            {j.homeScore} <span className="text-mut">-</span> {j.awayScore}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 min-w-0">
        <Crest src={j.awayLogo ?? undefined} size={16} alt={j.awayName} />
        <span className="text-[11px] font-bold truncate">{j.awayName}</span>
      </div>
    </Link>
  );
}

function BlocoJogos({ titulo, icone, jogos, mostraPlacar, vazio }: {
  titulo: string;
  icone: React.ReactNode;
  jogos: JogoResumo[];
  mostraPlacar: boolean;
  vazio: string;
}) {
  return (
    <section>
      <h2 className="font-display font-bold text-[12px] uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
        {icone} {titulo}
      </h2>
      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        {jogos.length === 0 ? (
          <p className="px-2.5 py-3 text-[11px] text-mut">{vazio}</p>
        ) : (
          jogos.map((j) => <JogoLinha key={j.id} j={j} mostraPlacar={mostraPlacar} />)
        )}
      </div>
    </section>
  );
}

function Artilharia({ lista }: { lista: Artilheiro[] }) {
  const max = lista[0]?.goals ?? 0;
  return (
    <section>
      <h2 className="font-display font-bold text-[12px] uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
        <Goal size={13} className="text-acc" /> Artilharia
      </h2>
      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        {lista.length === 0 ? (
          <p className="px-2.5 py-3 text-[11px] text-mut leading-snug">
            Nenhum gol de jogador gravado nesta temporada. A artilharia só aparece depois que o job de estatísticas de
            jogador rodar — esta tela não inventa posição por estimativa.
          </p>
        ) : (
          lista.map((a, i) => (
            <div key={a.playerId} className="flex items-center gap-2 px-2.5 py-1.5 border-t border-line/60 first:border-t-0">
              <span className="w-4 text-center font-display font-bold text-[11px] text-mut">{i + 1}</span>
              <Crest src={a.teamLogo ?? undefined} size={16} alt={a.teamName ?? ""} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold truncate">{a.playerName}</p>
                <p className="text-[9px] text-mut truncate">
                  {a.teamName ?? "sem clube"} · {a.assists} assist. · {a.appearances} jogos
                </p>
              </div>
              {/* Barra proporcional ao líder: dá leitura imediata da diferença. */}
              <div className="w-12 h-1 rounded-full bg-panel2 overflow-hidden shrink-0">
                <div className="h-full bg-acc" style={{ width: `${max > 0 ? (a.goals / max) * 100 : 0}%` }} />
              </div>
              <span className="font-display font-bold text-[13px] tabular-nums w-5 text-right">{a.goals}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Medias({ m, jogos }: { m: MediasLiga; jogos: number }) {
  const itens: Array<[string, string, string]> = [
    ["Gols/jogo", num(m.golsPorJogo), "média da liga"],
    ["Casa", num(m.golsCasaPorJogo), "gols do mandante"],
    ["Fora", num(m.golsForaPorJogo), "gols do visitante"],
    ["Over 2,5", pct(m.over25Pct), "jogos com 3+ gols"],
    ["Ambas marcam", pct(m.bttsPct), "BTTS"],
    ["Amarelos/jogo", num(m.amarelosPorJogo), m.amarelosPorJogo == null ? "não coletado" : `${m.amostraCartoes} jogos`],
    ["Vermelhos/jogo", num(m.vermelhosPorJogo), "expulsões"],
    ["Base", String(jogos), "jogos encerrados"],
  ];

  return (
    <section>
      <h2 className="font-display font-bold text-[12px] uppercase tracking-wide flex items-center gap-1.5 mb-1.5">
        <TrendingUp size={13} className="text-acc" /> Médias da competição
      </h2>
      {jogos === 0 ? (
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[11px] text-mut leading-snug">
            Nenhum jogo encerrado gravado nesta competição — sem placar não existe média. Nada aqui é estimado a partir de
            odds.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {itens.map(([k, v, sub]) => (
            <div key={k} className="rounded-lg border border-line bg-panel px-2 py-1.5 min-w-0">
              <p className="text-[9px] font-extrabold tracking-wider text-mut truncate">{k.toUpperCase()}</p>
              <p className="font-display font-bold text-[16px] leading-tight tabular-nums">{v}</p>
              <p className="text-[9px] text-mut truncate">{sub}</p>
            </div>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-mut leading-relaxed">
        Gols, over e BTTS saem do placar das partidas encerradas. Amarelos vêm do resumo da partida (ESPN/Bzzoiro) e são
        contados só nos jogos em que o fornecedor mandou cartão; vermelhos vêm da própria ficha do jogo.
      </p>
    </section>
  );
}

export default async function LigaPage({ params }: Props) {
  const { id } = await params;

  /* Erro de banco ≠ competição inexistente. 404 só quando a leitura deu certo
     e mesmo assim não achou a liga; falha de leitura vira aviso na tela. */
  let dados: Awaited<ReturnType<typeof dadosDaCompeticao>> = null;
  let erro: string | null = null;
  try {
    dados = await dadosDaCompeticao(decodeURIComponent(id));
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  if (!dados && !erro) notFound();

  if (!dados) {
    return (
      <div>
        <h1 className="font-display font-bold text-[20px]">Competição</h1>
        <div className="mt-2 rounded-xl border border-danger/40 bg-danger/10 p-3">
          <p className="text-[11px] leading-snug">
            <span className="font-bold text-danger">Falha ao ler a competição.</span> {erro}
          </p>
        </div>
      </div>
    );
  }

  const { liga, classificacao, artilharia, proximos, ultimos, medias, totalJogosEncerrados } = dados;
  const top5 = classificacao?.rows.slice(0, 5) ?? [];
  const zonas = top5.length ? zonasDaLiga({ codigo: liga.externalRef, nome: liga.name, slug: liga.slug, fase: classificacao?.stageName, totalTimes: top5.length, isCup: liga.isCup }) : [];
  const tabelaHref = `/hub/classificacao?league=${encodeURIComponent(liga.externalRef || liga.id)}`;

  return (
    <div>
      {/* ── Cabeçalho ── */}
      <div className="flex items-start gap-2">
        {liga.logoUrl ? (
          <Crest src={liga.logoUrl} size={28} alt={liga.name} />
        ) : (
          <Shield size={20} className="text-acc mt-1.5 shrink-0" />
        )}
        <div className="min-w-0">
          <h1 className="font-display font-bold text-[20px] leading-tight truncate">{liga.name}</h1>
          <p className="text-[11px] text-mut">
            {[liga.countryName, classificacao?.seasonKey ? `temporada ${classificacao.seasonKey}` : null, liga.isCup ? "copa" : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Link href="/hub" className="ml-auto text-[11px] font-bold text-acc shrink-0 self-center inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Hub
        </Link>
      </div>

      <div className="mt-3 space-y-4">
        {/* ── Top 5 ── */}
        <section>
          <div className="flex items-center gap-2 mb-1.5">
            <h2 className="font-display font-bold text-[12px] uppercase tracking-wide flex items-center gap-1.5">
              <Table2 size={13} className="text-acc" /> Top 5
            </h2>
            <Link href={tabelaHref} className="ml-auto text-[10px] font-bold text-acc inline-flex items-center gap-1">
              Tabela completa <ChevronRight size={11} />
            </Link>
          </div>
          {top5.length > 0 ? (
            <TabelaClassificacao rows={top5} zonas={zonas} />
          ) : (
            <div className="rounded-xl border border-line bg-panel p-3">
              <p className="text-[11px] text-mut leading-snug">
                {liga.isCup
                  ? "Competição de mata-mata: não há tabela de pontos. Os jogos ficam abaixo."
                  : "Sem classificação gravada para esta competição. O job de classificação ainda não escreveu o retrato."}
              </p>
            </div>
          )}
        </section>

        {/* ── Jogos ── */}
        <div className="grid sm:grid-cols-2 gap-4">
          <BlocoJogos
            titulo="Próximos jogos"
            icone={<CalendarClock size={13} className="text-acc" />}
            jogos={proximos}
            mostraPlacar={false}
            vazio="Nenhum jogo agendado no banco para esta competição."
          />
          <BlocoJogos
            titulo="Últimos resultados"
            icone={<History size={13} className="text-acc" />}
            jogos={ultimos}
            mostraPlacar
            vazio="Nenhum jogo encerrado gravado ainda."
          />
        </div>

        {/* ── Artilharia ── */}
        <Artilharia lista={artilharia} />

        {/* ── Médias ── */}
        <Medias m={medias} jogos={totalJogosEncerrados} />

        {/* ── Rodapé de método ── */}
        <div className="rounded-xl border border-line bg-panel2/50 p-2.5">
          <p className="text-[10px] font-extrabold tracking-wide text-mut flex items-center gap-1">
            <Info size={11} /> DE ONDE VEM CADA NÚMERO
          </p>
          <ul className="mt-1 space-y-0.5 text-[10px] text-mut leading-snug">
            <li>• Classificação: retrato gravado no banco, ordem recalculada pela regra de desempate da competição.</li>
            <li>• Jogos: fixtures sincronizadas; placar só aparece depois do encerramento.</li>
            <li>• Artilharia: estatística de jogador na temporada, quando coletada.</li>
            <li>• Médias: calculadas apenas sobre jogos encerrados desta competição.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
