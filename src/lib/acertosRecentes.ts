/**
 * NÚCLEO PURO dos acertos recentes ("IA Acertou os 3 últimos").
 *
 * Fica separado de `trackRecord.ts` (que fala com o banco) porque a regra é
 * pura: dado o histórico já liquidado, dizer se o time acertou os últimos N
 * palpites naquele mercado.
 *
 * Regra: olha a série MAIS RECENTE do time no mercado, exige pelo menos
 * `ACERTOS_MINIMOS` palpites liquidados e marca `true` somente se TODOS os
 * últimos `ACERTOS_JANELA` foram green. Um red no meio derruba o selo — é o
 * ponto: o selo precisa ser difícil de ganhar, senão não informa nada.
 */

export const ACERTOS_JANELA = 5;
export const ACERTOS_MINIMOS = 3;

export type ResultadoLiquidado = {
  homeName: string;
  awayName: string;
  mercado: string;
  status: string; // "green" | "red" | "pendente"
  matchDate?: string | null;
};

export type SerieAcertos = {
  /** Quantos greens no fim da série (contando do mais recente para trás). */
  verdes: number;
  /** Quantos palpites liquidados entraram na série. */
  total: number;
  /** true = pelo menos 3 greens seguidos no topo da série. */
  acertosRecentes: boolean;
};

/** Normaliza nome de time para casar "São Paulo" com "Sao Paulo". */
export function normalizarTime(nome: string): string {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Times a que um palpite pertence.
 * Mercados "home"/"away" falam de um time específico; os neutros (gols, BTTS,
 * cartões, escanteios) contam para os dois times do jogo.
 */
export function timesDoPalpite(r: ResultadoLiquidado): string[] {
  const casa = normalizarTime(r.homeName);
  const fora = normalizarTime(r.awayName);
  if (!casa && !fora) return [];
  if (r.mercado === "home") return casa ? [casa] : [];
  if (r.mercado === "away") return fora ? [fora] : [];
  if (r.mercado === "draw") return []; // empate não é de nenhum time
  return [casa, fora].filter(Boolean);
}

export const chaveAcerto = (time: string, mercado: string) => `${normalizarTime(time)}|${mercado}`;

/**
 * Constrói o mapa `time|mercado → série` a partir do histórico JÁ ordenado do
 * mais recente para o mais antigo (a ordem é responsabilidade de quem chama).
 *
 * Só entram linhas liquidadas (green/red); pendentes são ignoradas porque não
 * dizem nada sobre acerto.
 */
export function montarSeries(
  rows: ResultadoLiquidado[],
  opts: { janela?: number; minimo?: number } = {},
): Map<string, SerieAcertos> {
  const janela = Math.max(1, opts.janela ?? ACERTOS_JANELA);
  const minimo = Math.max(1, opts.minimo ?? ACERTOS_MINIMOS);
  const porChave = new Map<string, string[]>(); // status na ordem recebida

  for (const r of rows) {
    if (r.status !== "green" && r.status !== "red") continue;
    for (const time of timesDoPalpite(r)) {
      const k = chaveAcerto(time, r.mercado);
      const arr = porChave.get(k) || [];
      arr.push(r.status);
      porChave.set(k, arr);
    }
  }

  const out = new Map<string, SerieAcertos>();
  for (const [k, statuses] of porChave) {
    const janelaStatus = statuses.slice(0, janela);
    let verdes = 0;
    for (const s of janelaStatus) {
      if (s === "green") verdes++;
      else break; // um red quebra a sequência
    }
    const total = janelaStatus.length;
    out.set(k, {
      verdes,
      total,
      acertosRecentes: total >= minimo && verdes >= minimo && verdes === total,
    });
  }
  return out;
}

/** Consulta a série de um palpite concreto (retorna null quando não há base). */
export function serieDoPalpite(
  mapa: Map<string, SerieAcertos>,
  homeName: string,
  awayName: string,
  mercado: string,
): { serie: SerieAcertos; time: string } | null {
  const times = timesDoPalpite({ homeName, awayName, mercado, status: "green" });
  for (const t of times) {
    const s = mapa.get(chaveAcerto(t, mercado));
    if (s) return { serie: s, time: t };
  }
  return null;
}

/** Texto curto para a UI: "3/3". */
export function rotuloSerie(s: SerieAcertos): string {
  return `${s.verdes}/${s.total}`;
}
