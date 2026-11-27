/**
 * Player Props — camada de DADOS (API-Football + cache Neon 24h).
 *
 * Para cada time: resolve o ID, pega os últimos N jogos encerrados e baixa
 * `/fixtures/players` de cada um, agregando as estatísticas individuais em
 * ordem cronológica (mais antigo → mais recente). O resultado normalizado vai
 * para `player_props_cache` com TTL de 24h, então abrir a aba não gasta cota.
 *
 * Cota: N jogos × 2 times + 2 buscas de time por partida na primeira visita.
 * `PROPS_MAX_JOGOS` (default 4) e `PLAYER_PROPS_DISABLED=1` controlam isso.
 */
import { db } from "@/db";
import { playerPropsCache } from "@/db/schema";
import { eq } from "drizzle-orm";
import { afFetch } from "./providers";
import type { JogadorAmostra, JogoValores } from "./playerPropsEngine";

const TTL_MS = 24 * 60 * 60 * 1000;
export const PROPS_MAX_JOGOS = Math.max(3, Math.min(10, Number(process.env.PROPS_MAX_JOGOS || 4)));
export const PROPS_DISABLED = process.env.PLAYER_PROPS_DISABLED === "1";

export type JogadorCache = {
  id: string;
  nome: string;
  posicao: string;
  /** Foto oficial do fornecedor (opcional; cache antigo pode não ter). */
  foto?: string | null;
  jogos: JogoValores[];
};

export type PayloadTime = {
  teamId: string;
  teamName: string;
  sample: number;
  /** Janela que foi PEDIDA na coleta. Se a fonte só tinha 4 de 10, guarda 10
   * aqui para não repetir a chamada a cada abertura — a amostra real segue 4. */
  janela?: number;
  /** Temporada de onde vieram os jogos (null = últimos jogos genéricos). */
  season?: number | null;
  jogadores: JogadorCache[];
};

export type PropsTime = PayloadTime & { fonte: "cache" | "api-football" | "espn" };

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Resolve o time na API-Football pelo nome (memory cache de 24h via afFetch). */
async function resolverTime(nome: string): Promise<{ id: number; name: string } | null> {
  const alvo = norm(nome);
  if (!alvo) return null;
  try {
    const d = await afFetch(`/teams?search=${encodeURIComponent(nome)}`, TTL_MS);
    const arr: any[] = d?.response || [];
    const exato = arr.find((x) => norm(String(x?.team?.name ?? "")) === alvo);
    const parcial =
      exato ||
      arr.find((x) => {
        const n = norm(String(x?.team?.name ?? ""));
        return n.includes(alvo) || alvo.includes(n);
      });
    const t = parcial?.team;
    return t ? { id: Number(t.id), name: String(t.name) } : null;
  } catch {
    return null;
  }
}

/** Lê o cache do Neon (TTL 24h) pela chave normalizada do time. */
async function lerCache(nome: string): Promise<PropsTime | null> {
  try {
    const key = norm(nome);
    if (!key) return null;
    const [row] = await db.select().from(playerPropsCache).where(eq(playerPropsCache.teamKey, key)).limit(1);
    if (!row) return null;
    if (Date.now() - new Date(row.fetchedAt).getTime() >= TTL_MS) return null;
    const p = (row.payload || {}) as PayloadTime;
    if (!Array.isArray(p.jogadores) || !p.jogadores.length) return null;
    return { ...p, teamId: String(row.teamId || p.teamId), teamName: String(row.teamName || p.teamName), fonte: "cache" };
  } catch {
    return null;
  }
}

async function gravarCache(key: string, p: PayloadTime) {
  try {
    await db
      .insert(playerPropsCache)
      .values({
        teamKey: key,
        teamId: p.teamId,
        teamName: p.teamName,
        sample: p.sample,
        payload: p,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: playerPropsCache.teamKey,
        set: { teamId: p.teamId, teamName: p.teamName, sample: p.sample, payload: p, fetchedAt: new Date() },
      });
  } catch {
    /* cache é best-effort */
  }
}

/** Converte a linha crua de `/fixtures/players` nas chaves do motor. */
function valoresDoJogo(st: any): JogoValores {
  const passesTotal = Number(st?.passes?.total);
  const accuracy = Number(st?.passes?.accuracy);
  return {
    gols: num(st?.goals?.total),
    assistencias: num(st?.goals?.assists),
    finalizacoes: num(st?.shots?.total),
    chutesNoGol: num(st?.shots?.on),
    passes: Number.isFinite(passesTotal) ? passesTotal : undefined,
    /* Passes certos é DERIVADO (total × precisão). Sem a precisão o campo fica
       ausente — e o Screener pula o jogo em vez de contar como 0 passe. */
    passesCertos:
      Number.isFinite(passesTotal) && Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 100
        ? Math.round((passesTotal * accuracy) / 100)
        : undefined,
    faltasCometidas: num(st?.fouls?.committed),
    faltasSofridas: num(st?.fouls?.drawn),
    cartoes: num(st?.cards?.yellow) + num(st?.cards?.red),
    defesas: num(st?.goals?.saves),
  };
}

/**
 * Últimos N jogos encerrados do time, com cascata de compatibilidade:
 *   1. `last=N` (planos pagos);
 *   2. `season=<ano atual>` (pagos);
 *   3. temporadas anteriores (plano Free só libera 2022–2024).
 * Devolve também a temporada usada, para a UI ser honesta sobre a amostra.
 */
async function ultimosFixtures(teamId: number, n: number): Promise<{ fixtures: any[]; season: number | null } | null> {
  const ano = new Date().getFullYear();
  const tentativas: { path: string; season: number | null }[] = [
    { path: `/fixtures?team=${teamId}&last=${n}&status=FT`, season: null },
    { path: `/fixtures?team=${teamId}&season=${ano}&status=FT`, season: ano },
    { path: `/fixtures?team=${teamId}&season=${ano - 1}&status=FT`, season: ano - 1 },
    { path: `/fixtures?team=${teamId}&season=${ano - 2}&status=FT`, season: ano - 2 },
  ];
  for (const t of tentativas) {
    try {
      const d = await afFetch(t.path, TTL_MS);
      const arr: any[] = (d?.response || []).filter((f: any) =>
        ["FT", "AET", "PEN"].includes(String(f?.fixture?.status?.short ?? "")),
      );
      if (!arr.length) continue;
      arr.sort((a, b) => String(a?.fixture?.date || "").localeCompare(String(b?.fixture?.date || "")));
      return { fixtures: arr.slice(-n), season: t.season };
    } catch {
      /* plano sem acesso a este parâmetro → tenta o próximo */
    }
  }
  return null;
}

/**
 * Props a partir do ESPN — fallback GRÁTIS e sem login.
 *
 * Existe porque a fonte paga pode ficar fora (conta suspensa, cota do dia
 * estourada, plano sem `/fixtures/players`) e a aba Props ficava vazia sem
 * explicação. O resumo de cada partida do ESPN já publica as estatísticas
 * individuais, então o card de props não depende só de cota paga.
 *
 * O que o ESPN não publica por atleta (passes) simplesmente não entra no
 * `JogoValores` — o motor pula o jogo em vez de contar 0.
 *
 * Devolve `null` quando não há nenhum jogo com dado para o time.
 */
export async function propsDoEspn(
  league: string,
  teamId: string,
  teamName: string,
  jogos = PROPS_MAX_JOGOS,
): Promise<PropsTime | null> {
  if (!league || !teamId) return null;
  const { getTeamHistoryElenco } = await import("./espn");
  const hist = await getTeamHistoryElenco(league, String(teamId), jogos).catch(() => null);
  if (!hist?.players?.length) return null;

  const set = (v: JogoValores, k: keyof JogoValores, x: number | null | undefined) => {
    if (x != null && Number.isFinite(Number(x))) v[k] = Number(x);
  };

  const jogadores = hist.players
    .map((j) => ({
      id: j.id,
      nome: j.nome,
      posicao: j.posicao || "",
      foto: j.foto || null,
      jogos: j.jogos.map((g) => {
        const v: JogoValores = {};
        if (!g) return v;
        set(v, "gols", g.gols);
        set(v, "assistencias", g.assistencias);
        set(v, "finalizacoes", g.finalizacoes);
        set(v, "chutesNoGol", g.chutesNoGol);
        set(v, "cartoes", g.cartoes);
        set(v, "defesas", g.defesas);
        set(v, "faltasCometidas", g.faltasCometidas);
        set(v, "faltasSofridas", g.faltasSofridas);
        return v;
      }),
    }))
    .filter((j) => j.jogos.some((v) => Object.keys(v).length > 0));

  if (!jogadores.length) return null;

  return {
    fonte: "espn",
    teamId: String(teamId),
    teamName,
    sample: hist.games.length,
    janela: jogos,
    season: null,
    jogadores,
  };
}

/**
 * Props de um time (cache-first). `permitirApi:false` só lê o cache.
 *
 * `jogos` define a janela pedida (3..10). Se o cache tem uma amostra MENOR que
 * a pedida e a API está liberada, refaz a coleta para a janela maior; se a API
 * não pode ser gasta, devolve a amostra real que já existe (nunca inventa).
 * Devolve `null` quando não há dado nem permissão de gastar cota.
 */
export async function getPropsDoTime(
  nome: string,
  opts: { permitirApi?: boolean; jogos?: number } = {},
): Promise<PropsTime | null> {
  const permitirApi = opts.permitirApi ?? true;
  const janela = Math.max(3, Math.min(10, Math.floor(opts.jogos ?? PROPS_MAX_JOGOS)));

  const emCache = await lerCache(nome);
  if (emCache && (emCache.sample >= janela || (emCache.janela ?? 0) >= janela)) return emCache;
  if (!permitirApi || PROPS_DISABLED) return emCache;

  const time = await resolverTime(nome);
  if (!time) return emCache;

  // 1) últimos N jogos encerrados (com fallback de temporada para o plano Free)
  const achado = await ultimosFixtures(time.id, janela);
  if (!achado) return emCache;
  const fixtures = achado.fixtures;

  // 2) estatísticas individuais jogo a jogo
  const porJogador = new Map<string, JogadorCache>();
  for (const fx of fixtures) {
    const fid = fx?.fixture?.id;
    if (!fid) continue;
    try {
      const d = await afFetch(`/fixtures/players?fixture=${fid}`, TTL_MS);
      for (const tb of d?.response || []) {
        if (String(tb?.team?.id ?? "") !== String(time.id)) continue;
        for (const p of tb?.players || []) {
          const st = (p?.statistics || [])[0];
          const minutos = num(st?.games?.minutes);
          if (minutos <= 0) continue; // não entrou em campo
          const id = String(p?.player?.id ?? p?.player?.name ?? "");
          if (!id) continue;
          const atual =
            porJogador.get(id) ||
            ({
              id,
              nome: String(p?.player?.name || "Jogador"),
              posicao: String(st?.games?.position || ""),
              foto: p?.player?.photo ? String(p.player.photo) : null,
              jogos: [],
            } satisfies JogadorCache);
          atual.jogos.push(valoresDoJogo(st));
          porJogador.set(id, atual);
        }
      }
    } catch {
      /* um jogo sem stats não invalida a amostra */
    }
  }

  // 3) mantém quem realmente jogou (>= 2 partidas) e limita ao elenco útil
  const jogadores = [...porJogador.values()]
    .filter((j) => j.jogos.length >= 2)
    .sort((a, b) => b.jogos.length - a.jogos.length)
    .slice(0, 30);

  if (!jogadores.length) return emCache;

  const payload: PayloadTime = {
    teamId: String(time.id),
    teamName: time.name,
    sample: fixtures.length,
    janela,
    season: achado.season,
    jogadores,
  };
  await gravarCache(norm(nome), payload);
  return { ...payload, fonte: "api-football" };
}

/** Junta os jogadores dos dois times no contrato do motor. */
export function montarJogadores(casa: PropsTime | null, fora: PropsTime | null): JogadorAmostra[] {
  const map = (t: PropsTime | null, lado: "home" | "away"): JogadorAmostra[] =>
    (t?.jogadores || []).map((j) => ({
      id: `${lado}-${j.id}`,
      nome: j.nome,
      time: t!.teamName,
      timeId: t!.teamId,
      lado,
      posicao: j.posicao,
      foto: j.foto ?? null,
      jogos: j.jogos,
    }));
  return [...map(casa, "home"), ...map(fora, "away")];
}