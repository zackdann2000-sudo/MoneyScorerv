import Link from "next/link";
import { ArrowLeft, Lock, Swords, Shield, Zap, Info } from "lucide-react";
import { cached } from "@/lib/cache";
import { getUser } from "@/lib/auth";
import { getAllMatches } from "@/lib/espn";
import { getPropsDoTime, montarJogadores, PROPS_DISABLED, PROPS_MAX_JOGOS } from "@/lib/playerProps";
import { montarDuelos, type Duelo } from "@/lib/duelosEngine";

export const dynamic = "force-dynamic";

const hojeSP = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const hhmm = (iso: string) => {
  try {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "--:--";
  }
};

export default async function DuelosPage({
  searchParams,
}: {
  searchParams: Promise<{ jogo?: string }>;
}) {
  const sp = await searchParams;
  const user = await getUser().catch(() => null);
  const isVip = !!user && (user.isAdmin || user.access.active);

  const jogos = await cached(`duelos:jogos:${hojeSP()}`, 5 * 60 * 1000, () =>
    getAllMatches(hojeSP()).catch(() => []),
  );
  const abertos = jogos.filter((m) => m.state !== "post").slice(0, 8);
  const alvo = abertos.find((m) => m.id === sp.jogo) ?? abertos[0] ?? null;

  /* Só o VIP dispara o motor de Props — free/anônimo não gasta cota. */
  const dados = isVip && alvo && !PROPS_DISABLED
    ? await cached(`duelos:v1:${alvo.id}`, 15 * 60 * 1000, async () => {
        const [casa, fora] = await Promise.all([
          getPropsDoTime(alvo.home.name, { permitirApi: true }).catch(() => null),
          getPropsDoTime(alvo.away.name, { permitirApi: true }).catch(() => null),
        ]);
        const jogadores = montarJogadores(casa, fora);
        /* Amostra ideal: 3 jogos por jogador. A API-Football às vezes entrega só
           2 por atleta — nesse caso refazemos em modo curto, avisando na tela. */
        let duelos = montarDuelos(jogadores, { limite: 6, minAmostra: 3 });
        let amostraCurta = false;
        if (!duelos.length) {
          duelos = montarDuelos(jogadores, { limite: 6, minAmostra: 2 });
          amostraCurta = duelos.length > 0;
        }
        return {
          duelos,
          amostraCurta,
          jogadores: jogadores.length,
          amostraCasa: casa?.sample ?? 0,
          amostraFora: fora?.sample ?? 0,
          temporada: casa?.season ?? fora?.season ?? null,
        };
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-3 py-4">
      <header className="rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <Link href="/edge" className="flex items-center gap-1 text-[11px] font-bold text-mut hover:text-txt">
            <ArrowLeft className="h-3.5 w-3.5" /> Edge
          </Link>
          <span className="flex items-center gap-1 rounded-full border border-acc/40 bg-acc/10 px-2 py-0.5 text-[10px] font-black uppercase text-acc">
            <Swords className="h-3 w-3" /> confronto direto
          </span>
        </div>
        <h1 className="mt-1.5 text-xl font-black text-txt">Duelos — quem leva o confronto</h1>
        <p className="mt-1 text-[12px] leading-snug text-mut">
          Cruzamento do que um jogador produz no ataque com o que o adversário comete em faltas e
          cartões. Mesma amostra, mesmos pesos por recência do motor de Props.
        </p>
      </header>

      {/* Seletor de jogo */}
      {abertos.length > 0 && (
        <nav className="flex gap-1.5 overflow-x-auto pb-1">
          {abertos.map((m) => {
            const on = m.id === alvo?.id;
            return (
              <Link
                key={m.id}
                href={`/edge/duelos?jogo=${m.id}`}
                className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold ${
                  on ? "border-acc bg-acc/15 text-acc" : "border-line bg-panel text-mut"
                }`}
              >
                <div className="max-w-[150px] truncate">
                  {m.home.name} × {m.away.name}
                </div>
                <div className={`text-[9px] ${on ? "text-acc/80" : "text-mut/70"}`}>
                  {hhmm(m.date)} · {m.leagueName}
                </div>
              </Link>
            );
          })}
        </nav>
      )}

      {!isVip && <BloqueioVip />}

      {isVip && PROPS_DISABLED && (
        <Aviso titulo="Módulo desligado" texto="Os props estão desativados por configuração (PLAYER_PROPS_DISABLED=1)." />
      )}

      {isVip && !PROPS_DISABLED && !alvo && (
        <Aviso titulo="Sem jogos para cruzar" texto="Nenhuma partida em aberto encontrada hoje nas ligas monitoradas." />
      )}

      {isVip && !PROPS_DISABLED && alvo && dados && dados.duelos.length === 0 && (
        <Aviso
          titulo="Amostra insuficiente"
          texto="A API-Football não devolveu estatística individual suficiente para os dois times (mínimo de 3 jogos por jogador). Tente outro confronto."
        />
      )}

      {isVip && alvo && dados && dados.duelos.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-mut">
            <span className="rounded-full border border-line bg-panel2 px-2 py-0.5">
              {dados.jogadores} jogadores
            </span>
            <span className="rounded-full border border-line bg-panel2 px-2 py-0.5">
              {dados.amostraCasa + dados.amostraFora} jogos de amostra
            </span>
            {dados.temporada && (
              <span className="rounded-full border border-line bg-panel2 px-2 py-0.5">temporada {dados.temporada}</span>
            )}
            <span className="rounded-full border border-line bg-panel2 px-2 py-0.5">até {PROPS_MAX_JOGOS} jogos/jogador</span>
            {dados.amostraCurta && (
              <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-warn">
                amostra curta: 2 jogos por atleta
              </span>
            )}
          </div>

          {dados.duelos.map((d) => (
            <DueloCard key={d.chave} d={d} />
          ))}

          <p className="flex items-start gap-1.5 px-1 pt-1 text-[10px] leading-snug text-mut">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            A dominância é a divisão entre o índice ofensivo e o defensivo — não é previsão de
            resultado nem garantia. Serve para achar o confronto que merece estudo antes da linha.
          </p>
        </section>
      )}
    </div>
  );
}

function DueloCard({ d }: { d: Duelo }) {
  const cor = d.dominancia >= 62 ? "text-good" : d.dominancia <= 38 ? "text-warn" : "text-acc";
  const barra = d.dominancia >= 62 ? "bg-good" : d.dominancia <= 38 ? "bg-warn" : "bg-acc";

  return (
    <article className="rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-stretch gap-2">
        {/* Ameaça */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-acc">
            <Zap className="h-3 w-3" /> ataque
          </div>
          <div className="truncate text-[13px] font-extrabold text-txt">{d.ameaca.nome}</div>
          <div className="truncate text-[10px] font-bold text-mut">
            {d.ameaca.time} · {d.ameaca.posicao || "—"}
          </div>
          <div className="mt-1 text-[11px] font-bold text-mut">
            índice <b className="text-txt">{d.ameaca.media.toFixed(2)}</b> · {d.ameaca.amostra}j
          </div>
        </div>

        <div className="flex w-10 shrink-0 flex-col items-center justify-center">
          <Swords className="h-4 w-4 text-line" />
          <div className={`mt-0.5 text-[11px] font-black ${cor}`}>{d.dominancia}%</div>
        </div>

        {/* Muralha */}
        <div className="min-w-0 flex-1 text-right">
          <div className="flex items-center justify-end gap-1 text-[9px] font-black uppercase tracking-wide text-warn">
            defesa <Shield className="h-3 w-3" />
          </div>
          <div className="truncate text-[13px] font-extrabold text-txt">{d.muralha.nome}</div>
          <div className="truncate text-[10px] font-bold text-mut">
            {d.muralha.time} · {d.muralha.posicao || "—"}
          </div>
          <div className="mt-1 text-[11px] font-bold text-mut">
            índice <b className="text-txt">{d.muralha.media.toFixed(2)}</b> · {d.muralha.amostra}j
          </div>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel2">
        <div className={`h-full rounded-full ${barra}`} style={{ width: `${d.dominancia}%` }} />
      </div>

      <p className="mt-1.5 border-t border-line/60 pt-1.5 text-[11px] leading-snug text-mut">{d.leitura}</p>
    </article>
  );
}

function BloqueioVip() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-acc/30 bg-panel p-4 text-center">
      <Lock className="mx-auto h-5 w-5 text-acc" />
      <div className="mt-1.5 text-[13px] font-black text-txt">Confronto direto é VIP</div>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-snug text-mut">
        Cada duelo cruza as estatísticas individuais dos dois elencos na API-Football. Por custo de
        cota, o cálculo roda só para quem tem acesso ativo.
      </p>
      <div className="mx-auto mt-3 max-w-sm space-y-1.5 opacity-40">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-xl border border-line bg-panel2 p-2 blur-[2px]">
            <div className="flex items-center justify-between text-[11px] font-bold text-mut">
              <span>Jogador {i + 1} · ataque</span>
              <span>vs</span>
              <span>Adversário · defesa</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-line" />
          </div>
        ))}
      </div>
      <Link href="/planos" className="mt-3 inline-block rounded-full bg-acc px-4 py-1.5 text-[12px] font-black text-black">
        Liberar acesso
      </Link>
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-5 text-center">
      <div className="text-[13px] font-black text-txt">{titulo}</div>
      <p className="mx-auto mt-1 max-w-sm text-[11px] leading-snug text-mut">{texto}</p>
    </div>
  );
}
