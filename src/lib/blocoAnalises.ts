/**
 * Bloco de 4 análises da tela de jogo: cartões, faltas, gols e impedimentos.
 *
 * Entra com as médias por jogo que já existem no histórico dos times
 * (`/api/teams/[id]` → `averages`, alimentado por ESPN/API-Football) e sai com,
 * para cada métrica: média do mandante, média do visitante, total esperado do
 * confronto, linha sugerida e probabilidade de passar dessa linha.
 *
 * Modelo (o mesmo do resto do app, transparente):
 *   gols ....... λ_casa = (gols do mandante + gols sofridos do visitante) / 2
 *                λ_fora = (gols do visitante + gols sofridos do mandante) / 2
 *                λ_jogo = λ_casa + λ_fora
 *   demais ..... λ_jogo = média do mandante + média do visitante
 *                (cartões, faltas e impedimentos são contados por quem produz;
 *                 a fonte não publica "concedidos" de forma confiável)
 *
 * Regras que não mudam:
 *  - `linha` é a meia-linha imediatamente abaixo do total (λ 2.67 → 1.5,
 *    λ 26.07 → 25.5): nunca trivial, nunca inalcançável;
 *  - probabilidade vem de Poisson (contagem de eventos por jogo);
 *  - número ausente na fonte → `semDados: true`, nunca zero inventado;
 *  - é estimativa de média, não leitura de mercado: sem odd, sem "valor".
 *
 * Duas correções entram por cima da média:
 *  1. o peso da forma recente (o chamador manda médias já ponderadas — 1.5 nos
 *     3 últimos jogos, 1.0 do 4º ao 7º, 0.5 do 8º ao 10º);
 *  2. o cruzamento com o H2H (últimos 7 confrontos): se o confronto direto é
 *     travado, o total esperado de gols/cartões desce antes de virar
 *     probabilidade — sempre limitado a -15%/+10%.
 */
import { JANELA_FORMA, JANELA_H2H, ajusteH2H, type AjusteH2H } from "./formaRecente";

/** Janela padrão das médias exibidas e do texto de transparência. */
export const BASE_ULTIMOS = JANELA_FORMA;
export const TEXTO_BASE = `baseado nos últimos ${BASE_ULTIMOS} jogos`;

export type MetricaId = "cartoes" | "faltas" | "gols" | "impedimentos";

/** Médias por jogo do time — o formato de `averages` em /api/teams/[id]. */
export type MediasTime = {
  jogos?: number | null;
  /** gols marcados por jogo */
  gols?: number | null;
  /** gols sofridos por jogo */
  sofridos?: number | null;
  /** faltas cometidas por jogo */
  faltas?: number | null;
  /** cartões amarelos por jogo */
  amarelos?: number | null;
  /** cartões vermelhos por jogo (quando a fonte informa) */
  vermelhos?: number | null;
  /** impedimentos por jogo */
  impedimentos?: number | null;
};

export type AnaliseBloco = {
  id: MetricaId;
  rotulo: string;
  /** Média por jogo do mandante (cartões = amarelos + vermelhos). */
  mediaCasa: number | null;
  mediaFora: number | null;
  /** Total esperado do confronto (λ). */
  total: number | null;
  /** Meia-linha imediatamente abaixo do total. */
  linha: number | null;
  /** 0..100 — P(total > linha). */
  prob: number | null;
  /** Menor amostra entre os dois times, em jogos. */
  amostra: number;
  semDados: boolean;
  /** Correção vinda do H2H (null quando não houve cruzamento). */
  ajuste: AjusteH2H | null;
};

/** H2H já resumido por confronto — o chamador calcula a partir da série. */
export type ContextoH2H = {
  /** Média de gols por confronto nos últimos N jogos do H2H. */
  gols?: number | null;
  /** Média de cartões por confronto. */
  cartoes?: number | null;
  /** Quantos confrontos entraram. */
  jogos: number;
};

export const ORDEM: MetricaId[] = ["cartoes", "faltas", "gols", "impedimentos"];

const ROTULOS: Record<MetricaId, string> = {
  cartoes: "Cartões",
  faltas: "Faltas",
  gols: "Gols",
  impedimentos: "Impedimentos",
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? null : n;
};

const arred = (v: number): number => Math.round(v * 100) / 100;

/**
 * P(X > linha) para X ~ Poisson(λ), com `linha` em meia unidade.
 * Soma direta de P(X = 0..k) com k = ⌊linha⌋: estável para λ até ~60, que cobre
 * faltas (≈27) e passes.
 */
export function poissonAcima(linha: number, lambda: number): number {
  if (!(lambda > 0)) return 0;
  const k = Math.floor(linha);
  let p = Math.exp(-lambda); // P(X = 0)
  let acumulado = p;
  for (let i = 1; i <= k; i++) {
    p = (p * lambda) / i;
    acumulado += p;
  }
  return Math.min(1, Math.max(0, 1 - acumulado));
}

/** Cartões = amarelos + vermelhos, quando os vermelhos existem. */
function cartoesDe(m: MediasTime): number | null {
  const amarelos = num(m.amarelos);
  if (amarelos == null) return null;
  return arred(amarelos + (num(m.vermelhos) ?? 0));
}

/** Total esperado do confronto para os eventos que não têm "concedidos". */
function soma(casa: number | null, fora: number | null): number | null {
  if (casa == null || fora == null) return null;
  return arred(casa + fora);
}

/**
 * Total de gols esperado, cruzando ataque e defesa:
 * (gols do mandante + gols sofridos do visitante)/2 + o mesmo invertido.
 */
function totalGols(casa: MediasTime, fora: MediasTime): number | null {
  const golsCasa = num(casa.gols);
  const golsFora = num(fora.gols);
  const sofridosCasa = num(casa.sofridos);
  const sofridosFora = num(fora.sofridos);
  if (golsCasa == null || golsFora == null || sofridosCasa == null || sofridosFora == null) {
    return null;
  }
  return arred((golsCasa + sofridosFora) / 2 + (golsFora + sofridosCasa) / 2);
}

/** Meia-linha imediatamente abaixo do total (2.67 → 1.5, 26.07 → 25.5). */
export function linhaSugerida(total: number): number {
  return Math.max(0.5, Math.floor(total) - 0.5);
}

function montar(
  id: MetricaId,
  mediaCasa: number | null,
  mediaFora: number | null,
  total: number | null,
  amostra: number,
  ajuste: AjusteH2H | null = null,
): AnaliseBloco {
  // O H2H corrige o total antes de virar linha e probabilidade.
  const totalAjustado =
    total != null && ajuste?.aplicado ? Math.round(total * ajuste.fator * 100) / 100 : total;
  // Sem número na fonte: não há o que estimar.
  if (mediaCasa == null || mediaFora == null || total == null || totalAjustado == null) {
    return {
      id,
      rotulo: ROTULOS[id],
      mediaCasa,
      mediaFora,
      total: null,
      linha: null,
      prob: null,
      amostra,
      semDados: true,
      ajuste,
    };
  }

  // Média zero é medição real (ex.: time sem impedimento na amostra), mas não
  // existe linha nem probabilidade para λ = 0 — o card mostra a média e ponto.
  if (!(totalAjustado > 0)) {
    return {
      id,
      rotulo: ROTULOS[id],
      mediaCasa,
      mediaFora,
      total: 0,
      linha: null,
      prob: null,
      amostra,
      semDados: false,
      ajuste,
    };
  }
  // A linha continua ancorada no total dos últimos 10 jogos: é a linha que o
  // mercado oferece. O H2H mexe na probabilidade dessa linha, não na linha —
  // senão um confronto travado "abaixaria" a linha e a chance subiria, o
  // contrário do que o histórico diz.
  const linha = linhaSugerida(total);
  const prob = arred(poissonAcima(linha, totalAjustado) * 100);
  return {
    id,
    rotulo: ROTULOS[id],
    mediaCasa,
    mediaFora,
    total: totalAjustado,
    linha,
    prob,
    amostra,
    semDados: false,
    ajuste,
  };
}

/**
 * Monta as 4 análises sempre na mesma ordem (cartões, faltas, gols,
 * impedimentos). Item sem número na fonte volta com `semDados: true` — a UI
 * mostra "sem dados" em vez de um zero que pareceria medição.
 */
export function blocoAnalises(
  casa: MediasTime | null | undefined,
  fora: MediasTime | null | undefined,
  h2h?: ContextoH2H | null,
): AnaliseBloco[] {
  const c = casa ?? {};
  const f = fora ?? {};
  const amostra = Math.max(0, Math.min(num(c.jogos) ?? 0, num(f.jogos) ?? 0));

  const cartoesCasa = cartoesDe(c);
  const cartoesFora = cartoesDe(f);

  const faltasCasa = num(c.faltas);
  const faltasFora = num(f.faltas);

  const golsCasa = num(c.gols);
  const golsFora = num(f.gols);

  const impCasa = num(c.impedimentos);
  const impFora = num(f.impedimentos);

  const totalCartoes = soma(cartoesCasa, cartoesFora);
  const totalGolsJogo = totalGols(c, f);
  const jogosH2H = Math.max(0, Number(h2h?.jogos) || 0);

  /* O H2H entra só onde ele fala a mesma língua do total: gols e cartões.
     Faltas e impedimentos não têm histórico de confronto confiável na fonte. */
  const ajusteCartoes = ajusteH2H(h2h?.cartoes, totalCartoes, jogosH2H);
  const ajusteGols = ajusteH2H(h2h?.gols, totalGolsJogo, jogosH2H);

  return [
    montar("cartoes", cartoesCasa, cartoesFora, totalCartoes, amostra, ajusteCartoes),
    montar("faltas", faltasCasa, faltasFora, soma(faltasCasa, faltasFora), amostra),
    montar("gols", golsCasa, golsFora, totalGolsJogo, amostra, ajusteGols),
    montar("impedimentos", impCasa, impFora, soma(impCasa, impFora), amostra),
  ];
}
