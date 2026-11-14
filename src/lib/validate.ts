/**
 * Validadores manuais de entrada para as rotas de API.
 *
 * Por que não Zod: o projeto não declara `zod` no package.json (ele só aparece em
 * node_modules como dependência transitiva de drizzle-kit/next). Importar `zod`
 * aqui criaria uma "phantom dependency" — funciona hoje e quebra num `npm ci`
 * limpo. Estas funções não têm dependências e cobrem o que as rotas precisam:
 * limites de tamanho, URLs válidas e estruturas JSON conhecidas.
 */

/** Limite padrão de texto curto (ids, nomes, rótulos). */
export const MAX_STR = 255;
/** Limite de corpos de texto livre (comentários, descrições). */
export const MAX_TEXT = 2000;
/** Limite de URLs simples armazenadas (endpoints de push, logos). */
export const MAX_URL = 2048;

/**
 * Converte um valor desconhecido em string, aplicando trim e limite de tamanho.
 * Retorna null quando não é um dos tipos aceitos (evita `[object Object]`).
 */
export function str(v: unknown, max = MAX_STR): string | null {
  if (typeof v === "string") return v.trim().slice(0, max);
  if (typeof v === "number" && Number.isFinite(v)) return String(v).slice(0, max);
  return null;
}

/** String obrigatória com tamanho mínimo. Retorna null se inválida. */
export function strMin(v: unknown, min: number, max = MAX_STR): string | null {
  const s = str(v, max);
  return s && s.length >= min ? s : null;
}

/** Inteiro dentro de uma faixa. Retorna null se inválido. */
export function int(v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n >= min && n <= max ? n : null;
}

/** Número finito dentro de uma faixa (aceita decimais). */
export function num(v: unknown, min = -Infinity, max = Infinity): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return n >= min && n <= max ? n : null;
}

/** Uma string precisa estar numa lista fechada de valores permitidos. */
export function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  const s = str(v);
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : null;
}

/**
 * Valida uma URL absoluta http(s). Rejeita javascript:, data:, file: e
 * qualquer esquema não-HTTP — crítico para endpoints de push e logos.
 */
export function httpUrl(v: unknown, max = MAX_URL): string | null {
  const s = str(v, max);
  if (!s || s.length > max) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname) return null;
  return s;
}

/**
 * Valida um objeto JSON raso com chaves e tipos booleanos conhecidos
 * (usado pelas preferências de alerta). Ignora chaves desconhecidas.
 */
export function boolMap(v: unknown, allowedKeys: readonly string[], maxKeys = 40): Record<string, boolean> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length > maxKeys) return null;
  const out: Record<string, boolean> = {};
  for (const [k, val] of entries) {
    if (!allowedKeys.includes(k)) continue;
    if (typeof val !== "boolean") return null;
    out[k] = val;
  }
  return out;
}

/** Um objeto JSON genérico, com limite de chaves e profundidade rasa. */
export function plainObject(v: unknown, maxKeys = 40): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const obj = v as Record<string, unknown>;
  if (Object.keys(obj).length > maxKeys) return null;
  return obj;
}

/** Array de objetos com limite de itens, garantindo um objeto por item. */
export function objArray(v: unknown, maxItems: number, maxKeys = 20): Record<string, unknown>[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > maxItems) return null;
  const out: Record<string, unknown>[] = [];
  for (const item of v) {
    const o = plainObject(item, maxKeys);
    if (!o) return null;
    out.push(o);
  }
  return out;
}

/** Serializa e mede o tamanho em bytes de um valor JSON (proteção contra blobs). */
export function jsonBytes(v: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(v) ?? "", "utf8");
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}
