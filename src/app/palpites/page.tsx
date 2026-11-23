import Link from "next/link";
import type { Metadata } from "next";
import { caminhoDaLiga, ligasParaListagem } from "@/lib/seoLigas";
import { carregarTodas } from "@/lib/seoLigaDados";

/**
 * Hub `/palpites` — porta de entrada das páginas de liga.
 *
 * Existe por dois motivos: (1) é a consulta mais buscada ("palpites de hoje"),
 * (2) distribui link interno para as 10 páginas de liga, que é como o Google
 * descobre e ranqueia páginas novas. Sem ele, as ligas ficariam órfãs (só no
 * sitemap), e página órfã demora muito mais para ser indexada.
 *
 * Mesma regra do resto: mostra só o que existe. Liga sem jogo hoje aparece com
 * "sem jogos", não desaparece — o link precisa continuar existindo para não
 * quebrar o rastreamento.
 */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Palpites de hoje por liga — probabilidades, xG e placar provável",
  description:
    "Probabilidades do modelo por liga: 1X2, over/under 2.5, ambas marcam, xG e placar mais provável dos jogos de hoje. Histórico registrado antes do jogo.",
  alternates: { canonical: "/palpites" },
};

export default async function Palpites() {
  const dados = await carregarTodas(ligasParaListagem());
  const comJogo = dados.filter((d) => d.totalJogos > 0);
  const totalJogos = dados.reduce((s, d) => s + d.totalJogos, 0);
  const totalAnalisados = dados.reduce((s, d) => s + d.totalAnalisados, 0);

  return (
    <article className="space-y-4 pb-8 text-ink">
      <header>
        <h1 className="font-display font-bold text-[22px] uppercase leading-tight">Palpites de hoje</h1>
        <p className="mt-1 text-[12px] leading-relaxed text-mut">
          Probabilidades do modelo por liga: 1X2, over/under 2.5, ambas marcam, xG esperado e placar mais
          provável. <strong className="text-ink">{totalAnalisados}</strong> análises em{" "}
          <strong className="text-ink">{totalJogos}</strong> jogos na janela. Horários de Brasília.
        </p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        {comJogo.map((d) => {
          const primeiro = d.jogos[0];
          return (
            <Link
              key={d.liga.slug}
              href={caminhoDaLiga(d.liga)}
              className="rounded-2xl border border-line bg-panel p-3 hover:border-acc/50"
            >
              <p className="text-[10px] uppercase text-mut">{d.liga.pais}</p>
              <p className="font-display font-bold text-base uppercase leading-tight text-ink">{d.liga.nome}</p>
              <p className="mt-1 text-[11px] text-mut tabular-nums">
                {d.totalJogos} jogo{d.totalJogos === 1 ? "" : "s"} · {d.totalAnalisados} com análise
              </p>
              {primeiro ? (
                <p className="mt-0.5 text-[11px] text-ink">
                  {primeiro.casa} x {primeiro.fora}
                </p>
              ) : null}
            </Link>
          );
        })}
      </div>

      {comJogo.length === 0 ? (
        <section className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-[12px] font-bold text-ink">Nenhum jogo nas principais ligas agora</p>
          <p className="mt-1 text-[11px] leading-relaxed text-mut">
            O calendário está entre rodadas. Os números voltam quando houver partida marcada.
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="font-display font-bold text-base uppercase text-ink">Todas as ligas cobertas</h2>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {dados.map((d) => (
            <Link
              key={d.liga.slug}
              href={caminhoDaLiga(d.liga)}
              className="rounded-full border border-line bg-panel2 px-2.5 py-1 text-[11px] font-bold text-ink hover:border-acc/60"
            >
              {d.liga.nome}
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-acc/35 bg-gradient-to-br from-acc/10 via-panel to-panel p-4">
        <p className="font-display font-bold text-base uppercase text-ink">Grátis todo dia: 1 análise</p>
        <p className="mt-1 text-[11px] leading-relaxed text-mut">
          O contador zera à meia-noite. Quer ver mais no mesmo dia? Starter libera 6, Pro 20 e Expert é
          ilimitado.
        </p>
        <Link href="/planos" className="mt-2 inline-flex h-9 items-center rounded-xl bg-acc px-3 text-[11px] font-extrabold text-black">
          Ver os planos
        </Link>
      </section>

      <footer className="text-[10px] leading-relaxed text-mut">
        Conteúdo para maiores de 18 anos. Probabilidades não são garantia de resultado.{" "}
        <Link href="/jogo-responsavel" className="font-bold text-acc">Jogo responsável</Link>.
      </footer>
    </article>
  );
}
