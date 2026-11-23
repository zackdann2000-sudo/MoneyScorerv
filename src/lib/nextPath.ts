/**
 * Saneamento do destino pós-checkout (`?next=`).
 *
 * Aceita só caminho interno absoluto. Qualquer coisa com esquema, host ou
 * caractere de controle cai no fallback — senão `?next=//evil.com` viraria
 * open redirect e o Stripe entregaria o cliente pagante a outro site.
 */
export const NEXT_FALLBACK = "/jogos";

export function sanitizeNext(raw: string | null | undefined, fallback = NEXT_FALLBACK): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v.startsWith("/")) return fallback;
  // "//host" e "/\host" são interpretados como host pelo navegador.
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  // Quebra de linha/controle corromperia o header Location.
  if (/[\u0000-\u001f\u007f]/.test(v)) return fallback;
  // Não devolve para o próprio checkout nem para a tela de planos em loop.
  if (v.startsWith("/planos")) return fallback;
  return v;
}

/** Monta URL interna com um parâmetro extra, preservando query/hash existentes. */
export function comParametro(path: string, chave: string, valor: string): string {
  const [semHash, hash] = path.split("#");
  const sep = semHash.includes("?") ? "&" : "?";
  return `${semHash}${sep}${encodeURIComponent(chave)}=${encodeURIComponent(valor)}${hash ? `#${hash}` : ""}`;
}
