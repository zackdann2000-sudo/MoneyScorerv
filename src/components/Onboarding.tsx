"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  Clock,
  Radar,
  Swords,
  Target,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";

/**
 * Onboarding pós-cadastro — 4 telas, uma vez por navegador.
 *
 * Por que modal e não rota:
 * o cadastro termina em `router.push("/")`, que redireciona para /jogos. Uma
 * rota /onboarding precisaria de redirect extra e poderia ser pulada por link
 * direto. O modal aparece em qualquer entrada (primeiro login, retorno no mesmo
 * aparelho com conta nova) sem mudar o fluxo de navegação.
 *
 * FLAG: `gs_onboarding_v1` no localStorage. Gravamos em "Começar a usar" E em
 * "Pular" — quem pulou também não quer ver de novo. Versione a chave (`_v1`)
 * se o conteúdo mudar de propósito, para reexibir uma vez. Subiu de v1 para v2
 * junto com a Tela 4: a regra de acesso mudou (trial de 24h → 1 análise grátis
 * por dia), e quem já usava o app precisa ver a regra nova uma vez.
 *
 * Não renderiza nada até saber o resultado do localStorage: evita flash do
 * overlay para quem já viu.
 */

export const ONBOARDING_KEY = "gs_onboarding_v2";

/** Rotas onde o tutorial nunca deve cobrir a tela. */
const ROTAS_IGNORADAS = ["/login", "/cadastro"];

type Tela = {
  icone: typeof Target;
  etiqueta: string;
  titulo: string;
  texto: string;
  /** Bullets curtos — o que a pessoa ganha, não como o código funciona. */
  pontos: string[];
  /** Atalho para ver o recurso na prática. */
  acao: { label: string; href: string };
};

const TELAS: Tela[] = [
  {
    icone: Target,
    etiqueta: "Tela 1 de 4",
    titulo: "Value Bet e TRUST",
    texto:
      "Value bet é quando a odd do mercado paga mais do que a probabilidade que o modelo calculou. O app só mostra a linha quando o valor esperado (EV) é positivo.",
    pontos: [
      "O TRUST é a nota de 0 a 10 de confiança: probabilidade (45%) + EV (35%) + tamanho da amostra (20%).",
      "TRUST alto não é garantia de acerto — é o quanto o número tem de base.",
      "Sem odd publicada pelo mercado, o EV não aparece. É proposital.",
    ],
    acao: { label: "Ver oportunidades +EV", href: "/ev" },
  },
  {
    icone: Radar,
    etiqueta: "Tela 2 de 4",
    titulo: "Player Props e Duelos",
    texto:
      "Props são apostas por jogador, não pelo placar: finalizações, chutes no gol, faltas e cartões, com linha, confiança e amostra de cada atleta.",
    pontos: [
      "Escolha o jogador, veja a linha (ex.: 2,5 finalizações) e o histórico recente.",
      "Nos Duelos, o índice de Ameaça do ataque encara o índice de Muralha da defesa.",
      "Tudo com o número aberto: dá para discordar do modelo e entender por quê.",
    ],
    acao: { label: "Explorar props e duelos", href: "/gameread" },
  },
  {
    icone: BarChart3,
    etiqueta: "Tela 3 de 4",
    titulo: "O cron e o Relatório IA trabalham por você",
    texto:
      "Todo dia o cron atualiza placares, classificação, cartões e probabilidades. O Relatório IA escreve a leitura do jogo em português na página da partida.",
    pontos: [
      "Você não precisa calcular nada: o modelo roda e o texto explica o porquê.",
      "O histórico é público — green ou red, o pick fica registrado antes do jogo.",
      "Volte quando quiser: os dados já estão atualizados.",
    ],
    acao: { label: "Abrir o Centro de Jogos", href: "/hub" },
  },
  {
    icone: Clock,
    etiqueta: "Tela 4 de 4",
    titulo: "Seu acesso, todo dia",
    texto:
      "O acesso é gratuito todos os dias, não só no começo: cada conta vê 1 análise por dia. O contador zera à meia-noite, no horário de Brasília.",
    pontos: [
      "Free: 1 análise por dia, sem cartão e sem prazo para acabar.",
      "Quer ver mais no mesmo dia? Starter libera 6, Pro libera 20 e Expert é ilimitado.",
      "Placares, ligas, classificação e estatísticas de partida continuam abertos para todo mundo.",
    ],
    acao: { label: "Comparar os planos", href: "/planos" },
  },
];

/** Marca em memória: se o localStorage estiver bloqueado, não repetimos o overlay
 *  a cada troca de rota na mesma sessão. */
let jaMostradoNestaSessao = false;

const semInscricao = () => () => {};

/** Lê a flag sem quebrar quando o storage está bloqueado. */
function lerVisto(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== null;
  } catch {
    return jaMostradoNestaSessao;
  }
}

export default function Onboarding() {
  const { user } = useApp();
  const path = usePathname();
  const [passo, setPasso] = useState(0);
  const [fechado, setFechado] = useState(false);

  /* `useSyncExternalStore` evita setState dentro de effect (regra do React 19) e
     resolve a hidratação: no servidor devolvemos "já visto" (nada renderiza) e
     o cliente corrige logo após montar. Como só nós escrevemos a flag, não há
     necessidade de subscribe. */
  const visto = useSyncExternalStore(semInscricao, lerVisto, () => true);

  const rotaIgnorada = ROTAS_IGNORADAS.some((r) => path === r || path.startsWith(`${r}/`));
  const aberto = Boolean(user) && !visto && !fechado && !rotaIgnorada;

  const concluir = () => {
    jaMostradoNestaSessao = true;
    try {
      localStorage.setItem(ONBOARDING_KEY, new Date().toISOString());
    } catch {
      /* sem storage: fecha mesmo assim, só não lembra na próxima visita */
    }
    setFechado(true);
  };

  if (!aberto) return null;

  const tela = TELAS[passo];
  const Icone = tela.icone;
  const ultimo = passo === TELAS.length - 1;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-titulo"
    >
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-line bg-panel shadow-2xl">
        {/* topo: progresso + fechar */}
        <div className="flex items-center gap-2 px-4 pt-4">
          <div className="flex flex-1 items-center gap-1.5" aria-hidden>
            {TELAS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= passo ? "bg-acc" : "bg-line"
                }`}
              />
            ))}
          </div>
          <button
            onClick={concluir}
            aria-label="Fechar tutorial"
            className="w-9 h-9 -mr-1 flex items-center justify-center rounded-full text-mut hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-5 pt-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-acc/30 bg-acc/10 text-acc">
              <Icone className="h-5 w-5" />
            </span>
            <p className="text-[10px] font-black uppercase tracking-widest text-acc">
              {tela.etiqueta}
            </p>
          </div>

          <h2 id="onboarding-titulo" className="mt-3 text-xl font-black leading-tight text-ink sm:text-2xl">
            {tela.titulo}
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-mut sm:text-[13px]">{tela.texto}</p>

          <ul className="mt-3 space-y-2">
            {tela.pontos.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[11px] leading-snug text-ink sm:text-[12px]">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-good" />
                <span>{p}</span>
              </li>
            ))}
          </ul>

          <Link
            href={tela.acao.href}
            onClick={concluir}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-black text-acc hover:underline"
          >
            {tela.acao.label} <ArrowRight className="h-3 w-3" />
          </Link>

          {/* rodapé */}
          <div className="mt-5 flex items-center gap-2">
            {passo > 0 ? (
              <button
                onClick={() => setPasso((p) => p - 1)}
                className="inline-flex h-11 items-center justify-center gap-1 rounded-xl border border-line bg-panel2 px-4 text-[12px] font-bold text-ink"
              >
                <ChevronLeft size={14} /> Voltar
              </button>
            ) : (
              <button
                onClick={concluir}
                className="h-11 px-3 text-[12px] font-bold text-mut hover:text-ink"
              >
                Pular
              </button>
            )}

            <button
              onClick={() => (ultimo ? concluir() : setPasso((p) => p + 1))}
              className="ml-auto inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-acc px-4 text-[13px] font-black text-black sm:flex-none sm:px-6"
            >
              {ultimo ? "Começar a usar" : "Próximo"}
              <ArrowRight size={15} />
            </button>
          </div>

          <p className="mt-3 text-center text-[10px] font-bold text-mut">
            <Swords className="mr-1 inline h-3 w-3 text-acc" />
            Análise esportiva (18+). Sem promessa de lucro — o histórico mostra o que deu certo e o que não deu.
          </p>
        </div>
      </div>
    </div>
  );
}
