import { cached } from "./cache";

/* =======================================================================
   TheSportsDB — fotos de jogadores e escudos de times
   -----------------------------------------------------------------------
   Chave pública de TESTES: "123". A antiga chave "3" foi DESATIVADA
   permanentemente pela TheSportsDB (HTTP 403 — verificado em novembro/2026),
   portanto NÃO use "3".

   A chave é lida de THESPORTSDB_KEY (env) para permitir troca pela chave
   premium no Admin no futuro, sem alterar este arquivo.
   ======================================================================= */

const BASE = "https://www.thesportsdb.com/api/v1/json";
const CHAVE_TESTE = "123";
const TTL_24H = 24 * 60 * 60 * 1000;

const apiKey = () => (process.env.THESPORTSDB_KEY || "").trim() || CHAVE_TESTE;

/* Cache em memória por 24h (além do cache de URL do fetchJson). */
const g = globalThis as any;
const mem: Map<string, { at: number; v: string | null }> =
  g.__tsdbCache || (g.__tsdbCache = new Map());

const normaliza = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function tsdbGet(path: string): Promise<any> {
  return cached(
    `tsdb:${path}`,
    TTL_24H,
    async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      try {
        const res = await fetch(`${BASE}/${apiKey()}${path}`, {
          headers: { Accept: "application/json" },
          signal: ctrl.signal,
        });
        /* 403 = chave inválida/desativada; não adianta tentar de novo. */
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }
  );
}

/**
 * Foto de um jogador pelo nome.
 * Prefere `strCutout` (recorte transparente, melhor na UI) e cai para `strThumb`.
 * Retorna `null` quando não encontra — o frontend mostra as iniciais.
 */
export async function getPlayerPhoto(playerName: string): Promise<string | null> {
  const nome = String(playerName || "").trim();
  if (nome.length < 3) return null;

  const k = `p:${normaliza(nome)}`;
  const hit = mem.get(k);
  if (hit && Date.now() - hit.at < TTL_24H) return hit.v;

  const d = await tsdbGet(`/searchplayers.php?p=${encodeURIComponent(nome)}`);
  const lista: any[] = d?.player || [];

  let url: string | null = null;
  if (lista.length) {
    /* Escolhe o resultado com nome mais parecido (evita homônimo). */
    const alvo = normaliza(nome);
    const ranqueado = [...lista].sort((a, b) => {
      const na = normaliza(a?.strPlayer || "");
      const nb = normaliza(b?.strPlayer || "");
      const sa = na === alvo ? 3 : na.includes(alvo) || alvo.includes(na) ? 2 : 0;
      const sb = nb === alvo ? 3 : nb.includes(alvo) || alvo.includes(nb) ? 2 : 0;
      return sb - sa;
    });
    for (const p of ranqueado) {
      const cand = p?.strCutout || p?.strRender || p?.strThumb;
      if (cand && /^https?:\/\//i.test(String(cand))) {
        url = String(cand);
        break;
      }
    }
  }

  mem.set(k, { at: Date.now(), v: url });
  return url;
}

/**
 * Escudo de um time pelo nome (fallback — a ESPN já fornece escudos).
 * Retorna `null` quando não encontra.
 */
export async function getTeamBadge(teamName: string): Promise<string | null> {
  const nome = String(teamName || "").trim();
  if (nome.length < 2) return null;

  const k = `t:${normaliza(nome)}`;
  const hit = mem.get(k);
  if (hit && Date.now() - hit.at < TTL_24H) return hit.v;

  const d = await tsdbGet(`/searchteams.php?t=${encodeURIComponent(nome)}`);
  const lista: any[] = d?.teams || [];

  let url: string | null = null;
  for (const t of lista) {
    const cand = t?.strTeamBadge || t?.strBadge;
    if (cand && /^https?:\/\//i.test(String(cand))) {
      url = String(cand);
      break;
    }
  }

  mem.set(k, { at: Date.now(), v: url });
  return url;
}

/** Limpa o cache em memória (usado quando a chave muda no Admin). */
export function limparCacheTheSportsDb() {
  mem.clear();
}
