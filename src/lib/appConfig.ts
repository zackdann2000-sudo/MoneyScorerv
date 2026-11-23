export const APP_NAME = "GreenScore";
export const APP_DOMAIN = "greenscore.app";
export { TRIAL_HORAS } from "./trialPolicy";

/** Compat: o teste agora é de 24h (1 dia). */
export const TRIAL_DAYS = 1;

/**
 * Emails com poder de owner, em `OWNER_EMAILS` (separados por vírgula).
 *
 * Vem do ambiente de propósito: o repositório é público e email pessoal
 * hardcoded vira dado vazado + porta dos fundos silenciosa. Se a env faltar, a
 * lista fica vazia e ninguém é owner por email — o acesso continua pelos
 * usuários com `users.role = 'owner'` (ver src/lib/auth.ts).
 */
export const OWNER_EMAILS: string[] = (process.env.OWNER_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isOwnerEmail(email?: string | null) {
  return OWNER_EMAILS.includes(String(email || "").trim().toLowerCase());
}

export function isLifetime(date?: Date | string | null) {
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getFullYear() >= 2090;
}