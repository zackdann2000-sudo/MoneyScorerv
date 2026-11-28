/**
 * xG OFICIAL (API-Football) — média de gols esperados dos últimos jogos de um time.
 *
 * Fluxo:
 *   1. resolve o ID do time na API-Football pelo nome (`/teams?search=`), com
 *      igualdade EXATA do nome normalizado (sem fuzzy: "Sport" ≠ "Sporting");
 *   2. lê o cache no Neon (`team_xg_cache`, TTL 24h) — primeiro pelo nome
 *      normalizado (índice `team_xg_cache_norm_idx`) e depois pela chave;
 *   3. se vencido, puxa os últimos fixtures e o xG de cada um
 *      (`/fixtures/statistics` → type "expected_goals");
 *   4. grava no cache e devolve `{ xgFor, xgAgainst, sample }`.
 *
 * Qualquer falha (time não encontrado, cota, rede) devolve `null` — quem chama
 * cai no xG estimado da ESPN. Este módulo NÃO importa o motor, só provê o dado.
 * Nada é estimado aqui: o nome de outro clube nunca vira xG deste.
 */
import { db } from "@/db";
import { teamXgCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import { afFetch } from "./providers";
import { cached } from "./cache";

const TTL_MS = 24 * 60 * 60 * 1000;
/** Quantos jogos recentes entram na média de xG oficial. */
export const XG_AMOSTRA = 5;

export type XgOficial = {
  xgFor: number;
  xgAgainst: number;
  sample: number;
  source: "api-football";
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Valor de "expected_goals" nas estatísticas de um time de uma partida. */
function xgDoBox(box: any): number | null {
  for (const s of box?.statistics || []) {
    const ty = String(s?.type ?? "").toLowerCase();
    if (ty.includes("expected goals") || ty === "xg") {
      const v = Number(String(s?.value ?? "").replace("%", "").replace(",", "."));
      return Number.isFinite(v) ? v : null;
    }
  }
  return null;
}

/** Resolve `{ id, name }` do time na API-Football pelo nome (cache 24h em memória). */
async function resolverTime(nome: string): Promise<{ id: number; name: string } | null> {
  const alvo = norm(nome);
  if (!alvo) return null;
  return cached(`xgteam:${alvo}`, TTL_MS, async () => {
    const d = await afFetch(`/teams?search=${encodeURIComponent(nome)}`, TTL_MS);
    const arr: any[] = d?.response || [];
    /* SÓ nome normalizado idêntico. A busca da API-Football devolve times
       parecidos ("Sport" → "Sporting CP", "Real Madrid" → "Real Madrid
       Castilla"); aceitar o primeiro parcial colava o xG de OUTRO clube no
       modelo. Sem igualdade exata o time fica sem xG oficial — e o motor segue
       com o xG estimado da ESPN, que é o fallback honesto. */
    const exato = arr.find((x) => norm(String(x?.team?.name ?? "")) === alvo);
    const t = exato?.team;
    return t ? { id: Number(t.id), name: String(t.name) } : null;
  });
}

/** Média de xG oficial (a favor e contra) dos últimos jogos. `null` = indisponível. */
export async function getXgOficialCache(nomeTime: string): Promise<XgOficial | null> {
  return lerCachePorNome(nomeTime);
}

/**
 * Lê do cache do Neon apenas pelo nome do time (nenhuma chamada de API).
 *
 * A busca é um `WHERE` indexado (`team_xg_cache_norm_idx`) sobre o nome
 * normalizado — antes esta função trazia a tabela INTEIRA (`db.select()`
 * sem filtro) e comparava linha por linha em JS, duas vezes por jogo
 * analisado.
 *
 * Correspondência é EXATA: sem `includes()`. "Sport" não pega "Sporting",
 * "Real Madrid" não pega "Real Madrid Castilla". Time sem linha exata → `null`
 * (indisponível), e o motor cai para o xG estimado da ESPN em vez de usar
 * número de outro clube.
 */
async function lerCachePorNome(nomeTime: string): Promise<XgOficial | null> {
  try {
    const alvo = norm(nomeTime);
    if (!alvo) return null;
    const [row] = await db
      .select()
      .from(teamXgCache)
      .where(eq(teamXgCache.teamNameNorm, alvo))
      .limit(1);
    if (!row) return null;
    if (Date.now() - new Date(row.fetchedAt).getTime() >= TTL_MS) return null;
    return {
      xgFor: Number(row.xgFor),
      xgAgainst: Number(row.xgAgainst),
      sample: Number(row.sample),
      source: "api-football",
    };
  } catch {
    return null;
  }
}
export async function getXgOficial(nomeTime: string): Promise<XgOficial | null> {
  try {
    // 0) cache-first por nome: time já cacheado não gasta chamada de API.
    const emCache = await lerCachePorNome(nomeTime);
    if (emCache) return emCache;

    const time = await resolverTime(nomeTime);
    if (!time || !Number.isFinite(time.id)) return null;

    // 1) cache no Neon (24h)
    try {
      const [row] = await db
        .select()
        .from(teamXgCache)
        .where(eq(teamXgCache.teamId, String(time.id)))
        .limit(1);
      if (row && Date.now() - new Date(row.fetchedAt).getTime() < TTL_MS) {
        /* Linha antiga (de antes da coluna normalizada) volta a ser encontrável
           pelo nome: preenche `team_name_norm` de forma best-effort. Sem isto a
           linha ficaria invisível para `lerCachePorNome` até o TTL virar. */
        if (!row.teamNameNorm) {
          try {
            await db
              .update(teamXgCache)
              .set({ teamNameNorm: norm(row.teamName || time.name) })
              .where(eq(teamXgCache.teamId, String(time.id)));
          } catch {
            /* cache é otimização: falha não invalida o resultado */
          }
        }
        return {
          xgFor: Number(row.xgFor),
          xgAgainst: Number(row.xgAgainst),
          sample: Number(row.sample),
          source: "api-football",
        };
      }
    } catch {
      /* banco indisponível → segue para a API */
    }

    // 2) últimos jogos do time
    const fx = await afFetch(`/fixtures?team=${time.id}&last=${XG_AMOSTRA}`, TTL_MS);
    const ids: number[] = (fx?.response || [])
      .map((f: any) => Number(f?.fixture?.id))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    if (!ids.length) return null;

    // 3) xG de cada jogo
    const boxes = await Promise.all(
      ids.map((id) => afFetch(`/fixtures/statistics?fixture=${id}`, TTL_MS).catch(() => null)),
    );
    let somaFor = 0, somaContra = 0, n = 0;
    for (const b of boxes) {
      const lados: any[] = b?.response || [];
      if (lados.length < 2) continue;
      const meu = lados.find((x) => String(x?.team?.id) === String(time.id)) || lados[0];
      const outro = lados.find((x) => String(x?.team?.id) !== String(time.id)) || lados[1];
      const xf = xgDoBox(meu), xa = xgDoBox(outro);
      if (xf == null || xa == null) continue;
      somaFor += xf;
      somaContra += xa;
      n++;
    }
    if (!n) return null;

    const out: XgOficial = {
      xgFor: +(somaFor / n).toFixed(3),
      xgAgainst: +(somaContra / n).toFixed(3),
      sample: n,
      source: "api-football",
    };

    // 4) grava no cache (best-effort)
    try {
      await db
        .insert(teamXgCache)
        .values({
          teamId: String(time.id),
          teamName: time.name,
          // Chave de busca: MESMA normalização usada na leitura.
          teamNameNorm: norm(time.name),
          xgFor: out.xgFor,
          xgAgainst: out.xgAgainst,
          sample: n,
          source: "api-football",
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: teamXgCache.teamId,
          set: {
            teamName: time.name,
            teamNameNorm: norm(time.name),
            xgFor: out.xgFor,
            xgAgainst: out.xgAgainst,
            sample: n,
            source: "api-football",
            fetchedAt: new Date(),
          },
        });
    } catch {
      /* cache é otimização: falha não invalida o resultado */
    }

    return out;
  } catch {
    return null;
  }
}
