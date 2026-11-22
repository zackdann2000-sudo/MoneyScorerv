import Link from "next/link";
import { ChevronRight, CalendarDays, FlaskConical, Info, TriangleAlert } from "lucide-react";
import { Crest } from "@/components/ui";
import { hubGames, type HubGame, type HubLeagueGroup, type HubProbabilities } from "@/lib/hub/queries";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Centro de Jogos | GreenScore",
  description: "Jogos por liga com a probabilidade 1X2 do modelo, odd de referência e tag de valor só quando existe mercado.",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

const hora = (d: Date) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
  } catch {
    return "--:--";
  }
};

const dia = (d: Date) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(d);
  } catch {
    return "";
  }
};

const AO_VIVO = new Set(["INPLAY_1ST_HALF", "HT", "INPLAY_2ND_HALF", "ET", "PEN_LIVE"]);

function situacao(liveState: string) {
  if (liveState === "FT" || liveState === "AET") return "Encerrado";
  if (liveState === "POSTPONED") return "Adiado";
  if (AO_VIVO.has(liveState)) return "Ao vivo";
  return null;
}

function Barra1X2({ p }: { p: HubProbabilities }) {
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-panel2">
        <div className="bg-home transition-all" style={{ width: `${p.home * 100}%` }} />
        <div className="bg-mut/40 transition-all" style={{ width: `${p.draw * 100}%` }} />
        <div className="bg-away transition-all" style={{ width: `${p.away * 100}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-extrabold tracking-wide">
        <span className="text-home">1 {pct(p.home)}</span>
        <span className="text-mut">X {pct(p.draw)}</span>
        <span className="text-away">2 {pct(p.away)}</span>
      </div>
    </div>
  );
}

function TimeLinha({ name, logoUrl, posicao, gols, mostraPlacar }: {
  name: string;
  logoUrl: string | null;
  posicao: number | null;
  gols: number;
  mostraPlacar: boolean;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Crest src={logoUrl ?? undefined} size={22} alt={name} />
      <span className="text-sm font-bold truncate">{name}</span>
      {posicao != null && <span className="text-[10px] font-bold text-mut shrink-0">{posicao}º</span>}
      {mostraPlacar && <span className="ml-auto font-display font-bold text-base tabular-nums shrink-0">{gols}</span>}
    </div>
  );
}

function GameCard({ g }: { g: HubGame }) {
  const marca = situacao(g.liveState);
  const mostraPlacar = marca === "Ao vivo" || marca === "Encerrado";
  const p = g.probabilities;
  const topo = p ? Math.max(p.home, p.draw, p.away) : null;

  return (
    <Link
      href={`/hub/${g.id}`}
      className="block bg-panel border border-line rounded-xl p-3 hover:border-acc/60 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-mut">
        <span className="tabular-nums">{hora(g.kickoff)}</span>
        <span>·</span>
        <span className="tabular-nums">{dia(g.kickoff)}</span>
        {g.roundName && <span className="truncate">· {g.roundName}</span>}
        {marca && (
          <span
            className={`ml-1 px-1.5 rounded-full text-[9px] font-extrabold ${
              marca === "Ao vivo" ? "bg-live text-white" : marca === "Adiado" ? "bg-warn text-black" : "bg-panel2 text-mut"
            }`}
          >
            {marca === "Ao vivo" && <span className="live-dot inline-block w-1.5 h-1.5 rounded-full bg-white mr-1 align-middle" />}
            {marca}
          </span>
        )}
        {g.league.isExperimental && (
          <span className="px-1.5 rounded-full bg-warn/15 text-warn text-[9px] font-extrabold">EXPERIMENTAL</span>
        )}
        <ChevronRight size={12} className="ml-auto shrink-0" />
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center">
        <div className="min-w-0 space-y-1">
          <TimeLinha name={g.home.name} logoUrl={g.home.logoUrl} posicao={g.home.tablePosition} gols={g.homeScore} mostraPlacar={mostraPlacar} />
          <TimeLinha name={g.away.name} logoUrl={g.away.logoUrl} posicao={g.away.tablePosition} gols={g.awayScore} mostraPlacar={mostraPlacar} />
        </div>

        <div className="text-right shrink-0">
          {topo != null ? (
            <>
              <p className="font-display font-bold text-lg leading-none text-acc tabular-nums">{pct(topo)}</p>
              <p className="text-[9px] font-bold text-mut tracking-wide">MODELO</p>
            </>
          ) : (
            <p className="text-[10px] font-bold text-mut max-w-16">Sem análise</p>
          )}
        </div>
      </div>

      <div className="mt-2">
        {p ? (
          <Barra1X2 p={p} />
        ) : (
          <p className="text-[10px] text-mut">Probabilidade aparece assim que o modelo publicar a análise deste jogo.</p>
        )}
      </div>

      {/* Tag de valor: SÓ com odd real. Sem mercado, o bloco não existe. */}
      {g.value && g.hasOdds && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span
            className={`px-2 h-6 inline-flex items-center rounded-full text-[10px] font-extrabold ${
              g.value.isHotPick ? "bg-live text-white" : "bg-acc/15 text-acc border border-acc/40"
            }`}
          >
            VALOR {g.value.value > 0 ? "+" : ""}
            {(g.value.value * 100).toFixed(1)}%
          </span>
          <span className="text-[11px] font-bold text-ink tabular-nums">@{g.value.odds.toFixed(2)}</span>
          <span className="text-[10px] text-mut">
            {g.value.selection === "Home" ? g.home.name : g.value.selection === "Away" ? g.away.name : "Empate"} · {g.value.market}
          </span>
        </div>
      )}
    </Link>
  );
}

function LigaBloco({ grupo }: { grupo: HubLeagueGroup }) {
  return (
    <section className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-0.5">
        {/* O nome da liga é o caminho para a página central da competição. */}
        <Link
          href={`/hub/liga/${grupo.id}`}
          className="flex items-center gap-1 min-w-0 group hover:text-acc transition-colors"
        >
          <h2 className="font-display font-bold text-sm uppercase tracking-wide truncate">{grupo.name}</h2>
          <ChevronRight size={13} className="shrink-0 text-mut group-hover:text-acc" />
        </Link>
        {grupo.country && <span className="text-[10px] font-bold text-mut shrink-0">{grupo.country}</span>}
        {grupo.isExperimental && <FlaskConical size={12} className="text-warn shrink-0" aria-label="Liga experimental" />}
        <span className="ml-auto text-[10px] font-bold text-mut shrink-0">{grupo.games.length} jogo{grupo.games.length > 1 ? "s" : ""}</span>
      </div>
      <div className="space-y-2">
        {grupo.games.map((g) => (
          <GameCard key={g.id} g={g} />
        ))}
      </div>
    </section>
  );
}

export default async function HubPage() {
  const { groups, demo, total, notice } = await hubGames(3);
  const ligas = groups.length;

  return (
    <div>
      <div className="flex items-start gap-2 mb-1">
        <CalendarDays size={20} className="text-acc mt-1 shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display font-bold text-[22px] leading-tight">Centro de Jogos</h1>
          <p className="text-[11px] text-mut">
            {total} jogo{total === 1 ? "" : "s"} em {ligas} liga{ligas === 1 ? "" : "s"} · próximas 72h
          </p>
        </div>
        <Link href="/hub/classificacao" className="ml-auto text-[11px] font-bold text-acc shrink-0 self-center">
          Classificação
        </Link>
        <Link href="/ev" className="text-[11px] font-bold text-acc shrink-0 self-center">
          +EV
        </Link>
      </div>

      {demo && (
        <div className="mb-3 rounded-xl border border-warn/40 bg-warn/10 p-2.5 flex gap-2">
          <TriangleAlert size={14} className="text-warn mt-0.5 shrink-0" />
          <p className="text-[11px] text-ink leading-snug">
            <span className="font-bold text-warn">Modo demonstração.</span>{" "}
            {notice ?? "Sem jogos no banco no momento: os cards abaixo usam xG fixos e o mesmo motor Poisson."}{" "}
            Nenhuma odd aqui é real — a tag de valor só aparece quando o jogo tem mercado.
          </p>
        </div>
      )}

      {groups.length === 0 && (
        <div className="rounded-xl border border-line bg-panel p-6 text-center">
          <Info size={22} className="mx-auto text-mut mb-2" />
          <p className="font-display font-bold">Nenhum jogo na janela</p>
          <p className="text-[11px] text-mut mt-1">
            Rode a sincronização do Hub para trazer as partidas das próximas 72 horas.
          </p>
        </div>
      )}

      {groups.map((grupo) => (
        <LigaBloco key={grupo.id} grupo={grupo} />
      ))}

      <p className="mt-4 text-[10px] text-mut leading-relaxed">
        Probabilidade = modelo Poisson/Dixon-Coles alimentado pelo histórico real de cada time. Odd = melhor cotação
        disponível entre Sportmonks, Bzzoiro e ESPN. Sem odd publicada, o card mostra só probabilidade e nenhuma tag de
        valor. Toque em um jogo para ver os 5 placares mais prováveis e as estatísticas do confronto.
      </p>
    </div>
  );
}
