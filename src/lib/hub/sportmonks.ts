import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { fetchJson } from "@/lib/cache";
import { getKey } from "@/lib/keys";
import { hubFixture, hubPlayer, hubPlayerStat } from "@/db/hub-schema";
import { slugify } from "./identity";
import type { LineupPayload, LineupPlayerInput, OddsWrite, RawFixture } from "./types";

/**
 * Cliente Sportmonks v3 do módulo Hub.
 *
 * O que o plano free do projeto entrega hoje (verificado com a chave real):
 *  - fixtures por data                       -> OK
 *  - odds pré-jogo (`/odds/pre-match/...`)   -> OK, com dezenas de casas
 *  - escalação (`?include=lineups.player`)   -> OK (o endpoint /lineups/... NÃO existe)
 *  - `/statistics/fixture/{id}`              -> 404 no plano atual
 *
 * Regras do arquivo:
 *  - nenhuma função inventa dado;
 *  - tudo é idempotente por (source, external_ref) via `identity.ts`;
 *  - odd só é aceita com valor decimal > 1 e mercado reconhecido.
 */

const BASE = "https://api.sportmonks.com/v3/football";

export async function smGet<T = any>(path: string, ttlMs = 60_000): Promise<T> {
  const token = await getKey("sportmonks");
  if (!token) throw new Error("Chave Sportmonks não configurada (Admin → APIs ou SPORTMONKS_TOKEN).");
  const sep = path.includes("?") ? "&" : "?";
  return fetchJson(`${BASE}${path}${sep}api_token=${token}`, {}, ttlMs, `hub:sm:${path}`) as Promise<T>;
}

/** Estado ao vivo do Sportmonks -> vocabulário do banco. */
export function mapLiveState(state: any): string {
  const short = String(state?.short_name || state?.developer_name || "").toUpperCase();
  const name = String(state?.name || "").toLowerCase();
  if (!short) return "NS";
  if (["FT", "AET", "FT_PEN", "PEN"].includes(short)) return "FT";
  if (short === "HT") return "HT";
  if (short === "1H" || name.includes("1st half")) return "INPLAY_1ST_HALF";
  if (short === "2H" || name.includes("2nd half")) return "INPLAY_2ND_HALF";
  if (short === "ET" || name.includes("extra time")) return "INPLAY_ET";
  if (["PST", "CANC", "ABAN", "SUSP", "INT"].includes(short)) return "POSTPONED";
  if (["NS", "TBD"].includes(short)) return "NS";
  return short;
}

/* ===== fixtures (fonte terciária; ESPN e Football-Data vêm antes) ===== */

export async function smFixturesForDate(dateIso: string): Promise<RawFixture[]> {
  const payload = await smGet<any>(
    `/fixtures/date/${dateIso}?include=participants;league;season;state;scores;venue`,
    30_000,
  );
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  const out: RawFixture[] = [];

  for (const f of rows) {
    const parts: any[] = Array.isArray(f.participants) ? f.participants : [];
    const home = parts.find((p) => p?.meta?.location === "home");
    const away = parts.find((p) => p?.meta?.location === "away");
    if (!home || !away) continue;

    const escore = (loc: "home" | "away", desc: string): number | null => {
      const hit = (f.scores ?? []).find(
        (s: any) =>
          s?.score?.participant === loc && String(s?.score?.description || "").toUpperCase() === desc,
      );
      const v = hit?.score?.goals;
      return v == null ? null : Number(v);
    };

    const leagueRaw = f.league || {};
    const seasonName = f.season?.name ? String(f.season.name) : null;
    out.push({
      source: "sportmonks",
      externalId: String(f.id),
      league: {
        externalId: String(leagueRaw.id ?? f.league_id),
        name: String(leagueRaw.name || `Liga ${f.league_id}`),
        logo: leagueRaw.image_path ?? null,
        countryIso2: leagueRaw.country?.iso2 ?? null,
        countryName: leagueRaw.country?.name ?? null,
        isCup: Boolean(leagueRaw.is_cup) || String(leagueRaw.type || "").toLowerCase() === "cup",
        seasonKey: seasonName ? seasonName.replace(/\//g, "-") : null,
        seasonName,
      },
      home: {
        externalId: String(home.id),
        name: String(home.name),
        logo: home.image_path ?? null,
        countryIso2: home.country?.iso2 ?? null,
      },
      away: {
        externalId: String(away.id),
        name: String(away.name),
        logo: away.image_path ?? null,
        countryIso2: away.country?.iso2 ?? null,
      },
      kickoff: new Date(String(f.starting_at_utc || f.starting_at).replace(" ", "T").replace(/([^Z])$/, "$1Z")),
      liveState: mapLiveState(f.state),
      homeScore: escore("home", "CURRENT"),
      awayScore: escore("away", "CURRENT"),
      venueName: f.venue?.name ?? null,
      venueCity: f.venue?.city_name ?? null,
      stageName: f.stage?.name ?? null,
      roundName: f.round?.name ?? null,
      isCup: Boolean(leagueRaw.is_cup),
      sportmonksId: Number(f.id),
    });
  }
  return out;
}

/* ===== odds ===== */

const SM_MARKET_LABEL: Record<number, string> = { 1: "1X2", 14: "BTTS", 80: "Over/Under", 2: "DoubleChance" };

/** Linhas de total que o motor calcula (1.5 / 2.5 / 3.5). Fora disso, ignora. */
const LINHAS_VALIDAS = new Set(["1.5", "2.5", "3.5"]);

export function smSelection(
  marketId: number,
  label: string,
  total: string | null,
): { market: string; selection: string } | null {
  const market = SM_MARKET_LABEL[marketId];
  if (!market) return null;
  const l = label.trim().toLowerCase();

  if (market === "1X2") {
    if (l === "home" || l === "1") return { market, selection: "Home" };
    if (l === "draw" || l === "x") return { market, selection: "Draw" };
    if (l === "away" || l === "2") return { market, selection: "Away" };
    return null;
  }
  if (market === "BTTS") {
    if (l === "yes") return { market, selection: "Yes" };
    if (l === "no") return { market, selection: "No" };
    return null;
  }
  if (market === "DoubleChance") {
    if (l === "home/draw") return { market, selection: "HomeOrDraw" };
    if (l === "draw/away") return { market, selection: "AwayOrDraw" };
    if (l === "home/away") return { market, selection: "HomeOrAway" };
    return null;
  }
  // Over/Under: só linhas cheias que o motor gera.
  const linha = total != null ? String(Number(total)) : null;
  if (!linha || !LINHAS_VALIDAS.has(linha)) return null;
  if (l === "over") return { market, selection: `Over ${linha}` };
  if (l === "under") return { market, selection: `Under ${linha}` };
  return null;
}

/**
 * Odds pré-jogo por casa para um jogo do Sportmonks.
 *
 * Só as casas que a resposta trouxer. `isPick` marca a Pinnacle (referência de
 * mercado, igual ao original); se ela não cotar o jogo, `pickOpportunity` cai
 * para a melhor odd disponível.
 */
export async function smOddsForFixture(sportmonksFixtureId: string | number): Promise<OddsWrite[]> {
  const payload = await smGet<any>(
    `/odds/pre-match/fixtures/${sportmonksFixtureId}?include=bookmaker;market`,
    60_000,
  );
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  const out: OddsWrite[] = [];

  for (const o of rows) {
    const mapped = smSelection(Number(o.market_id), String(o.label || o.name || ""), o.total ?? null);
    if (!mapped) continue;
    const odds = Number(o.value);
    if (!Number.isFinite(odds) || odds <= 1) continue;
    const bookmaker = String(o.bookmaker?.name || "Desconhecida");
    const bookmakerSlug = slugify(bookmaker);
    out.push({
      market: mapped.market,
      selection: mapped.selection,
      odds,
      bookmaker,
      bookmakerSlug,
      isPick: bookmakerSlug === "pinnacle",
    });
  }
  return out;
}

/* ===== escalação ===== */

const ROLE_BY_TYPE: Record<number, "xi" | "bench" | "sidelined"> = { 11: "xi", 12: "bench", 13: "sidelined" };

type SmLineupRow = {
  team_id: number;
  player_id: number;
  player_name?: string;
  jersey_number?: number | string | null;
  formation_position?: number | null;
  position_id?: number | null;
  type_id?: number | null;
  player?: {
    id: number;
    display_name?: string;
    name?: string;
    image_path?: string | null;
    position?: { name?: string } | null;
    jersey_number?: number | string | null;
    captain?: boolean;
  } | null;
};

/**
 * Escalação de um jogo do Sportmonks.
 *
 * Endpoint correto: `/fixtures/{id}?include=lineups.player;formations;participants`.
 * (`/lineups/fixture/{id}` responde 404 neste plano — não existe no v3.)
 *
 * O lado de cada jogador vem do `participants` do PRÓPRIO payload (quem é home),
 * nunca de um id externo: assim a função funciona para fixture que nasceu na
 * ESPN e só depois foi vinculada ao Sportmonks.
 *
 * `confirmed` só vira true com XI de 11 nos dois lados: é o que destrava a
 * análise Final e, com ela, a oportunidade.
 */
export async function smLineupsForFixture(sportmonksFixtureId: string | number): Promise<LineupPayload | null> {
  const payload = await smGet<any>(
    `/fixtures/${sportmonksFixtureId}?include=lineups.player;formations;participants`,
    60_000,
  );
  const fixture = payload?.data;
  const rows: SmLineupRow[] = Array.isArray(fixture?.lineups) ? fixture.lineups : [];
  if (!rows.length) return null;

  const participantes: any[] = Array.isArray(fixture?.participants) ? fixture.participants : [];
  const mandante = participantes.find((p) => String(p?.meta?.location || "").toLowerCase() === "home");
  const homeTeamId = mandante?.id != null ? String(mandante.id) : null;

  const formacoes: any[] = Array.isArray(fixture?.formations) ? fixture.formations : [];
  const formacaoPorLado = (lado: "home" | "away"): string | null => {
    const alvo = lado === "home" ? homeTeamId : participantes.find((p) => String(p?.meta?.location || "").toLowerCase() === "away")?.id;
    const hit = formacoes.find((f) =>
      alvo != null ? String(f?.participant_id) === String(alvo) : String(f?.location || "").toLowerCase() === lado,
    );
    return hit?.formation ? String(hit.formation) : null;
  };

  const lado = (teamId: number): "home" | "away" =>
    homeTeamId != null ? (String(teamId) === homeTeamId ? "home" : "away") : "home";

  const home: LineupPlayerInput[] = [];
  const away: LineupPlayerInput[] = [];
  for (const l of rows) {
    const nome = String(l.player?.display_name || l.player?.name || l.player_name || "").trim();
    if (!nome) continue;
    const role = ROLE_BY_TYPE[Number(l.type_id)] ?? (l.formation_position ? "xi" : "bench");
    const item: LineupPlayerInput = {
      externalId: String(l.player?.id ?? l.player_id),
      name: nome,
      role,
      position: l.player?.position?.name ?? null,
      shirtNumber:
        l.jersey_number != null ? Number(l.jersey_number) : l.player?.jersey_number != null ? Number(l.player.jersey_number) : null,
      isCaptain: Boolean(l.player?.captain),
      formationPosition: l.formation_position != null ? Number(l.formation_position) : null,
    };
    (lado(Number(l.team_id)) === "home" ? home : away).push(item);
  }

  const xiHome = home.filter((p) => p.role === "xi").length;
  const xiAway = away.filter((p) => p.role === "xi").length;
  return {
    confirmed: xiHome >= 11 && xiAway >= 11,
    home: { formation: formacaoPorLado("home"), players: home },
    away: { formation: formacaoPorLado("away"), players: away },
  };
}

/* ===== placar ao vivo ===== */

/**
 * Atualiza o placar/estado apenas dos jogos que já existem no banco e que têm
 * vínculo com a Sportmonks. Jogo desconhecido é ignorado (quem cria fixture é
 * a cascata de fixtures, não este passo).
 */
export async function smRefreshLive(): Promise<{ seen: number; touched: number }> {
  const payload = await smGet<any>(`/livescores/inplay?include=participants;state;scores`, 15_000);
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  let touched = 0;
  for (const f of rows) {
    const goals = (loc: "home" | "away") => {
      const hit = (f.scores ?? []).find(
        (s: any) => s?.score?.participant === loc && String(s?.score?.description || "").toUpperCase() === "CURRENT",
      );
      return hit?.score?.goals != null ? Number(hit.score.goals) : null;
    };
    const liveState = mapLiveState(f.state);
    const h = goals("home");
    const a = goals("away");
    const res = await db
      .update(hubFixture)
      .set({
        ...(h != null ? { homeScore: h } : {}),
        ...(a != null ? { awayScore: a } : {}),
        ...(liveState === "FT" ? { homeScoreFt: h ?? 0, awayScoreFt: a ?? 0 } : {}),
        liveState,
        updatedAt: new Date(),
      })
      .where(
        sql`${hubFixture.id} in (
          select fixture_id from hub_fixture_source
           where provider = 'sportmonks' and external_id = ${String(f.id)}
        )`,
      )
      .returning({ id: hubFixture.id });
    touched += res.length;
  }
  return { seen: rows.length, touched };
}

/* ===== insumos do motor ===== */

/**
 * Grava produção de jogador na temporada (insumo do ajuste de escalação).
 *
 * A origem do número é responsabilidade do chamador. Deixar a escrita separada
 * da coleta mantém a coleta testável e evita inventar campo que o plano do
 * fornecedor não devolve.
 */
export async function upsertPlayerStat(row: {
  playerSourceId: string;
  seasonId: number;
  teamId?: number | null;
  appearances?: number;
  minutes?: number;
  goals?: number;
  assists?: number;
  shots?: number;
  rating?: number | null;
}): Promise<void> {
  const [player] = await db
    .select({ id: hubPlayer.id })
    .from(hubPlayer)
    .where(and(eq(hubPlayer.source, "sportmonks"), eq(hubPlayer.externalRef, row.playerSourceId)))
    .limit(1);
  if (!player) return;
  await db
    .insert(hubPlayerStat)
    .values({
      playerId: player.id,
      seasonId: row.seasonId,
      teamId: row.teamId ?? null,
      appearances: row.appearances ?? 0,
      minutes: row.minutes ?? 0,
      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      shots: row.shots ?? 0,
      rating: row.rating ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [hubPlayerStat.playerId, hubPlayerStat.seasonId],
      set: {
        teamId: row.teamId ?? null,
        appearances: row.appearances ?? 0,
        minutes: row.minutes ?? 0,
        goals: row.goals ?? 0,
        assists: row.assists ?? 0,
        shots: row.shots ?? 0,
        rating: row.rating ?? null,
        updatedAt: new Date(),
      },
    });
}

/** Lista as ligas do provedor para o seed inicial (Admin → Hub). */
export async function listProviderLeagues(): Promise<Array<{ id: number; name: string; country: string | null }>> {
  const payload = await smGet<any>(`/leagues?include=country&per_page=100`, 600_000);
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((l) => ({ id: Number(l.id), name: String(l.name), country: l.country?.name ?? null }));
}

export { slugify };
export type { RawFixture, OddsWrite, LineupPayload };
