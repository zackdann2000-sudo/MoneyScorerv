import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import {
  Sparkles,
  Radar,
  Swords,
  Scale,
  ArrowRight,
  Check,
  ShieldCheck,
  Zap,
  BarChart3,
  Clock,
} from "lucide-react";

/* Landing pública — mobile-first, dark + verde neon.
   O único caminho de conversão é o cadastro (Free: 1 análise grátis por dia). */

const PILARES = [
  {
    icon: Sparkles,
    titulo: "IA Analista",
    texto:
      "Modelo Poisson com peso por recência e xG no λ. Probabilidade do modelo, odd do mercado e o porquê lado a lado — sem número mágico sem explicação.",
    href: "/palpites-ia",
    cta: "Ver análise de um jogo",
  },
  {
    icon: Radar,
    titulo: "Player Props",
    texto:
      "Finalizações, chutes no gol, faltas e cartões por jogador. Over/Under com linha, confiança e amostra real de cada atleta.",
    href: "/gameread",
    cta: "Explorar props",
  },
  {
    icon: Swords,
    titulo: "Duelos",
    texto:
      "Índice de Ameaça contra índice de Muralha. Quem ataca melhor contra quem comete mais falta, com dominância e chance de acertar o gol.",
    href: "/edge/duelos",
    cta: "Ver confronto direto",
  },
  {
    icon: Scale,
    titulo: "Track Record",
    texto:
      "Todo pick é congelado antes do jogo e liquidado depois. Acerto, lucro em unidades e ROI aparecem aqui — inclusive quando dá red.",
    href: "/desempenho",
    cta: "Conferir histórico",
  },
];

const PASSOS = [
  {
    icon: Zap,
    titulo: "O modelo acha o valor",
    texto: "Probabilidade própria cruzada com a odd. Sem edge, não há pick.",
  },
  {
    icon: BarChart3,
    titulo: "Você vê o porquê",
    texto: "Amostra, λ, xG e H2H expostos. Nada de palpite caixa-preta.",
  },
  {
    icon: Clock,
    titulo: "O histórico cobra",
    texto: "Green ou red, o registro fica. É o único jeito de saber se funciona.",
  },
];

export default async function LandingPage() {
  /* A landing é só para visitante. Quem já tem sessão cai direto na aba Jogos. */
  const user = await getUser().catch(() => null);
  if (user) redirect("/jogos");

  return (
    <div className="mx-auto max-w-5xl px-4 pb-12">
      {/* ---------- HERO ---------- */}
      <section className="relative overflow-hidden rounded-3xl border border-acc/25 bg-panel px-5 py-10 sm:px-10 sm:py-16">
        {/* brilho neon de fundo */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-acc/20 blur-[90px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -right-16 h-64 w-64 rounded-full bg-good/10 blur-[80px]"
        />

        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-acc/40 bg-acc/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-acc">
            <Sparkles className="h-3 w-3" /> análise pré-jogo com IA
          </span>

          <h1 className="mt-4 text-3xl font-black leading-[1.05] text-txt sm:text-5xl">
            A odd é a pergunta.
            <br />
            <span className="bg-gradient-to-r from-acc via-acc to-good bg-clip-text text-transparent">
              A probabilidade é a resposta.
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-mut sm:text-base">
            Modelo estatístico próprio, xG, props por jogador e histórico público de acertos.
            Você vê o número, a amostra e o motivo — antes de qualquer aposta.{" "}
            <span className="font-bold text-txt">Sem promessa de lucro, sem palpite sem base.</span>
          </p>

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <Link
              href="/cadastro"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-acc px-6 py-3.5 text-[13px] font-black text-black shadow-[0_0_28px_-6px] shadow-acc/70 transition-transform hover:scale-[1.02] sm:text-sm"
            >
              Criar conta grátis e ver 1 análise por dia
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href="/edge"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-line bg-panel2 px-5 py-3.5 text-[13px] font-bold text-txt transition-colors hover:border-acc/50 hover:text-acc sm:text-sm"
            >
              Ver picks de hoje
            </Link>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-mut">
            <span className="inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-good" /> 1 análise grátis por dia, sem cartão
            </span>
            <span className="inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-good" /> probabilidades explicadas
            </span>
            <span className="inline-flex items-center gap-1">
              <Check className="h-3.5 w-3.5 text-good" /> histórico aberto
            </span>
          </div>
        </div>
      </section>

      {/* ---------- PILARES ---------- */}
      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-txt sm:text-2xl">O que tem dentro</h2>
            <p className="mt-1 text-[12px] text-mut">Quatro pilares. Todos com o número aberto.</p>
          </div>
          <Link href="/metodologia" className="hidden shrink-0 text-[11px] font-bold text-acc hover:underline sm:block">
            Como o modelo calcula →
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PILARES.map((p) => {
            const Icon = p.icon;
            return (
              <article
                key={p.titulo}
                className="group rounded-2xl border border-line bg-panel p-4 transition-colors hover:border-acc/40"
              >
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 place-items-center rounded-xl border border-acc/30 bg-acc/10 text-acc">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="text-[14px] font-black text-txt">{p.titulo}</h3>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-mut">{p.texto}</p>
                <Link
                  href={p.href}
                  className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-black text-acc group-hover:gap-1.5"
                >
                  {p.cta} <ArrowRight className="h-3 w-3" />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      {/* ---------- COMO FUNCIONA ---------- */}
      <section className="mt-10 rounded-3xl border border-line bg-panel2/60 p-5 sm:p-7">
        <h2 className="text-lg font-black text-txt sm:text-xl">Como funciona, em três passos</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PASSOS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div key={p.titulo} className="relative rounded-2xl border border-line bg-panel p-4">
                <span className="absolute right-3 top-3 text-[11px] font-black text-line">
                  0{i + 1}
                </span>
                <Icon className="h-4 w-4 text-acc" />
                <h3 className="mt-2 text-[13px] font-black text-txt">{p.titulo}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-mut">{p.texto}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- CTA FINAL ---------- */}
      <section className="relative mt-10 overflow-hidden rounded-3xl border border-acc/30 bg-gradient-to-br from-acc/15 via-panel to-panel p-6 text-center sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 rounded-full bg-acc/20 blur-[70px]"
        />
        <div className="relative">
          <h2 className="text-xl font-black text-txt sm:text-3xl">
            Comece com 1 análise grátis por dia
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-[12px] leading-relaxed text-mut sm:text-sm">
            Crie sua conta e libere IA Analista, Player Props, Duelos e o Track Record inteiro.
            Todo dia o contador zera. Sem cartão, sem compromisso — e sem promessa de lucro.
          </p>
          <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <Link
              href="/cadastro"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-acc px-6 py-3.5 text-[13px] font-black text-black shadow-[0_0_28px_-6px] shadow-acc/70 sm:w-auto sm:text-sm"
            >
              Criar conta grátis <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/planos"
              className="inline-flex w-full items-center justify-center rounded-full border border-line bg-panel px-5 py-3.5 text-[13px] font-bold text-txt hover:border-acc/50 sm:w-auto sm:text-sm"
            >
              Ver planos
            </Link>
          </div>

          <p className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-bold text-mut">
            <ShieldCheck className="h-3.5 w-3.5 text-good" />
            Plataforma de análise (18+). Não operamos apostas. Aposte com responsabilidade.
          </p>
        </div>
      </section>
    </div>
  );
}
