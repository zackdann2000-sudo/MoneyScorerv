/**
 * Quota diária — regra de negócio PURA (sem DB, sem rede).
 *
 * Troca o "trial de 24h" pelo modelo que o Scoore usa e que converte:
 * o acesso é gratuito **todo dia**, mas limitado. Free vê 1 análise por dia;
 * para ver a segunda, ou espera amanhã, ou assina. Isso mantém o usuário
 * voltando (hábito diário) e cria o atrito no momento de maior desejo — o
 * segundo card — em vez de no fim de um dia inteiro.
 *
 * Preços/períodos continuam em `planos.ts`. Aqui só mora o LIMITE.
 */

export type QuotaPlano = "free" | "starter" | "pro" | "expert";

/** Limite de análises por dia em cada plano. */
export const QUOTA_POR_PLANO: Record<QuotaPlano, number> = {
  free: 1,
  starter: 6,
  pro: 20,
  expert: 999,
};

/** Quem paga (VIP/trial/admin) nunca é barrado pela quota. */
export const QUOTA_ILIMITADA = 999;

export const ROTULO_PLANO: Record<QuotaPlano, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  expert: "Expert",
};

/** Normaliza o `plan` do banco (que ainda aceita "trial"/"vip") num tier. */
export function planoDeQuota(plan: string | null | undefined): QuotaPlano {
  switch (plan) {
    case "starter":
      return "starter";
    case "pro":
      return "pro";
    case "expert":
    case "vip":
      return "expert";
    default:
      return "free";
  }
}

/**
 * Plano EFETIVO para fins de quota — rebaixa na leitura, sem migration.
 *
 * `users.plan` guarda "vip" desde o teste de 24h e o Stripe grava "vip" em
 * cada pagamento. Quando o acesso vence, **nada** faz UPDATE em `plan`: a
 * linha continua "vip" para sempre. Se a quota lesse o plano cru, todo
 * ex-trial (e todo ex-assinante) viraria `expert` — 999/dia, badge
 * "Ilimitado" — e a regra de 1 análise grátis por dia nunca valeria justamente
 * para quem acabou de perder o acesso. Era o furo da conversão.
 *
 * Regra:
 *  - o plano PAGO/atribuído continua valendo enquanto `expiresAt` não vence;
 *  - quando vence, o plano efetivo cai para `free` (1/dia);
 *  - `expiresAt` ausente (undefined) ou null = acesso sem prazo (vitalício,
 *    concessão manual do admin): não rebaixa — o gate de acesso já cuida;
 *  - admin nunca é rebaixado aqui.
 *
 * O rebaixamento é só na leitura: `plan` no banco não é tocado, então
 * reativar a assinatura volta a valer na hora, sem backfill nenhum.
 */
export function planoEfetivo(opts: {
  plan: string | null | undefined;
  /** Data de fim do acesso. `undefined` = "não julgar". */
  expiresAt?: Date | string | null;
  /** Injetável para teste. */
  agora?: Date;
}): QuotaPlano {
  const base = planoDeQuota(opts.plan);
  if (base === "free") return "free";
  if (opts.expiresAt === undefined || opts.expiresAt === null) return base;
  const fim = opts.expiresAt instanceof Date ? opts.expiresAt : new Date(opts.expiresAt);
  if (Number.isNaN(fim.getTime())) return base;
  const agora = opts.agora ?? new Date();
  return fim.getTime() > agora.getTime() ? base : "free";
}

export type EstadoQuota = {
  plano: QuotaPlano;
  /** Limite do plano (999 = ilimitado na prática). */
  limite: number;
  usado: number;
  /** Quantas análises ainda pode abrir hoje. */
  restante: number;
  /** true quando `restante === 0`. */
  esgotada: boolean;
  /** Ilimitado de verdade (admin/VIP) — a UI não mostra contador. */
  ilimitada: boolean;
  /** Dia (YYYY-MM-DD, fuso de Brasília) a que este contador se refere. */
  dia: string;
};

/**
 * Calcula o estado da quota com VIRADA DE DIA na leitura.
 *
 * `dia` é o dia em que o contador foi gravado. Se for diferente de `hoje`,
 * o `usado` volta a zero — é isso que dispensa cron de reset: o dia só é
 * "consumido" quando alguém lê.
 */
export function estadoQuota(opts: {
  plan: string | null | undefined;
  /** Limite gravado na linha (pode divergir do plano em promo/manual). */
  dailyQuota?: number | null;
  usado?: number | null;
  /** Dia gravado no contador (YYYY-MM-DD) — string vazia em conta nova. */
  dia?: string | null;
  /** Dia de hoje (YYYY-MM-DD, Brasília). Injetável para teste. */
  hoje: string;
  /** Admin/owner: acesso total, contador não se aplica. */
  ilimitada?: boolean;
  /**
   * Data de fim do acesso. Quando informada, o plano é rebaixado na leitura
   * se já venceu (ver `planoEfetivo`). Omitir mantém o plano cru.
   */
  expiresAt?: Date | string | null;
  /** Injetável para teste. */
  agora?: Date;
}): EstadoQuota {
  const plano = "expiresAt" in opts
    ? planoEfetivo({ plan: opts.plan, expiresAt: opts.expiresAt, agora: opts.agora })
    : planoDeQuota(opts.plan);
  const limite = Math.max(1, opts.dailyQuota ?? QUOTA_POR_PLANO[plano]);
  const ilimitada = !!opts.ilimitada || limite >= QUOTA_ILIMITADA || plano === "expert";
  const mesmoDia = (opts.dia ?? "") === opts.hoje && !!opts.dia;
  const usado = ilimitada ? 0 : mesmoDia ? Math.max(0, opts.usado ?? 0) : 0;
  const restante = ilimitada ? QUOTA_ILIMITADA : Math.max(0, limite - usado);
  return { plano, limite, usado, restante, esgotada: !ilimitada && restante === 0, ilimitada, dia: opts.hoje };
}

/** Dia de hoje (YYYY-MM-DD) no fuso de Brasília — o mesmo do resto do app. */
export function hojeSp(agora: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  } catch {
    return agora.toISOString().slice(0, 10);
  }
}

/** Texto curto para o card/badge: "2 de 6 hoje". */
export function textoQuota(e: EstadoQuota): string {
  if (e.ilimitada) return "Ilimitado";
  return `${e.usado} de ${e.limite} hoje`;
}
