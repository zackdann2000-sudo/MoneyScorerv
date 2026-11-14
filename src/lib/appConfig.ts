export const APP_NAME = "GreenScore";
export const APP_DOMAIN = "greenscore.app";
export const TRIAL_DAYS = 2;
export const OWNER_EMAILS = ["admin@greenscore.app", "zackdann2000@gmail.com"];

export function isOwnerEmail(email?: string | null) {
  return OWNER_EMAILS.includes(String(email || "").trim().toLowerCase());
}

export function isLifetime(date?: Date | string | null) {
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  return d.getFullYear() >= 2090;
}