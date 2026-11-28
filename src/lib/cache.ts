/*
 * Cache em memória com TTL + dedupe de requisições simultâneas (evita 502 e
 * rate-limit).
 *
 * CICLO DE VIDA DO MAP — duas regras que antes não existiam:
 *
 *  1. VENCIDOS SAEM. Toda escrita de uma chave roda uma varredura das entradas
 *     cujo TTL já passou; toda LEITURA de chave vencida remove a linha na hora
 *     (o payload é guardado só para o fallback daquela chamada). Antes a entrada
 *     vencida ficava no Map para sempre: `cached()` só recusava o valor, nunca
 *     apagava, e o processo de vida longa (Termux/`next start`) crescia sem teto
 *     — as chaves incluem termo de busca, URL de fornecedor e nome de time.
 *
 *  2. TETO DE TAMANHO (LRU). O cache nunca passa de `MAX_CACHE_SIZE` entradas.
 *     Quem estoura sai pelo critério de uso: cada hit atualiza `acessado` e a
 *     entrada menos recentemente usada é a primeira a cair. Sem isso, um pico
 *     de jogos/data/termos diferentes empurrava o processo para o OOM do
 *     Android.
 */
type Entry = {
  /** Quando o payload foi gravado — base do TTL e da idade publicada. */
  at: number;
  ttl: number;
  data: any;
  /** Último acesso (hit ou leitura vencida). Base do desempate do LRU. */
  acessado?: number;
};
const g = globalThis as any;
const store: Map<string, Entry> = g.__gsCache || (g.__gsCache = new Map());
const inflight: Map<string, Promise<any>> = g.__gsInflight || (g.__gsInflight = new Map());

/**
 * Teto de entradas do cache em memória.
 *
 * 500 é folgado para o volume real (dezenas de jogos × alguns endpoints, mais
 * busca e times) e pequeno o bastante para morar em memória de celular. O LRU
 * garante que o que fica são as chaves em uso — não as primeiras gravadas.
 */
export const MAX_CACHE_SIZE = 500;

/** Relógio injetável (teste) — o padrão é sempre `Date.now()`. */
const agoraMs = () => Date.now();

/** Remove as entradas vencidas; `exceto` protege a chave que acabou de ser lida/gravada. */
function purgarVencidas(exceto?: string): void {
  const agora = agoraMs();
  for (const [chave, entrada] of store) {
    if (chave === exceto) continue;
    if (agora - entrada.at >= entrada.ttl) store.delete(chave);
  }
}

/** Despeja as entradas menos recentemente usadas até caber no teto. */
function podarExcedente(): void {
  while (store.size > MAX_CACHE_SIZE) {
    let alvo: string | null = null;
    let maisVelho = Number.POSITIVE_INFINITY;
    for (const [chave, entrada] of store) {
      const usada = entrada.acessado ?? entrada.at;
      if (usada < maisVelho) {
        maisVelho = usada;
        alvo = chave;
      }
    }
    if (!alvo) return;
    store.delete(alvo);
  }
}

/** Grava uma entrada aplicando as duas regras (varredura + teto). */
function gravar(chave: string, entrada: Entry): void {
  store.set(chave, entrada);
  purgarVencidas(chave);
  podarExcedente();
}

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
    const idade = Math.max(0, agoraMs() - entry.at);
    if (maisAntiga == null || idade > maisAntiga) maisAntiga = idade;
  }
  return maisAntiga;
}

export async function cached<T = any>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const agora = agoraMs();
  const hit = store.get(key);
  let vencida: Entry | undefined;

  if (hit) {
    if (agora - hit.at < hit.ttl) {
      // Hit: marca uso para o LRU e devolve.
      hit.acessado = agora;
      return hit.data;
    }
    /* Vencida: sai do Map JÁ (é o "consulte e apague" do TTL), mas o payload
       fica nesta variável para o fallback caso a busca nova falhe. */
    vencida = hit;
    store.delete(key);
  }

  const flying = inflight.get(key);
  if (flying) return flying;
  const p = fn()
    .then((data) => {
      const t = agoraMs();
      gravar(key, { at: t, ttl: ttlMs, data, acessado: t });
      inflight.delete(key);
      return data;
    })
    .catch((e) => {
      inflight.delete(key);
      /* stale fallback: melhor dado antigo do que erro. A entrada volta para o
         Map (com o `at` original) para servir as próximas chamadas enquanto o
         fornecedor não voltar — ela morre na próxima varredura/LRU. */
      if (vencida) {
        vencida.acessado = agoraMs();
        gravar(key, vencida);
        return vencida.data;
      }
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
 * Cabeçalhos de uma rota que serve dado de partida AO VIVO.
 *
 * Ao vivo → `no-store`: o snapshot interno da ESPN já espera 30 s
 * (`getSummaryRaw` com state "in"), e somar cache de navegador/CDN em cima disso
 * fazia placar e minuto divergirem entre o topo da tela e os cards. Encerrado →
 * o dado não muda mais, então pode ser cacheado pelo cliente.
 */
export function headersAoVivo(aoVivo: boolean, ttlParadoSec = 600): Record<string, string> {
  return aoVivo
    ? { "Cache-Control": "no-store, max-age=0" }
    : { "Cache-Control": `private, max-age=${ttlParadoSec}, stale-while-revalidate=60` };
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