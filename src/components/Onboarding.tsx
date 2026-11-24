"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronLeft,
  Clock,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";

/**
 * Onboarding pós-cadastro — 3 telas, uma vez por navegador.
 *
 * Por que modal e não rota:
 * o cadastro termina em `router.push("/")`, que redireciona para /jogos. Uma
 * rota /onboarding precisaria de redirect extra e poderia ser pulada por link
 * direto. O modal aparece em qualquer entrada (primeiro login, retorno no mesmo
 * aparelho com conta nova) sem mudar o fluxo de navegação.
 *
 * FLAG: `gs_onboarding_v3` no localStorage. Gravamos em "Começar a usar" E em
 * "Pular" — quem pulou também não quer ver de novo. A chave é versionada
 * quando o conteúdo muda de propósito, para reexibir uma vez:
 *   v1 → telas originais (value bet, props, cron)
 *   v2 → regra de acesso virou trial de 24h + 1 análise/dia
 *   v3 → monetização pausada: as telas passam a explicar 24h/dia 2, o EV da
 *        Pinnacle e onde ficam Combo IA e alertas
 *
 * Não renderiza nada até saber o resultado do localStorage: evita flash do
 * overlay para quem já viu.
 */

export const ONBOARDING_KEY = "gs_onboarding_v3";

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
    icone: Clock,
    etiqueta: "Tela 1 de 3",
    titulo: "Suas 24 horas — e o que muda no dia 2",
    texto:
      "O cadastro libera o app inteiro por 24 horas: análises sem contador, props, mercados, combos, alertas. Não é uma tela de degustação — é o produto completo, para você medir se o número presta antes de decidir qualquer coisa.",
    pontos: [
      "O contador das 24h fica no topo do app; as horas começam no cadastro.",
      "No dia 2 o acesso não fecha: você passa a ter 1 análise grátis por dia, com o contador zerando à meia-noite (Brasília).",
      "Placares, ligas, classificação e estatísticas de partida continuam abertos sempre, sem limite.",
      "Não há assinatura nesta fase: nenhum cartão é pedido em nenhum momento.",
    ],
    acao: { label: "Ver os jogos de hoje", href: "/jogos" },
  },
  {
    icone: Target,
    etiqueta: "Tela 2 de 3",
    titulo: "O EV só existe com a odd da Pinnacle",
    texto:
      "EV é a diferença entre o que o modelo calcula e o que a odd paga. Sem uma cotação de referência confiável esse número seria inventado — por isso ele simplesmente não aparece quando a referência falta.",
    pontos: [
      "O EV é calculado só sobre a cotação da Pinnacle. Casa pequena paga odd inflada e produziria EV falso.",
      "Sem odd da Pinnacle para a linha, o card mostra a probabilidade do modelo e esconde o EV — em vez de estimar.",
      "Em combinada com pernas correlacionadas (BTTS + over 2.5 no mesmo jogo) o EV também sai da tela: probabilidades dependentes não se multiplicam.",
    ],
    acao: { label: "Ver oportunidades +EV", href: "/ev" },
  },
  {
    icone: Sparkles,
    etiqueta: "Tela 3 de 3",
    titulo: "Combo IA e alertas de gol",
    texto:
      "Os dois recursos que economizam mais tempo no dia a dia: montar a combinada sem fazer conta e ser avisado do gol sem ficar olhando o placar.",
    pontos: [
      "Combo IA: com 2+ seleções no bilhete, toque em “Gerar Combo IA” e receba três perfis (Seguro, Equilibrado, Ousado) com odd, probabilidade e EV; “Usar” aplica no bilhete.",
      "Alertas: em Configurações ligue “⚽ Gols” e “🟢 Início de jogo”. O aviso chega no gol com o placar já atualizado e 15 minutos antes do apito inicial.",
      "O push só chega com o app instalado na tela de início — e nunca é enviado para quem não ligou aquele alerta.",
    ],
    acao: { label: "Abrir o bilhete", href: "/apitou" },
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
            <Bell className="mr-1 inline h-3 w-3 text-acc" />
            Análise esportiva (18+). Sem promessa de lucro — o histórico mostra o que deu certo e o que não deu.
          </p>
        </div>
      </div>
    </div>
  );
}
