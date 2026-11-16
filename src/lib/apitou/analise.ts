/**
 * Monta a análise de props a partir do resumo gravado no banco.
 *
 * Separação de responsabilidades:
 *  - `fonte.ts`  -> baixa e reduz os dados do site
 *  - `engine.ts` -> matemática (Poisson, lambda, QI, confiança, valor)
 *  - este arquivo-> junta os dois e produz o que a UI consome
 */

import {
  analisarProp,
  classificarDesajuste,
  calcularValor,
  type AnaliseProp,
  type Desajuste,
  type LambdaInput,
} from "./engine";
import { MERCADO_STAT, statEfetiva } from "./engine";
import type { ResumoJogador, ResumoJogo } from "./fonte";

export type PropCalculada = {
  /** id estável: fixture:mercado:jogador:linha */
  chave: string;
  fixtureId: number;
  mercado: string;
  mercadoRotulo: string;
  jogador: string;
  jogadorId: number;
  time: string;
  isHome: boolean;
  pos: string;
  linha: number;
  odd: number;
  casa?: string;
  lambda: number;
  probModelo: number;
  probMercado: number;
  edge: number;
  qi: number;
  valor: number;
  confianca: number;
  kickoff: string;
  home: string;
  away: string;
  competicao: string;
  /** Média histórica usada como base (para a UI explicar de onde vem). */
  mediaBase: number;
  amostra: number;
};

/** Estatística do jogador para um mercado, com fallback para 0. */
function statDoJogador(j: ResumoJogador, mercado: string): number {
  const campo = MERCADO_STAT[mercado]?.campo;
  if (!campo) return 0;
  const bag = j as unknown as Record<string, number | undefined>;
  const direto = bag[campo];
  const bruto = typeof direto === "number"
    ? direto
    : (j.stats as Record<string, number | undefined>)?.[campo];
  if (typeof bruto !== "number" || bruto <= 0) return 0;
  return statEfetiva(mercado, bruto);
}

/**
 * Converte o jogador + mercado em entrada do motor.
 *
 * O ponto sensível: a amostra. Quando não sabemos os minutos do jogador,
 * assumimos titular (não penalizamos). Quando a média é 0, a prop é descartada
 * — Poisson com lambda 0 dá probabilidade 0 e só polui a lista.
 */
function entradaMotor(j: ResumoJogador, media: number, sedeNeutra: boolean): LambdaInput {
  const minutos = j.minutosMedios > 0 ? j.minutosMedios : 90;
  return {
    jogosTemporadaAtual: j.apps || 0,
    mediaTemporadaAtual: media,
    mediaTemporadaAnterior: media,
    minutosProjetados: minutos,
    minutosMediosTitular: minutos,
    multAdversario: j.multAdversario || 1,
    isHome: j.isHome,
    sedeNeutra,
    mediaUltimos5: media,
    mediaVsAdversario: media,
    nJogosConfrontoDireto: 0,
  };
}

/** Desvio padrão aproximado para contagens (Poisson: raiz da média). */
function desvioAproximado(media: number): number {
  return Math.max(Math.sqrt(Math.max(media, 0)), 0.3);
}

/**
 * Gera todas as props calculadas de um jogo.
 *
 * @param limiteMinimoProb descarta props improváveis (default 8%): Poisson
 *   com lambda baixo gera linhas de 0,1% de chance que ninguém quer ver.
 */
export function calcularJogo(jogo: ResumoJogo, limiteMinimoProb = 0.08): PropCalculada[] {
  const out: PropCalculada[] = [];

  for (const j of jogo.jogadores) {
    for (const [mercado, linhas] of Object.entries(j.props)) {
      const media = statDoJogador(j, mercado);
      if (!(media > 0)) continue; // sem estatística: Poisson não tem o que estimar
      if (!linhas.length) continue;

      const entrada = entradaMotor(j, media, false);
      const res = analisarProp(
        entrada,
        linhas.map((l) => ({ line: l.linha, price: l.odd })),
        desvioAproximado(media),
        false,
      );

      for (const a of res.analises) {
        if (a.probModelo < limiteMinimoProb || a.probModelo > 0.97) continue;
        out.push({
          chave: `${jogo.id}:${mercado}:${j.playerId || j.nome}:${a.line}`,
          fixtureId: jogo.id,
          mercado,
          mercadoRotulo: MERCADO_STAT[mercado]?.rotulo ?? mercado,
          jogador: j.nome,
          jogadorId: j.playerId,
          time: j.time,
          isHome: j.isHome,
          pos: j.pos,
          linha: a.line,
          odd: a.price,
          casa: linhas.find((l) => l.linha === a.line)?.casa,
          lambda: res.lambda,
          probModelo: a.probModelo,
          probMercado: a.probMercado,
          edge: a.edge,
          qi: a.qi,
          valor: a.valor,
          confianca: a.confianca,
          kickoff: jogo.kickoff,
          home: jogo.home,
          away: jogo.away,
          competicao: jogo.competicao,
          mediaBase: media,
          amostra: j.apps || 0,
        });
      }
    }
  }

  return out;
}

/** Todas as props de todos os jogos, ordenadas por valor. */
export function calcularTodas(jogos: ResumoJogo[]): PropCalculada[] {
  return jogos.flatMap((j) => calcularJogo(j)).sort((a, b) => b.valor - a.valor);
}

/**
 * Desajustes: props em que o modelo vê mais chance do que o mercado está
 * pagando. Ordenados pelo edge (vantagem), não pelo valor — queremos o que está
 * desalinhado, mesmo que a odd não seja a mais alta.
 */
export type DesajusteCalculado = Desajuste & {
  chave: string;
  jogador: string;
  fixtureId: number;
  home: string;
  away: string;
  kickoff: string;
};

export function extrairDesajustes(props: PropCalculada[], minimoEdge = 0.03): DesajusteCalculado[] {
  return props
    .filter((p) => p.edge >= minimoEdge && p.probModelo >= 0.35)
    .map((p) => {
      // Recalcula o valor aqui para manter consistência com o nível exibido.
      const valor = calcularValor(p.probModelo, p.odd);
      return {
        mercado: p.mercadoRotulo,
        linha: p.linha,
        odd: p.odd,
        probModelo: p.probModelo,
        probMercado: p.probMercado,
        edge: p.edge,
        qi: p.qi,
        valor,
        nivel: classificarDesajuste(p.edge, p.probModelo, valor),
        chave: p.chave,
        jogador: p.jogador,
        fixtureId: p.fixtureId,
        home: p.home,
        away: p.away,
        kickoff: p.kickoff,
      };
    })
    .sort((a, b) => b.edge - a.edge);
}
