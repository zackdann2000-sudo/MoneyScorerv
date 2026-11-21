/**
 * Política de acesso no cadastro (pura — sem DB, sem rede).
 *
 * Regra anti-fraude do teste VIP de 24h:
 *  1. `device_id` é o bloqueio PRIMÁRIO: se o aparelho já ganhou o teste
 *     alguma vez, a nova conta nasce `free`.
 *  2. `registration_ip` é o bloqueio SECUNDÁRIO e agora **binário**: um IP já
 *     premiado não dá um segundo trial. Continua sem punir CGNAT/família, porque
 *     a conta é criada do mesmo jeito — ela só nasce `free`. Bloquear a criação
 *     seria punir rede compartilhada; negar o bônus só tira o incentivo de
 *     farmar contas.
 *
 * Dono (owner) é sempre vitalício e nunca cai na regra.
 */

export const TRIAL_HORAS = 24;
/**
 * Contas já criadas no mesmo IP a partir das quais o bônus é negado.
 * 1 = "um trial por IP": a primeira conta do IP ganha, a segunda em diante não.
 */
export const MAX_CONTAS_POR_IP = 1;
/** Vitalício (mesma convenção de `isLifetime`: ano >= 2090). */
export const EXPIRA_VITALICIO = new Date("2099-12-31T00:00:00Z");

export type Acesso = {
  role: "user" | "owner";
  plan: "free" | "vip";
  expiresAt: Date | null;
};

/** Motivo do bloqueio do bônus (útil para log/telemetria). */
export type MotivoBloqueio = "device" | "ip" | null;

export function decidirAcesso(opts: {
  isOwner: boolean;
  /** O mesmo device_id já existe em outra conta. */
  reusado: boolean;
  /** Quantas contas já foram criadas com este IP (antes desta). */
  contasNoIp?: number;
  /** Injetável para teste. */
  agora?: Date;
}): Acesso {
  const { isOwner, reusado, contasNoIp = 0 } = opts;
  if (isOwner) return { role: "owner", plan: "vip", expiresAt: EXPIRA_VITALICIO };
  if (reusado || contasNoIp >= MAX_CONTAS_POR_IP) {
    return { role: "user", plan: "free", expiresAt: null };
  }
  const agora = opts.agora ?? new Date();
  return { role: "user", plan: "vip", expiresAt: new Date(agora.getTime() + TRIAL_HORAS * 3600 * 1000) };
}

/** Explica por que o bônus foi negado (null = bônus concedido). */
export function motivoBloqueio(opts: {
  isOwner: boolean;
  reusado: boolean;
  contasNoIp?: number;
}): MotivoBloqueio {
  if (opts.isOwner) return null;
  if (opts.reusado) return "device";
  if ((opts.contasNoIp ?? 0) >= MAX_CONTAS_POR_IP) return "ip";
  return null;
}