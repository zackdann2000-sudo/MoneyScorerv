/**
 * Formatação do contador do trial (puro — sem React, testável).
 * Ex.: 23h 59m; expirado vira "0h 00m" com `expirado: true`.
 */
export type Restante = { ms: number; horas: number; minutos: number; texto: string; expirado: boolean };

export function formatarRestante(expiresAt: string | Date, agora: number): Restante {
  const alvo = typeof expiresAt === "string" ? new Date(expiresAt).getTime() : expiresAt.getTime();
  const ms = Number.isFinite(alvo) ? alvo - agora : 0;
  const expirado = ms <= 0;
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;
  return { ms, horas, minutos, texto: `${horas}h ${String(minutos).padStart(2, "0")}m`, expirado };
}