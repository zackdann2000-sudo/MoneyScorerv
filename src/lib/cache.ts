/* Cache em memória com TTL + dedupe de requisições simultâneas (evita 502 e rate-limit) */
type Entry = { at: number; ttl: number; data: any };
const g = globalThis as any;
const store: Map<string, Entry> = g.__gsCache || (g.__gsCache = new Map());
const inflight: Map<string, Promise<any>> = g.__gsInflight || (g.__gsInflight = new Map());

/**
 * Idade (ms) do payload MAIS ANTIGO em cache cuja chave contém `trecho`.
 *
 * Serve para dizer ao usuário há quanto tempo a instância vem servindo aquele
 * tipo de dado. Devolve `null` quando não há nada em cache (cold start) — aí a
 * tela acabou de buscar tudo, e quem chama decide mostrar "agora".
 *
 * É pessimista de propósito: pegando o mais antigo, nunca prometemos frescor
 * que não temos.
 */
export function idadeMaisAntiga(trecho: string): number | null {
  let maisAntiga: number | null = null;
  for (const [key, entry] of store) {
    if (!key.includes(trecho)) continue;
    const idade = Math.max(0, Date.now() - entry.at);
    if (maisAntiga == null || idade > maisAntiga) maisAntiga = idade;
  }
  return maisAntiga;
}

export async function cached<T = any>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.data;
  const flying = inflight.get(key);
  if (flying) return flying;
  const p = fn()
    .then((data) => {
      store.set(key, { at: Date.now(), ttl: ttlMs, data });
      inflight.delete(key);
      return data;
    })
    .catch((e) => {
      inflight.delete(key);
      if (hit) return hit.data; // stale fallback: melhor dado antigo do que erro
      throw e;
    });
  inflight.set(key, p);
  return p;
}

export async function fetchJson(url: string, opts: RequestInit = {}, ttlMs = 45000, key?: string): Promise<any> {
  return cached(key || url, ttlMs, async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        ...opts,
        signal: ctrl.signal,
        headers: {
          Accept: "application/json",
          // ESPN (Akamai) devolve 403 sem UA de navegador em /scoreboard?dates=.
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
          ...(opts.headers || {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}${new URL(url).pathname}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  });
}

export function cacheBust(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}

/**
 * Leitura **não-bloqueante** do cache: devolve o que já está fresco, sem
 * disparar nenhuma requisição.
 *
 * Serve para telas que precisam de contexto já buscado por outra rota (a busca
 * global usa o placar do dia que o GamesBoard carregou). Se nada estiver em
 * cache, devolve lista vazia — quem chama decide mostrar só o que tem.
 */
export function peek<T = any>(prefixo: string): { key: string; data: T; idadeMs: number }[] {
  const agora = Date.now();
  const fora: { key: string; data: T; idadeMs: number }[] = [];
  for (const [key, entry] of store) {
    if (!key.startsWith(prefixo)) continue;
    if (agora - entry.at >= entry.ttl) continue;
    fora.push({ key, data: entry.data as T, idadeMs: agora - entry.at });
  }
  return fora;
}