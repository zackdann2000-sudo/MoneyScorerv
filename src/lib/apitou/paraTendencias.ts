/**
 * Adaptador: série do cache do Apitou → amostra do motor de tendências.
 *
 * ============================ POR QUE ESTE CAMINHO ==========================
 * O módulo `/apitou` já guarda, de graça (zero chamada de API), a série dos
 * últimos 10 jogos de cada time no raio-x. Isso permite mostrar tendências ali
 * sem gastar um único request da ESPN.
 *
 * O que ele NÃO tem, e não fingimos que tem:
 *   • escanteios, finalizações e chutes a gol por jogo  → `null` (a métrica
 *     correspondente desaparece da lista);
 *   • divisão por 1º/2º tempo                           → `null` (1T/2T só de gols,
 *     que é o que a fonte entrega no histórico da ESPN).
 *
 * A série vem do jogo mais recente para o mais antigo e sem data. Sintetizamos
 * uma data decrescente só para o motor conseguir ordenar cronologicamente — a
 * UI nunca mostra essa data.
 */

import { gerarTendencias, type JogoAmostra, type OpcoesGerar, type Tendencia } from "../tendencias";

/** O subconjunto de `StatsTime` que este adaptador consome. */
export type SerieApitou = {
  jogos?: number;
  serie?: {
    gols?: number[];
    golsSof?: number[];
    faltas?: number[];
    faltasSof?: number[];
    amarelos?: number[];
    amarelosSof?: number[];
    impedimentos?: number[];
    impedimentosSof?: number[];
  };
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Converte a série num array de "jogos" no contrato do motor.
 *
 * O comprimento é o da série de gols (a mais confiável). Índices ausentes nas
 * outras métricas viram `null` — e `null` não entra na conta, nunca vira zero.
 */
export function amostraDaSerie(stats: SerieApitou | null | undefined): JogoAmostra[] {
  const s = stats?.serie;
  if (!s) return [];
  const base = [s.gols, s.golsSof, s.faltas, s.amarelos].filter(Array.isArray) as number[][];
  if (!base.length) return [];
  const n = Math.max(...base.map((a) => a.length));
  if (!n) return [];

  const out: JogoAmostra[] = [];
  for (let i = 0; i < n; i++) {
    /* Série é "mais recente primeiro": i=0 é o jogo de hoje. Datas sintéticas
       crescentes com n-i mantêm a ordenação cronológica do motor. */
    const dia = String(Math.max(1, n - i)).padStart(2, "0");
    out.push({
      date: `1970-01-${dia}`,
      home: false,
      gf: num(s.gols?.[i]) ?? 0,
      ga: num(s.golsSof?.[i]) ?? 0,
      htGf: null,
      htGa: null,
      corners: null,
      oppCorners: null,
      fouls: num(s.faltas?.[i]),
      oppFouls: num(s.faltasSof?.[i]),
      yellow: num(s.amarelos?.[i]),
      red: null,
      oppYellow: num(s.amarelosSof?.[i]),
      oppRed: null,
      shots: null,
      sot: null,
      offsides: num(s.impedimentos?.[i]),
    });
  }
  return out;
}

/**
 * Tendências de um confronto usando só o cache do Apitou.
 *
 * Sempre com `amostra` explícita na resposta: aqui é comum a série ter 3 a 6
 * jogos, e a UI precisa dizer isso em vez de sugerir 10.
 */
export function tendenciasDoResumo(
  casa: SerieApitou | null | undefined,
  fora: SerieApitou | null | undefined,
  opts: OpcoesGerar = {},
): { tendencias: Tendencia[]; casaJogos: number; foraJogos: number; fonte: "Apitou" } {
  const a = amostraDaSerie(casa);
  const b = amostraDaSerie(fora);
  const tendencias = gerarTendencias(a, b, { ...opts, amostra: opts.amostra ?? 10 });
  return { tendencias, casaJogos: a.length, foraJogos: b.length, fonte: "Apitou" };
}
