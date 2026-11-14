/* Cache em memória com TTL + dedupe de requisições simultâneas (evita 502 e rate-limit) */
type Entry = { at: number; ttl: number; data: any };
const g = globalThis as any;
const store: Map<string, Entry> = g.__gsCache || (g.__gsCache = new Map());
const inflight: Map<string, Promise<any>> = g.__gsInflight || (g.__gsInflight = new Map());

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
      const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { Accept: "application/json", ...(opts.headers || {}) } });
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