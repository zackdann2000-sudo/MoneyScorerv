import Link from "next/link";
import {
  Sparkles,
  Radar as RadarIcon,
  Scale,
  TrendingUp,
  Lock,
  ArrowRight,
  CircleDollarSign,
  Flame,
} from "lucide-react";
import { cached } from "@/lib/cache";
import { getUser } from "@/lib/auth";
import { analisarOportunidades, type AnaliseJogo, type OportunidadeValor } from "@/lib/opportunitiesEngine";
import { estatisticas } from "@/lib/trackRecord";
import { db } from "@/db";
import { valueBetHistory } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  MVP "Edge" — versão própria do fluxo do ClearEdge:                 */
/*  S03 Picks da IA  ·  S05 Radar de divergências  ·  S04 Histórico    */
/*  Tudo servido pelos motores que já existem (oportunidades + track).  */
/* ------------------------------------------------------------------ */

type Aba = "picks" | "radar" | "historico";

const hojeSP = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const pct = (v: number, casas = 0) => `${(v * 100).toFixed(casas)}%`;
const hhmm = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "--:--";
  }
};

const corConfianca = (c: string) =>
  c === "alta" ? "text-good border-good/40 bg-good/10"
    : c === "média" ? "text-warn border-warn/40 bg-warn/10"
    : "text-mut border-line bg-panel2";

export default async function EdgePage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const sp = await searchParams;
  const aba: Aba = sp.aba === "radar" ? "radar" : sp.aba === "historico" ? "historico" : "picks";

  const user = await getUser().catch(() => null);
  const isVip = !!user && (user.isAdmin || user.access.active);

  /* Cota: anônimo/free lê só cache de xG; VIP pode gastar 2 jogos. */
  const dados = await cached(`edge:v1:${hojeSP()}:${isVip ? "vip" : "free"}`, 10 * 60 * 1000, () =>
    analisarOportunidades({
      date: hojeSP(),
      maxMatches: 10,
      principais: false,
      maxXgApi: isVip ? 2 : 0,
    }).catch(() => null),
  );

  const oportunidades = [...(dados?.oportunidades ?? [])].sort((a, b) => b.evPct - a.evPct);
  const analisados = dados?.analisados ?? [];
  const stats = await estatisticas().catch(() => null);
  const recentes = await db
    .select()
    .from(valueBetHistory)
    .orderBy(desc(valueBetHistory.createdAt))
    .limit(24)
    .catch(() => []);

  const ABAS = [
    { id: "picks" as Aba, label: "Picks da IA", icon: Sparkles },
    { id: "radar" as Aba, label: "Radar de divergências", icon: RadarIcon },
    { id: "historico" as Aba, label: "Palpites (histórico)", icon: Scale },
  ];

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 space-y-4">
      {/* Cabeçalho */}
      <header className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-acc">
          <TrendingUp className="h-3.5 w-3.5" /> análise pré-jogo
        </div>
        <h1 className="mt-1 text-xl font-black text-txt">Edge — onde a linha está errada</h1>
        <p className="mt-1 text-[12px] leading-snug text-mut">
          Probabilidade do modelo × odd do mercado. Sem odd, não há pick. Tudo congelado antes do
          jogo e conferido depois — inclusive quando dá red.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
          <span className="rounded-full border border-line bg-panel2 px-2 py-0.5 text-mut">
            {analisados.length} jogos analisados
          </span>
          <span className="rounded-full border border-line bg-panel2 px-2 py-0.5 text-mut">
            {oportunidades.length} mercados com valor
          </span>
          {!isVip && (
            <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-warn">
              plano grátis: 2 picks
            </span>
          )}
        </div>
      </header>

      {/* Abas */}
      <nav className="flex gap-1 rounded-full border border-line bg-panel p-1">
        {ABAS.map((a) => {
          const Icon = a.icon;
          const on = a.id === aba;
          return (
            <Link
              key={a.id}
              href={`/edge?aba=${a.id}`}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-extrabold transition-colors ${
                on ? "bg-acc text-black" : "text-mut hover:text-txt"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{a.label}</span>
            </Link>
          );
        })}
      </nav>

      {aba === "picks" && (
        <section className="space-y-2.5">
          {oportunidades.length === 0 && (
            <Vazio
              titulo="Sem pick com valor agora"
              texto="O modelo só publica quando a probabilidade dele passa da odd do mercado. Volte mais perto do horário dos jogos."
            />
          )}
          {oportunidades.map((o, i) => {
            const bloqueado = !isVip && i >= 2;
            if (bloqueado && i > 2) return null;
            return (
              <PickCard key={`${o.matchId}-${o.chave}`} o={o} bloqueado={bloqueado} />
            );
          })}
          {!isVip && oportunidades.length > 2 && (
            <Link
              href="/planos"
              className="flex items-center justify-between rounded-2xl border border-acc/40 bg-acc/10 px-3 py-2.5 text-[12px] font-extrabold text-acc"
            >
              <span className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5" /> {oportunidades.length - 2} picks liberados no VIP
              </span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </section>
      )}

      {aba === "radar" && <RadarDivergencias analisados={analisados} />}

      {aba === "historico" && <Historico stats={stats} recentes={recentes} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PickCard({ o, bloqueado }: { o: OportunidadeValor; bloqueado: boolean }) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-mut">
            <span className="truncate">{o.leagueName}</span>
            <span className="shrink-0 text-line">·</span>
            <span className="shrink-0">{hhmm(o.kickoff)}</span>
          </div>
          <div className="mt-0.5 truncate text-[13px] font-extrabold text-txt">
            {o.home.name} <span className="text-mut">×</span> {o.away.name}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${corConfianca(o.confianca)}`}>
          {o.confianca}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-black text-acc">{o.rotulo}</div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] font-bold text-mut">
            <span>odd <b className="text-txt">{o.odd.toFixed(2)}</b></span>
            <span>modelo <b className="text-txt">{pct(o.probModelo)}</b></span>
            <span>mercado <b className="text-txt">{pct(o.probImplicita)}</b></span>
          </div>
        </div>
        <div className="shrink-0 rounded-xl border border-good/40 bg-good/10 px-2.5 py-1.5 text-center">
          <div className="text-[9px] font-black uppercase text-good/80">EV</div>
          <div className="text-sm font-black text-good">+{o.evPct.toFixed(1)}%</div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-mut">
        <CircleDollarSign className="h-3 w-3" />
        stake sugerida {(o.stake * 100).toFixed(1)}% da banca
        <span className="text-line">·</span>
        odd via {o.fonteOdd}
      </div>

      <p className="mt-1.5 border-t border-line/60 pt-1.5 text-[11px] leading-snug text-mut">{o.porque}</p>

      {bloqueado && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-panel/92 backdrop-blur-[3px]">
          <Lock className="h-4 w-4 text-acc" />
          <span className="text-[11px] font-extrabold text-txt">Pick do plano VIP</span>
          <Link href="/planos" className="rounded-full bg-acc px-3 py-1 text-[11px] font-black text-black">
            Liberar
          </Link>
        </div>
      )}
    </article>
  );
}

function RadarDivergencias({ analisados }: { analisados: AnaliseJogo[] }) {
  const linhas = analisados.flatMap((a) => {
    const o = a.odds;
    if (!o) return [];
    const pares: { rotulo: string; odd: number | null | undefined; prob: number }[] = [
      { rotulo: "Casa", odd: o.home, prob: a.probs.home },
      { rotulo: "Empate", odd: o.draw, prob: a.probs.draw },
      { rotulo: "Fora", odd: o.away, prob: a.probs.away },
      { rotulo: "Over 2.5", odd: o.over, prob: a.probs.over25 },
      { rotulo: "Under 2.5", odd: o.under, prob: a.probs.under25 },
      { rotulo: "Ambas marcam", odd: o.btts, prob: a.probs.btts },
    ];
    return pares
      .filter((p): p is { rotulo: string; odd: number; prob: number } => !!p.odd && p.odd > 1)
      .map((p) => {
        const implicita = 1 / p.odd;
        return {
          jogo: `${a.home.name} × ${a.away.name}`,
          liga: a.leagueName,
          kickoff: a.kickoff,
          rotulo: p.rotulo,
          odd: p.odd,
          prob: p.prob,
          implicita,
          dif: p.prob - implicita,
        };
      });
  });

  linhas.sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif));
  const top = linhas.slice(0, 18);

  if (!top.length) {
    return (
      <Vazio
        titulo="Sem odds para comparar"
        texto="O radar precisa da odd de mercado. Quando a fonte publica, as divergências aparecem aqui ordenadas pela diferença."
      />
    );
  }

  return (
    <section className="space-y-1.5">
      <p className="px-1 text-[11px] leading-snug text-mut">
        <b className="text-txt">Como ler:</b> a barra é a diferença entre o que o modelo acha e o que a
        odd paga. Verde = o mercado paga mais do que deveria. A odd muda; confira na casa antes.
      </p>
      {top.map((l, i) => {
        const bom = l.dif > 0;
        const largura = Math.min(100, Math.abs(l.dif) * 400);
        return (
          <div key={`${l.jogo}-${l.rotulo}-${i}`} className="rounded-xl border border-line bg-panel px-2.5 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[11px] font-bold text-mut">
                  {l.liga} · {hhmm(l.kickoff)}
                </div>
                <div className="truncate text-[12px] font-extrabold text-txt">{l.jogo}</div>
              </div>
              <div className={`shrink-0 text-right text-[12px] font-black ${bom ? "text-good" : "text-bad"}`}>
                {bom ? "+" : ""}
                {(l.dif * 100).toFixed(1)}%
                <div className="text-[9px] font-bold uppercase text-mut">{l.rotulo}</div>
              </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="w-16 shrink-0 text-[10px] font-bold text-mut">odd {l.odd.toFixed(2)}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
                <div
                  className={`h-full rounded-full ${bom ? "bg-good" : "bg-bad"}`}
                  style={{ width: `${largura}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-[10px] font-bold text-mut">
                modelo {pct(l.prob)} · odd {pct(l.implicita)}
              </span>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Historico({
  stats,
  recentes,
}: {
  stats: { total: number; greens: number; reds: number; hitRate: number | null; unidades: number; roi: number | null; pendentes: number } | null;
  recentes: { id: number; rotulo: string; homeName: string; awayName: string; odd: number; evPct: number; status: string; homeScore: number | null; awayScore: number | null; matchDate: string }[];
}) {
  if (!stats || (stats.total === 0 && stats.pendentes === 0)) {
    return (
      <Vazio
        titulo="Histórico ainda vazio"
        texto="Cada pick é gravado antes do jogo e liquidado depois. Assim que a primeira leva fechar, o green/red aparece aqui."
      />
    );
  }

  const cards = [
    { label: "Palpites", valor: String(stats.total + stats.pendentes) },
    { label: "Acerto", valor: stats.hitRate == null ? "—" : pct(stats.hitRate, 1) },
    {
      label: "Lucro",
      valor: `${stats.unidades >= 0 ? "+" : ""}${stats.unidades.toFixed(2)}u`,
      cor: stats.unidades >= 0 ? "text-good" : "text-bad",
    },
    {
      label: "ROI",
      valor: stats.roi == null ? "—" : `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%`,
      cor: (stats.roi ?? 0) >= 0 ? "text-good" : "text-bad",
    },
  ];

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-panel p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-mut">{c.label}</div>
            <div className={`text-base font-black ${c.cor || "text-txt"}`}>{c.valor}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.5 px-1 text-[11px] font-bold text-mut">
        <Flame className="h-3.5 w-3.5 text-acc" />
        {stats.greens} green · {stats.reds} red · {stats.pendentes} pendentes
      </div>

      <div className="space-y-1.5">
        {recentes.map((r) => {
          const cor =
            r.status === "green" ? "border-good/40 bg-good/10 text-good"
              : r.status === "red" ? "border-bad/40 bg-bad/10 text-bad"
              : "border-line bg-panel2 text-mut";
          return (
            <div key={r.id} className="rounded-xl border border-line bg-panel px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-extrabold text-txt">
                    {r.homeName} <span className="text-mut">×</span> {r.awayName}
                  </div>
                  <div className="truncate text-[10px] font-bold text-mut">
                    {r.rotulo} · odd {r.odd.toFixed(2)} · EV {r.evPct.toFixed(1)}%
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${cor}`}>
                    {r.status}
                  </span>
                  {r.homeScore != null && r.awayScore != null && (
                    <div className="mt-0.5 text-[10px] font-bold text-mut">
                      {r.homeScore}–{r.awayScore}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5 text-center">
      <div className="text-[13px] font-black text-txt">{titulo}</div>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-snug text-mut">{texto}</p>
    </div>
  );
}
