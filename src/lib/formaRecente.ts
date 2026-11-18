/**
 * Peso da forma recente — o decaimento usado por todo motor de análise.
 *
 * A ideia: um jogo de duas semanas atrás diz mais sobre o time de hoje do que
 * um jogo de três meses atrás. Em vez da média chapada da temporada, a média é
 * ponderada pela posição do jogo na série (sempre do mais recente para o mais
 * antigo):
 *
 *   jogos 1 a 3 .... peso 1.5  (fase atual)
 *   jogos 4 a 7 .... peso 1.0  (referência)
 *   jogos 8 a 10 ... peso 0.5  (contexto)
 *
 * A janela é de 10 jogos: é o que o app já carrega (`/api/teams/[id]`,
 * raio-X do /apitou, H2H do NerdyTips) e não exige uma chamada extra.
 *
 * `mediaPonderada` ignora nulos (a fonte às vezes não publica um campo numa
 * partida) e renormaliza pelos pesos que sobraram — assim uma série com furo
 * não desloca o resultado.
 *
 * O ajuste de H2H também mora aqui porque é o mesmo tipo de pergunta: quanto o
 * histórico do confronto deve corrigir a expectativa? Ele entra como fator
 * limitado, nunca como sobrescrita.
 */

/** Peso por posição na série (0 = jogo mais recente). */
export const PESOS_FORMA = [1.5, 1.5, 1.5, 1.0, 1.0, 1.0, 1.0, 0.5, 0.5, 0.5] as const;

/** Quantos jogos compõem a janela ponderada. */
export const JANELA_FORMA = PESOS_FORMA.length;

/** Peso de um jogo pela posição. Fora da janela vale o último peso (contexto). */
export function pesoDaPosicao(posicao: number): number {
  if (!Number.isFinite(posicao) || posicao < 0) return 0;
  const i = Math.floor(posicao);
  return i >= JANELA_FORMA ? PESOS_FORMA[JANELA_FORMA - 1] : PESOS_FORMA[i];
}

export type MediaPonderada = {
  /** Média ponderada pelo decaimento. `null` quando não há nenhum valor. */
  media: number | null;
  /** Quantos jogos tinham número na fonte. */
  amostra: number;
  /** Soma dos pesos usados (para debug e para a UI explicar a base). */
  somaPesos: number;
};

/**
 * Média com decaimento. Aceita a série do jogo mais recente para o mais
 * antigo; valores nulos/NaN são pulados e o peso é redistribuído.
 */
export function mediaPonderada(valores: readonly (number | null | undefined)[]): MediaPonderada {
  let soma = 0;
  let somaPesos = 0;
  let amostra = 0;

  for (let i = 0; i < valores.length && i < JANELA_FORMA; i++) {
    const v = valores[i];
    if (v == null || !Number.isFinite(Number(v))) continue;
    const peso = pesoDaPosicao(i);
    if (peso <= 0) continue;
    soma += Number(v) * peso;
    somaPesos += peso;
    amostra++;
  }

  return {
    media: somaPesos > 0 ? Math.round((soma / somaPesos) * 100) / 100 : null,
    amostra,
    somaPesos: Math.round(somaPesos * 100) / 100,
  };
}

/** Média simples — usada quando a série é curta demais para ponderar. */
export function mediaSimples(valores: readonly (number | null | undefined)[]): number | null {
  const nums = valores
    .filter((v) => v != null && String(v).trim() !== "")
    .map(Number)
    .filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* H2H                                                                 */
/* ------------------------------------------------------------------ */

/** Abaixo disso o H2H é anedota, não amostra. */
export const MIN_H2H = 3;
/** Quantos confrontos entram no cruzamento. */
export const JANELA_H2H = 7;
/**
 * Quanto do desvio do H2H é aplicado: 35%. O H2H corrige a expectativa, não a
 * substitui — 0x0 em sete jogos continua sendo futebol, não destino.
 */
export const FORCA_H2H = 0.35;
/** Piso e teto do fator: no máximo -15% / +10% no total esperado. */
export const FATOR_H2H_MIN = 0.85;
export const FATOR_H2H_MAX = 1.1;

export type AjusteH2H = {
  /** Multiplicador aplicado ao total esperado (1 = neutro). */
  fator: number;
  /** true quando o H2H realmente mexeu no número. */
  aplicado: boolean;
  /** Média do H2H (eventos por confronto) e a do modelo (últimos 10). */
  mediaH2H: number | null;
  mediaModelo: number | null;
  /** Confrontos considerados. */
  jogos: number;
  /** Texto curto para a UI/narrativa. */
  texto: string;
};

/**
 * Cruza o H2H com a expectativa dos últimos 10 jogos.
 *
 * Exemplo do problema: o time A marca 2.2 gols/jogo nos últimos 10, mas o H2H
 * contra o B é 0x0, 1x0, 0x0 (média 0.33). O modelo não deve manter "over 2.5"
 * como se o confronto não existisse — mas também não pode jogar tudo fora por
 * três jogos. Por isso o fator é limitado e proporcional (35% do desvio).
 */
export function ajusteH2H(
  mediaH2H: number | null | undefined,
  mediaModelo: number | null | undefined,
  jogos: number,
): AjusteH2H {
  const n = Number(jogos) || 0;
  const h = mediaH2H == null ? null : Number(mediaH2H);
  const m = mediaModelo == null ? null : Number(mediaModelo);

  const neutro = (texto: string): AjusteH2H => ({
    fator: 1,
    aplicado: false,
    mediaH2H: h != null && Number.isFinite(h) ? h : null,
    mediaModelo: m != null && Number.isFinite(m) ? m : null,
    jogos: n,
    texto,
  });

  if (n < MIN_H2H) return neutro(`H2H com ${n} jogo(s): amostra insuficiente, não ajusta.`);
  if (h == null || m == null || !Number.isFinite(h) || !Number.isFinite(m) || m <= 0) {
    return neutro("H2H sem números suficientes, não ajusta.");
  }

  const razao = h / m;
  const bruto = 1 + (razao - 1) * FORCA_H2H;
  const fator = Math.round(Math.min(FATOR_H2H_MAX, Math.max(FATOR_H2H_MIN, bruto)) * 1000) / 1000;

  // Ajuste abaixo de 2% é ruído do arredondamento e não vale mexer no número.
  if (Math.abs(fator - 1) < 0.02) {
    return { fator: 1, aplicado: false, mediaH2H: h, mediaModelo: m, jogos: n, texto: "H2H na média do histórico recente." };
  }

  const direcao = fator < 1 ? "para baixo" : "para cima";
  const pct = Math.abs(Math.round((fator - 1) * 100));
  return {
    fator,
    aplicado: true,
    mediaH2H: h,
    mediaModelo: m,
    jogos: n,
    texto: `H2H ${fator < 1 ? "travado" : "aberto"}: ${h.toFixed(2)} por confronto contra ${m.toFixed(2)} dos últimos 10 jogos — ajuste de ${pct}% ${direcao}.`,
  };
}
