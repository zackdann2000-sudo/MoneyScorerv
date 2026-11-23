import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Metadata } from "next";
import {
  SEO_LIGAS,
  caminhoDaLiga,
  descricaoSeo,
  ligaPorSlug,
  tituloSeo,
  type SeoLiga,
} from "@/lib/seoLigas";
import { carregarLiga, type JogoSeo, type LigaSeo } from "@/lib/seoLigaDados";

/**
 * Página de SEO por liga: /palpites/{liga}.
 *
 * Por que Server Component e não client como o resto do app: o Google precisa
 * ver o jogo e o número no HTML. Toda página client-side do projeto renderiza
 * esqueleto + fetch; aqui isso valeria conteúdo zero.
 *
 * ISR de 10 minutos (igual `/palpites-ia`): 10 páginas, `revalidate` barato, e
 * `dynamicParams` ligado para liga nova não exigir deploy.
 *
 * Regra que manda no arquivo: **nada de seção vazia**. Sem `summary` não há
 * bloco de xG; sem `analysisText` não há relatório; liga com menos de 3 jogos
 * futuros ou sem análise sai com `noindex`.
 */
export const revalidate = 600;
export const dynamicParams = true;

type Props = { params: Promise<{ liga: string }> };

/** Deduplica a consulta: metadata + página compartilham a mesma carga. */
const carregar = cache(carregarLiga);

const pct = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`;

const num = (v: number | null | undefined, casas = 2) =>
  v === null || v === undefined ? "—" : v.toFixed(casas).replace(".", ",");

function horaSP(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function diaSP(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const FORCA: Record<string, string> = {
  strong: "favorito forte",
  clear: "favorito claro",
  slight: "leve favoritismo",
  none: "jogo equilibrado",
};

export async function generateStaticParams() {
  return SEO_LIGAS.map((l) => ({ liga: l.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { liga } = await params;
  const l = ligaPorSlug(liga);
  if (!l) return { title: "Palpites por liga" };
  const dados = await carregar(l);
  const caminho = caminhoDaLiga(l);
  return {
    title: tituloSeo(l),
    description: descricaoSeo(l),
    alternates: { canonical: caminho },
    robots: { index: dados.indexavel, follow: true },
    openGraph: {
      type: "article",
      title: tituloSeo(l),
      description: descricaoSeo(l),
      url: caminho,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Blocos                                                             */
/* ------------------------------------------------------------------ */

function CardJogo({ j }: { j: JogoSeo }) {
  const p = j.probs;
  return (
    <Link
      href={`/jogos/${j.id}`}
      className="block rounded-2xl border border-line bg-panel p-3 hover:border-acc/50"
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-mut tabular-nums">{diaSP(j.inicio)}</span>
        <span className="text-[10px] font-bold text-mut tabular-nums">{horaSP(j.inicio)}</span>
        {j.encerrado ? (
          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-panel2 text-mut">ENCERRADO</span>
        ) : j.placar ? (
          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-live/20 text-live">AO VIVO</span>
        ) : null}
        <span className="ml-auto text-[11px] font-bold text-ink tabular-nums">{j.placar ?? "×"}</span>
      </div>

      <p className="mt-1 text-sm font-bold text-ink leading-tight">
        {j.casa} <span className="text-mut font-normal">x</span> {j.fora}
      </p>

      {!j.analise ? (
        <p className="mt-1.5 text-[10px] text-mut">Análise do modelo em preparação para este jogo.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-lg bg-panel2 py-1">
              <p className="text-[9px] text-mut uppercase">Casa</p>
              <p className="text-[12px] font-extrabold text-ink tabular-nums">{pct(p?.casa)}</p>
            </div>
            <div className="rounded-lg bg-panel2 py-1">
              <p className="text-[9px] text-mut uppercase">Empate</p>
              <p className="text-[12px] font-extrabold text-ink tabular-nums">{pct(p?.empate)}</p>
            </div>
            <div className="rounded-lg bg-panel2 py-1">
              <p className="text-[9px] text-mut uppercase">Fora</p>
              <p className="text-[12px] font-extrabold text-ink tabular-nums">{pct(p?.fora)}</p>
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-mut tabular-nums">
            Over 2.5 {pct(j.over25)} · Ambas marcam {pct(j.btts)}
            {j.xgCasa !== null && j.xgFora !== null ? ` · xG ${num(j.xgCasa, 1)}–${num(j.xgFora, 1)}` : ""}
            {j.placarProvavel ? ` · placar provável ${j.placarProvavel.casa}-${j.placarProvavel.fora} (${pct(j.placarProvavel.prob)})` : ""}
          </p>
        </>
      )}
    </Link>
  );
}

function Destaque({ j, liga }: { j: JogoSeo; liga: SeoLiga }) {
  return (
    <section className="rounded-2xl border border-acc/35 bg-gradient-to-br from-acc/10 via-panel to-panel p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-acc">Destaque do modelo · {liga.nome}</p>
      <h2 className="mt-1 font-display font-bold text-lg uppercase leading-tight text-ink">
        {j.casa} x {j.fora}
      </h2>
      <p className="mt-1 text-[11px] text-mut">
        {diaSP(j.inicio)} · {horaSP(j.inicio)} (Brasília)
        {j.forcaFavorito ? ` · ${FORCA[j.forcaFavorito] ?? j.forcaFavorito}` : ""}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-panel2 p-2">
          <p className="text-[9px] uppercase text-mut">Prob. do favorito</p>
          <p className="text-sm font-extrabold text-ink tabular-nums">{pct(j.topProb)}</p>
        </div>
        <div className="rounded-xl bg-panel2 p-2">
          <p className="text-[9px] uppercase text-mut">xG casa–fora</p>
          <p className="text-sm font-extrabold text-ink tabular-nums">
            {num(j.xgCasa, 1)}–{num(j.xgFora, 1)}
          </p>
        </div>
        <div className="rounded-xl bg-panel2 p-2">
          <p className="text-[9px] uppercase text-mut">Gols esperados</p>
          <p className="text-sm font-extrabold text-ink tabular-nums">{num(j.golsEsperados, 2)}</p>
        </div>
        <div className="rounded-xl bg-panel2 p-2">
          <p className="text-[9px] uppercase text-mut">Confiança</p>
          <p className="text-sm font-extrabold text-ink tabular-nums">{j.confianca ?? "—"}/100</p>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-mut tabular-nums">
        Over 2.5 {pct(j.over25)} · Ambas marcam {pct(j.btts)}
        {j.placarProvavel
          ? ` · placar mais provável ${j.placarProvavel.casa}-${j.placarProvavel.fora} (${pct(j.placarProvavel.prob)})`
          : ""}
      </p>

      {j.leitura ? (
        <p className="mt-2 text-[12px] leading-relaxed text-ink">{j.leitura}</p>
      ) : null}

      <Link
        href={`/jogos/${j.id}`}
        className="mt-3 inline-flex h-9 items-center rounded-xl bg-acc px-3 text-[11px] font-extrabold text-black"
      >
        Abrir a análise completa
      </Link>
    </section>
  );
}

function PassosDoModelo({ liga }: { liga: SeoLiga }) {
  const passos = [
    ["1. Dados normalizados", "Placar, cartões, xG e classificação de cada time entram com o nome do fornecedor normalizado — a mesma competição chega com três nomes diferentes e vira uma só."],
    ["2. Forma recente com peso decrescente", "As últimas partidas pesam mais que as antigas (decaimento exponencial). Time em série boa não carrega o número de dois meses atrás."],
    ["3. Poisson / Dixon-Coles", "Da média de gols esperados de cada lado saem as probabilidades de 1X2, over/under e ambas marcam, corrigindo o empate típico de jogo truncado."],
    ["4. Do número ao mercado", "Só existe value bet quando a odd publicada paga mais do que a probabilidade calculada. Sem odd real, a página mostra probabilidade e diz que não houve mercado."],
  ] as const;
  return (
    <section>
      <h2 className="font-display font-bold text-lg uppercase text-ink">Como o modelo chega nesse número</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-mut">{liga.contexto}</p>
      <ol className="mt-2 space-y-2">
        {passos.map(([t, d]) => (
          <li key={t} className="rounded-xl border border-line bg-panel p-3">
            <p className="text-[11px] font-extrabold text-ink">{t}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-mut">{d}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[10px] text-mut">
        Regra completa em{" "}
        <Link href="/metodologia" className="font-bold text-acc">Metodologia</Link>. Nenhum número aqui é promessa de lucro.
      </p>
    </section>
  );
}

function Faq({ liga, dados }: { liga: SeoLiga; dados: LigaSeo }) {
  const itens = [
    [
      `Quantos jogos do ${liga.nome} têm análise hoje?`,
      `${dados.totalAnalisados} de ${dados.totalJogos} jogos na janela exibida têm análise do modelo. Quando um jogo ainda não tem, o card mostra "análise em preparação" em vez de um número inventado.`,
    ],
    [
      `Como o GreenScore calcula o favorito do ${liga.nome}?`,
      "Pela probabilidade de cada resultado (casa, empate, fora) gerada por Poisson/Dixon-Coles a partir de gols esperados e forma recente. O favorito é a maior probabilidade, não a maior odd.",
    ],
    [
      "O que é xG e por que ele aparece na página?",
      "xG é a expectativa de gols de um time no jogo. É a partir dele que saem as probabilidades de over 2.5 e de ambas marcam — publicar só o 1X2 esconderia de onde o número veio.",
    ],
    [
      "As análises são gratuitas?",
      "Sim, todo dia: a conta Free vê 1 análise por dia e o contador zera à meia-noite (Brasília). Os planos Starter, Pro e Expert liberam mais análises no mesmo dia.",
    ],
    [
      "Isso é dica de aposta?",
      "Não. São probabilidades estatísticas de um modelo, registradas antes do jogo. Não há garantia de acerto e o conteúdo é para maiores de 18 anos.",
    ],
  ] as const;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: itens.map(([q, a]) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <section>
      <h2 className="font-display font-bold text-lg uppercase text-ink">Perguntas frequentes</h2>
      <dl className="mt-2 space-y-2">
        {itens.map(([q, a]) => (
          <div key={q} className="rounded-xl border border-line bg-panel p-3">
            <dt className="text-[11px] font-extrabold text-ink">{q}</dt>
            <dd className="mt-0.5 text-[11px] leading-relaxed text-mut">{a}</dd>
          </div>
        ))}
      </dl>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                             */
/* ------------------------------------------------------------------ */

export default async function LigaSeoPage({ params }: Props) {
  const { liga } = await params;
  const l = ligaPorSlug(liga);
  if (!l) notFound();

  const dados = await carregar(l);
  const destaques = [...dados.jogos]
    .filter((j) => j.topProb !== null)
    .sort((a, b) => (b.topProb ?? 0) - (a.topProb ?? 0));
  const destaque = destaques[0] ?? null;

  const outras = SEO_LIGAS.filter((x) => x.slug !== l.slug);
  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://greenscore.app").replace(/\/$/, "");

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: `${base}/` },
      { "@type": "ListItem", position: 2, name: "Palpites", item: `${base}/palpites` },
      { "@type": "ListItem", position: 3, name: l.nome, item: `${base}${caminhoDaLiga(l)}` },
    ],
  };

  const listaJogos = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Jogos do ${l.nome}`,
    itemListElement: dados.jogos.slice(0, 20).map((j, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "SportsEvent",
        name: `${j.casa} x ${j.fora}`,
        startDate: j.inicio,
        sport: "Soccer",
        ...(j.encerrado ? {} : { eventStatus: "https://schema.org/EventScheduled" }),
        homeTeam: { "@type": "SportsTeam", name: j.casa },
        awayTeam: { "@type": "SportsTeam", name: j.fora },
      },
    })),
  };

  return (
    <article className="space-y-4 pb-8 text-ink">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(listaJogos).replace(/</g, "\\u003c") }}
      />

      <nav aria-label="Trilha" className="text-[10px] font-bold uppercase text-mut">
        <Link href="/" className="hover:text-acc">Início</Link>
        <span aria-hidden> / </span>
        <Link href="/palpites" className="hover:text-acc">Palpites</Link>
        <span aria-hidden> / </span>
        <span className="text-ink">{l.nome}</span>
      </nav>

      <header>
        <h1 className="font-display font-bold text-[22px] uppercase leading-tight">
          Palpites {l.nome}
        </h1>
        <p className="mt-1 text-[12px] leading-relaxed text-mut">
          Probabilidades do modelo para os jogos do {l.nome}: 1X2, dupla chance, over/under 2.5 e ambas
          marcam, com xG esperado e placar mais provável.{" "}
          {dados.totalJogos > 0 ? (
            <>
              <strong className="text-ink">{dados.totalAnalisados}</strong> de{" "}
              <strong className="text-ink">{dados.totalJogos}</strong> jogos na janela já têm análise
              {dados.atualizadoEm ? ` · atualizado em ${diaSP(dados.atualizadoEm)} às ${horaSP(dados.atualizadoEm)}` : ""}.
            </>
          ) : (
            <>Nenhum jogo desta liga na janela atual.</>
          )}
        </p>
      </header>

      {dados.revisao ? (
        <p className="rounded-xl border border-warn/40 bg-warn/10 p-2.5 text-[11px] leading-relaxed text-warn">
          Os números desta rodada estão em revisão pelo modelo — os jogos podem aparecer com a mesma
          probabilidade até a próxima rodada de cálculo. O calendário abaixo é real.
        </p>
      ) : null}

      {dados.jogos.length === 0 ? (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-[12px] font-bold text-ink">Sem jogos nesta janela</p>
          <p className="mt-1 text-[11px] leading-relaxed text-mut">
            O calendário do {l.nome} não tem partidas nos próximos dias (ou a liga saiu de temporada).
            O placar e os números voltam a aparecer quando houver rodada marcada.
          </p>
          <Link href="/jogos" className="mt-2 inline-flex h-9 items-center rounded-xl bg-panel2 border border-line px-3 text-[11px] font-extrabold text-ink">
            Ver os jogos de hoje
          </Link>
        </section>
      ) : (
        <>
          {destaque && <Destaque j={destaque} liga={l} />}

          <section>
            <h2 className="font-display font-bold text-lg uppercase text-ink">
              Jogos do {l.nome}
            </h2>
            <p className="text-[10px] text-mut">
              Horários de Brasília. Toque no jogo para ver a análise completa.
            </p>
            <div className="mt-2 space-y-2">
              {dados.jogos.map((j) => (
                <CardJogo key={j.id} j={j} />
              ))}
            </div>
          </section>
        </>
      )}

      <PassosDoModelo liga={l} />

      <section className="rounded-2xl border border-line bg-panel p-3">
        <h2 className="font-display font-bold text-base uppercase text-ink">Transparência</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-mut">
          Todo palpite é registrado antes do jogo começar — green ou red, o histórico fica publicado.
        </p>
        <p className="mt-1.5 text-[11px]">
          <Link href="/desempenho" className="font-bold text-acc">Ver o Track Record completo</Link>
          <span className="text-mut"> · </span>
          <Link href="/metodologia" className="font-bold text-acc">Metodologia</Link>
        </p>
      </section>

      <Faq liga={l} dados={dados} />

      <section>
        <h2 className="font-display font-bold text-lg uppercase text-ink">Outras ligas</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {outras.map((x) => (
            <Link
              key={x.slug}
              href={caminhoDaLiga(x)}
              className="rounded-full border border-line bg-panel2 px-2.5 py-1 text-[11px] font-bold text-ink hover:border-acc/60"
            >
              {x.nome}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-acc/35 bg-gradient-to-br from-acc/10 via-panel to-panel p-4">
        <p className="font-display font-bold text-base uppercase text-ink">Quer mais que 1 análise por dia?</p>
        <p className="mt-1 text-[11px] leading-relaxed text-mut">
          O Free libera 1 análise por dia, todos os dias. Starter abre 6, Pro abre 20 e Expert não tem
          contador — no cartão, cancele quando quiser.
        </p>
        <Link
          href="/planos"
          className="mt-2 inline-flex h-9 items-center rounded-xl bg-acc px-3 text-[11px] font-extrabold text-black"
        >
          Ver os planos
        </Link>
      </section>

      <footer className="text-[10px] leading-relaxed text-mut">
        Conteúdo para maiores de 18 anos. Probabilidades estatísticas não são garantia de resultado e não
        constituem incentivo a apostar.{" "}
        <Link href="/jogo-responsavel" className="font-bold text-acc">Jogo responsável</Link>.
      </footer>
    </article>
  );
}
