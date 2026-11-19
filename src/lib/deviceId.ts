/**
 * Identificador de dispositivo (anti-fraude do trial de 24h).
 *
 * Gerado uma vez por navegador e guardado em localStorage. Não identifica
 * pessoa: é só um UUID aleatório usado para impedir que o mesmo aparelho
 * ganhe o teste VIP mais de uma vez.
 *
 * Limitação honesta: localStorage pode ser limpo (modo anônimo, cache) —
 * por isso o backend também checa o IP de cadastro como segunda barreira.
 */
export const DEVICE_KEY = "gs_device_id";

/** UUID v4 com fallback para navegadores sem `crypto.randomUUID`. */
function novoId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* segue para o fallback */
  }
  // RFC 4122 v4 manual
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Lê o device_id salvo ou cria+salva um novo. `null` no servidor. */
export function lerOuCriarDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const salvo = localStorage.getItem(DEVICE_KEY);
    if (salvo && /^[A-Za-z0-9_-]{8,64}$/.test(salvo)) return salvo;
    const id = novoId();
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    // localStorage bloqueado (modo restrito/iframe): devolve só em memória
    return novoId();
  }
}