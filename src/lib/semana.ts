/**
 * Semana exibida na barra de 7 dias (Segunda → Domingo).
 *
 * Módulo puro e sem I/O: recebe a data de referência (YYYY-MM-DD) e devolve os
 * sete dias da semana que a contém, já rotulados. Trabalhamos só com strings
 * YYYY-MM-DD e Date em UTC para não perder um dia no fuso de Brasília.
 */

const ROTULOS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"] as const;
const LONGOS = [
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
  "domingo",
] as const;

export type DiaSemana = {
  /** YYYY-MM-DD */
  ymd: string;
  /** SEG, TER, … */
  rotulo: string;
  /** segunda, terça, … */
  rotuloLongo: string;
  /** dia do mês com 2 dígitos */
  dia: string;
  /** mês com 2 dígitos */
  mes: string;
  /** é o dia de hoje (comparado com a referência passada) */
  hoje: boolean;
};

/** Data de hoje no fuso de Brasília (YYYY-MM-DD). */
export function hojeYmd(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Desloca um YYYY-MM-DD em N dias, sem passar por fuso local. */
export function shiftYmd(ymd: string, dias: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/**
 * Dias em que um jogo pode aparecer no feed: o dia gravado e os vizinhos.
 *
 * O horário local (America/Sao_Paulo) e o fuso do provedor discordam com
 * frequência: um jogo das 21h de sábado aparece no feed de domingo. Buscar só
 * o dia exato deixava a pick pendente para sempre.
 */
export function diasCandidatos(ymd: string): string[] {
  return [ymd, shiftYmd(ymd, -1), shiftYmd(ymd, 1)];
}

/** 0 = segunda … 6 = domingo (o getUTCDay devolve 0 no domingo). */
export function indiceDaSemana(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (dow + 6) % 7;
}

/**
 * Os 7 dias (Segunda → Domingo) da semana que contém `ref`.
 * `hoje` é só para marcar o dia atual na barra — não muda a semana.
 */
export function diasDaSemana(ref: string = hojeYmd(), hoje: string = hojeYmd()): DiaSemana[] {
  const base = shiftYmd(ref, -indiceDaSemana(ref));
  return Array.from({ length: 7 }, (_, i) => {
    const ymd = shiftYmd(base, i);
    return {
      ymd,
      rotulo: ROTULOS[i],
      rotuloLongo: LONGOS[i],
      dia: ymd.slice(8, 10),
      mes: ymd.slice(5, 7),
      hoje: ymd === hoje,
    };
  });
}

/** Rótulo curto de uma data qualquer: "SEX 21/11". */
export function rotuloData(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  const i = indiceDaSemana(ymd);
  return `${ROTULOS[i]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** A data pertence à semana de referência? (usado para decidir se rola a barra) */
export function mesmaJanela(ref: string, ymd: string): boolean {
  const dias = diasDaSemana(ref, ref);
  return dias.some((d) => d.ymd === ymd);
}
