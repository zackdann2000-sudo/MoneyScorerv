export const APP_NAME = "GreenScore";
export const APP_DOMAIN = "greenscore.app";
export { TRIAL_HORAS } from "./trialPolicy";

/** Compat: o teste agora é de 24h (1 dia). */
export const TRIAL_DAYS = 1;
export const OWNER_EMAILS = ["admin@greenscore.app", "zackdann2000@gmail.com"];

export function isOwnerEmail(email?: string | null) {
  return OWNER_EMAILS.includes(String(email || "").trim().toLowerCase());
}

export function isLifetime(date?: Date | string | null) {
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getFullYear() >= 2090;
}