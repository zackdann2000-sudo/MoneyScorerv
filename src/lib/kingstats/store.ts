/**
 * Cache do módulo King STATS no Neon.
 *
 * Mesmo padrão do apitou: TTL de 15 min com stale-while-revalidate. O banco é a
 * fonte de verdade entre invocações serverless; a memória do processo é só um
 * atalho para não bater no Neon a cada request na mesma instância.
 *
 * Duas chaves por dia:
 *   jogos:YYYYMMDD — lista de jogos (barata, uma chamada à fonte)
 *   oport:YYYYMMDD — oportunidades calculadas (cara: exige o histórico de
 *                    centenas de jogos, por isso é cacheada à parte)
 */
import type { Jogo } from "@/lib/kingstats";
import type { Oportunidade } from "@/lib/kingstats/modelo";

export const CACHE_TTL_MS = 15 * 60 * 1000;

type Envelope<T> = { dados: T; quando: number };
type Linha = { payload: unknown; updated_at: Date | string };

const memoria = new Map<string, Envelope<unknown>>();

function doPayload<T>(payload: unknown): T | null {
  // Gravamos o envelope inteiro em `payload` para preservar o `quando`
  // (updated_at do banco pode ser arredondado e não serve para TTL fino).
  const e = payload as Envelope<T> | null;
  if (!e || typeof e !== "object" || !("dados" in e) || !("quando" in e)) return null;
  return e.dados;
}

/** Lê um cache. Devolve `{ dados, idade }` ou null. */
export async function ler<T>(key: string): Promise<{ dados: T; idade: number } | null> {
  const emMem = memoria.get(key) as Envelope<T> | undefined;
  if (emMem && Date.now() - emMem.quando < CACHE_TTL_MS) {
    return { dados: emMem.dados, idade: Date.now() - emMem.quando };
  }

  try {
    const { db } = await import("@/db");
    const { kingstatsCache } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");

    const rows = (await db
      .select()
      .from(kingstatsCache)
      .where(eq(kingstatsCache.cacheKey, key))
      .limit(1)) as unknown as Linha[];

    if (!rows.length) return null;
    const dados = doPayload<T>(rows[0].payload);
    if (dados === null) return null;

    const quando = (rows[0].payload as Envelope<T>).quando ?? Date.now();
    memoria.set(key, { dados, quando });
    return { dados, idade: Date.now() - quando };
  } catch (e) {
    console.error("[kingstats] falha ao ler cache:", e instanceof Error ? e.message : e);
    return emMem ? { dados: emMem.dados, idade: Date.now() - emMem.quando } : null;
  }
}

/** Grava um cache. */
export async function gravar<T>(key: string, kind: string, dados: T): Promise<void> {
  const envelope: Envelope<T> = { dados, quando: Date.now() };
  memoria.set(key, envelope);

  try {
    const { db } = await import("@/db");
    const { kingstatsCache } = await import("@/db/schema");

    await db
      .insert(kingstatsCache)
      .values({
        cacheKey: key,
        kind,
        geradoEm: new Date().toISOString(),
        payload: envelope as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: kingstatsCache.cacheKey,
        set: {
          kind,
          geradoEm: new Date().toISOString(),
          payload: envelope as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        },
      });
  } catch (e) {
    // Falha ao gravar não derruba a resposta: o cálculo já foi feito.
    console.error("[kingstats] falha ao gravar cache:", e instanceof Error ? e.message : e);
  }
}

/* ------------------------- helpers por domínio --------------------------- */

export const chaveJogos = (dayKey: string) => `jogos:${dayKey}`;
export const chaveOport = (dayKey: string) => `oport:${dayKey}`;

export type PayloadJogos = { dayKey: string; geradoEm: string; jogos: Jogo[] };

export async function lerJogos(dayKey: string) {
  return ler<PayloadJogos>(chaveJogos(dayKey));
}
export async function gravarJogos(p: PayloadJogos) {
  return gravar(chaveJogos(p.dayKey), "jogos", p);
}

export type PayloadOport = {
  dayKey: string;
  geradoEm: string;
  analisados: number;
  /** A varredura não cobriu todos os jogos do alvo (fonte sem histórico ou prazo). */
  parcial?: boolean;
  /** Mensagem para a UI quando não há nada a calcular (ex.: dia sem jogos). */
  aviso?: string;
  oportunidades: Oportunidade[];
};

export async function lerOport(dayKey: string) {
  return ler<PayloadOport>(chaveOport(dayKey));
}
export async function gravarOport(p: PayloadOport) {
  return gravar(chaveOport(p.dayKey), "oport", p);
}
