/**
 * Regras PURAS sobre a amostra que alimenta o motor (sem banco, sem rede).
 *
 * Por que este arquivo existe: o sintoma que apareceu em produção foi "todos
 * os jogos da liga com a mesma análise". A causa não era o motor — era a
 * entrada: sem jogo finalizado no banco, `recentMatches` devolvia lista vazia
 * para os dois times e o motor caía na média da liga, que é a MESMA constante
 * para todo jogo da competição. O sintoma é dado degenerado, não bug de soma.
 *
 * Aqui ficam as duas decisões que impedem isso, isoladas para poderem ser
 * testadas sem tocar o Postgres:
 *  - `amostraUtilizavel`: com 0/0 de histórico não se publica análise.
 *  - `mediaLiga`: média de gols só vale com amostra mínima e com gols; caso
 *    contrário é `null` e quem chama usa o padrão neutro (nunca 0.6/0.6).
 */

/** Jogos finalizados: prorrogação e pênaltis também são resultado. */
export const ESTADOS_FINALIZADOS = ["FT", "AET", "PEN"] as const;

/** Pisos de amostra para a média da liga virar número de verdade. */
export const MIN_JOGOS_MEDIA_LIGA = 6;

/** Média neutra usada quando a liga ainda não tem histórico confiável. */
export const MEDIA_LIGA_PADRAO = 1.35;
export const MEDIA_MANDANTE_PADRAO = 1.5;

export type Amostra = { home: number; away: number };

/**
 * O motor tem alguma coisa específica deste jogo?
 *
 * Com 0/0 o resultado é função só da média da liga — ou seja, igual para todos
 * os jogos da competição. Publicar isso é publicar dado degenerado; a análise
 * não é gerada (o job conta como "skipped" e a UI diz "em preparação").
 */
export function amostraUtilizavel(amostra: Amostra): boolean {
  return Number(amostra.home) > 0 || Number(amostra.away) > 0;
}

/** Resumo salvo sem amostra nenhuma — marcado para ser regerado quando houver dado. */
export function resumoDeGenerado(resumo: { sampleHome?: number | null; sampleAway?: number | null } | null | undefined): boolean {
  if (!resumo || resumo.sampleHome == null || resumo.sampleAway == null) return false;
  return Number(resumo.sampleHome) <= 0 && Number(resumo.sampleAway) <= 0;
}

/**
 * Média de gols a partir de soma e contagem.
 *
 * Devolve `null` — e não zero — quando a amostra é pequena ou quando não houve
 * gol algum na amostra: os dois casos são "não sei", e "não sei" tem de virar
 * o padrão neutro, nunca uma liga de 0,6 gol por time que rebaixa todo xG.
 */
export function mediaLiga(totalGols: number, jogos: number, minJogos = MIN_JOGOS_MEDIA_LIGA): number | null {
  if (!Number.isFinite(totalGols) || !Number.isFinite(jogos)) return null;
  if (jogos < minJogos) return null;
  const media = totalGols / jogos;
  if (!Number.isFinite(media) || media <= 0) return null;
  return media;
}
