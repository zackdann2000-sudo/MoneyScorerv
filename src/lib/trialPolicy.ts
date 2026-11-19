/**
 * Política de acesso no cadastro (pura — sem DB, sem rede).
 *
 * Regra anti-fraude: o teste VIP de 24h é concedido **uma única vez por
 * dispositivo/IP**. Se o device_id ou o IP já apareceram em outra conta, a
 * nova conta nasce `free` (sem expiração, sem bônus).
 */

export const TRIAL_HORAS = 24;
/** Vitalício (mesma convenção de `isLifetime`: ano >= 2090). */
export const EXPIRA_VITALICIO = new Date("2099-12-31T00:00:00Z");

export type Acesso = {
  role: "user" | "owner";
  plan: "free" | "vip";
  expiresAt: Date | null;
};

export function decidirAcesso(opts: {
  isOwner: boolean;
  reusado: boolean;
  /** Injetável para teste. */
  agora?: Date;
}): Acesso {
  if (opts.isOwner) return { role: "owner", plan: "vip", expiresAt: EXPIRA_VITALICIO };
  if (opts.reusado) return { role: "user", plan: "free", expiresAt: null };
  const agora = opts.agora ?? new Date();
  return { role: "user", plan: "vip", expiresAt: new Date(agora.getTime() + TRIAL_HORAS * 3600 * 1000) };
}