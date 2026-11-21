import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { fetchJson } from "@/lib/cache";
import { getKey } from "@/lib/keys";
import {
  hubBookmakerOdd,
  hubFixture,
  hubLeague,
  hubLineup,
  hubLineupPlayer,
  hubPlayer,
  hubPlayerStat,
  hubSeason,
  hubTeam,
} from "@/db/hub-schema";

/**
 * Cliente Sportmonks v3 para o módulo Hub.
 *
 * Regras:
 *  - Nenhuma função inventa dado: o que o provedor não mandou fica nulo/vazio.
 *  - Todo upsert é idempotente pela chave do provedor (`sportmonks_id`), então
 *    o job pode rodar de 5 em 5 minutos sem duplicar linha.
 *  - Odds são gravadas por (fixture, mercado, seleção, casa) e sempre com
 *    `fetched_at` novo — o histórico de linha é reconstruível pelo que a UI
 *    mostra ("odds às HH:MM").
 */

const BASE = "https://api.sportmonks.com/v3/football";

export async function smGet<T = any>(path: string, ttlMs = 60_000): Promise<T> {
  const token = await getKey("sportmonks");
  if (!token) throw new Error("Chave Sportmonks não configurada (Admin → APIs ou SPORTMONKS_TOKEN).");
  const sep = path.includes("?") ? "&" : "?";
  return fetchJson(`${BASE}${path}${sep}api_token=${token}`, {}, ttlMs, `hub:sm:${path}`) as Promise<T>;
}

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Estado ao vivo do Sportmonks -> vocabulário do nosso banco. */
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

const isFinishedState = (s: string) => s === "FT";

export async function upsertLeague(input: {
  sportmonksId: number;
  name: string;
  logoUrl?: string | null;
  countryIso2?: string | null;
  countryName?: string | null;
  competitionType?: string;
}): Promise<number> {
  const slug = slugify(input.name);
  const [row] = await db
    .insert(hubLeague)
    .values({
      sportmonksId: input.sportmonksId,
      name: input.name,
      slug,
      logoUrl: input.logoUrl ?? null,
      countryIso2: input.countryIso2 ?? null,
      countryName: input.countryName ?? null,
      competitionType: input.competitionType ?? "Liga",
    })
    .onConflictDoUpdate({
      target: hubLeague.sportmonksId,
      set: {
        name: input.name,
        logoUrl: input.logoUrl ?? null,
        countryIso2: input.countryIso2 ?? null,
        countryName: input.countryName ?? null,
        competitionType: input.competitionType ?? "Liga",
      },
    })
    .returning({ id: hubLeague.id });
  return row.id;
}

export async function upsertTeam(input: {
  sportmonksId: number;
  name: string;
  logoUrl?: string | null;
  countryIso2?: string | null;
  leagueId?: number | null;
}): Promise<number> {
  const [row] = await db
    .insert(hubTeam)
    .values({
      sportmonksId: input.sportmonksId,
      name: input.name,
      slug: slugify(input.name),
      logoUrl: input.logoUrl ?? null,
      countryIso2: input.countryIso2 ?? null,
      leagueId: input.leagueId ?? null,
    })
    .onConflictDoUpdate({
      target: hubTeam.sportmonksId,
      set: { name: input.name, logoUrl: input.logoUrl ?? null, countryIso2: input.countryIso2 ?? null },
    })
    .returning({ id: hubTeam.id });
  return row.id;
}

export async function upsertPlayer(input: {
  sportmonksId: number;
  name: string;
  imageUrl?: string | null;
  position?: string | null;
  detailedPosition?: string | null;
  shirtNumber?: number | null;
  nationality?: string | null;
  dateOfBirth?: string | null;
  height?: number | null;
  weight?: number | null;
  teamId?: number | null;
}): Promise<number> {
  const [row] = await db
    .insert(hubPlayer)
    .values({
      sportmonksId: input.sportmonksId,
      name: input.name,
      slug: `${input.sportmonksId}-${slugify(input.name)}`,
      imageUrl: input.imageUrl ?? null,
      position: input.position ?? null,
      detailedPosition: input.detailedPosition ?? null,
      shirtNumber: input.shirtNumber ?? null,
      nationality: input.nationality ?? null,
      dateOfBirth: input.dateOfBirth ? input.dateOfBirth.slice(0, 10) : null,
      height: input.height ?? null,
      weight: input.weight ?? null,
      teamId: input.teamId ?? null,
    })
    .onConflictDoUpdate({
      target: hubPlayer.sportmonksId,
      set: {
        name: input.name,
        imageUrl: input.imageUrl ?? null,
        position: input.position ?? null,
        teamId: input.teamId ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: hubPlayer.id });
  return row.id;
}

/** Garante a temporada atual da liga (idempotente por season_key). */
async function ensureSeason(leagueId: number, raw: any): Promise<number | null> {
  if (!raw?.id) return null;
  const name = String(raw.name || "");
  const seasonKey = name.replace(/\//g, "-") || String(raw.id);
  const [row] = await db
    .insert(hubSeason)
    .values({
      leagueId,
      sportmonksId: Number(raw.id),
      seasonKey,
      name,
      isCurrent: true,
    })
    .onConflictDoUpdate({
      target: [hubSeason.leagueId, hubSeason.seasonKey],
      set: { sportmonksId: Number(raw.id), name, isCurrent: true },
    })
    .returning({ id: hubSeason.id });
  return row.id;
}

export type FixtureSyncResult = { date: string; seen: number; upserted: number; fixtures: number[] };

/**
 * Sincroniza os jogos de uma data (UTC) e suas dependências (liga, temporada,
 * times). Retorna ids internos das fixtures para o chamador poder analisar.
 */
export async function syncFixturesForDate(dateIso: string): Promise<FixtureSyncResult> {
  const payload = await smGet<any>(
    `/fixtures/date/${dateIso}?include=participants;league;season;state;scores;venue`,
    30_000,
  );
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  const fixtureIds: number[] = [];
  let upserted = 0;

  for (const f of rows) {
    const participants: any[] = Array.isArray(f.participants) ? f.participants : [];
    const home = participants.find((p) => p?.meta?.location === "home");
    const away = participants.find((p) => p?.meta?.location === "away");
    if (!home || !away) continue;

    const leagueRaw = f.league || {};
    const leagueId = await upsertLeague({
      sportmonksId: Number(leagueRaw.id ?? f.league_id),
      name: String(leagueRaw.name || `League ${f.league_id}`),
      logoUrl: leagueRaw.image_path ?? null,
      countryIso2: leagueRaw.country?.iso2 ?? null,
      countryName: leagueRaw.country?.name ?? null,
      competitionType: leagueRaw.type === "cup" ? "Cup" : leagueRaw.is_cup ? "Cup" : "Liga",
    });
    const seasonId = await ensureSeason(leagueId, f.season);

    const homeTeamId = await upsertTeam({
      sportmonksId: Number(home.id),
      name: String(home.name),
      logoUrl: home.image_path ?? null,
      countryIso2: home.country?.iso2 ?? null,
      leagueId,
    });
    const awayTeamId = await upsertTeam({
      sportmonksId: Number(away.id),
      name: String(away.name),
      logoUrl: away.image_path ?? null,
      countryIso2: away.country?.iso2 ?? null,
      leagueId,
    });

    const scores: any[] = Array.isArray(f.scores) ? f.scores : [];
    const pickScore = (location: "home" | "away", description: string): number => {
      const hit = scores.find(
        (s) =>
          s?.score?.participant === location &&
          String(s?.score?.description || "").toUpperCase() === description &&
          s?.score?.participant !== "neutral",
      );
      return Number(hit?.score?.goals ?? 0);
    };

    const liveState = mapLiveState(f.state);
    const isPostponed = liveState === "POSTPONED";
    const isFinished = isFinishedState(liveState);

    const matchDate = new Date(String(f.starting_at));

    const [fixtureRow] = await db
      .insert(hubFixture)
      .values({
        sportmonksId: Number(f.id),
        leagueId,
        seasonId,
        stageName: f.stage?.name ?? null,
        roundName: f.round?.name ?? null,
        matchDate,
        venueName: f.venue?.name ?? null,
        venueCity: f.venue?.city_name ?? null,
        homeTeamId,
        awayTeamId,
        homeScore: pickScore("home", "CURRENT"),
        awayScore: pickScore("away", "CURRENT"),
        homeScoreFt: isFinished ? pickScore("home", "CURRENT") : 0,
        awayScoreFt: isFinished ? pickScore("away", "CURRENT") : 0,
        minutesPlayed: Number(f.periods?.length ? 0 : 0) || 0,
        liveState,
        isCup: Boolean(leagueRaw.is_cup),
        isPostponed,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: hubFixture.sportmonksId,
        set: {
          leagueId,
          seasonId,
          stageName: f.stage?.name ?? null,
          roundName: f.round?.name ?? null,
          matchDate,
          venueName: f.venue?.name ?? null,
          venueCity: f.venue?.city_name ?? null,
          homeTeamId,
          awayTeamId,
          homeScore: pickScore("home", "CURRENT"),
          awayScore: pickScore("away", "CURRENT"),
          homeScoreFt: isFinished ? pickScore("home", "CURRENT") : 0,
          awayScoreFt: isFinished ? pickScore("away", "CURRENT") : 0,
          liveState,
          isPostponed,
          updatedAt: new Date(),
        },
      })
      .returning({ id: hubFixture.id });

    fixtureIds.push(fixtureRow.id);
    upserted += 1;
  }

  return { date: dateIso, seen: rows.length, upserted, fixtures: fixtureIds };
}

/** Atualiza só o placar/estado de jogos em andamento (payload leve). */
export async function syncLiveScores(dateIso: string): Promise<number> {
  const payload = await smGet<any>(`/livescores/inplay?include=participants;state;scores`, 15_000);
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  let touched = 0;
  for (const f of rows) {
    const scores: any[] = Array.isArray(f.scores) ? f.scores : [];
    const goals = (loc: "home" | "away") =>
      Number(
        scores.find((s) => s?.score?.participant === loc && String(s?.score?.description || "").toUpperCase() === "CURRENT")
          ?.score?.goals ?? 0,
      );
    const liveState = mapLiveState(f.state);
    const res = await db
      .update(hubFixture)
      .set({
        homeScore: goals("home"),
        awayScore: goals("away"),
        liveState,
        updatedAt: new Date(),
        ...(isFinishedState(liveState) ? { homeScoreFt: goals("home"), awayScoreFt: goals("away") } : {}),
      })
      .where(eq(hubFixture.sportmonksId, Number(f.id)))
      .returning({ id: hubFixture.id });
    touched += res.length;
  }
  void dateIso;
  return touched;
}

const ROLE_BY_TYPE: Record<number, "xi" | "bench" | "sidelined"> = {
  11: "xi",
  12: "bench",
  13: "sidelined",
};

/**
 * Escalação de uma partida. `confirmed` só vira true quando existe linha de XI
 * para os dois times — é isso que destrava a análise Final (e a oportunidade).
 */
export async function syncLineups(fixtureSportmonksId: number): Promise<{ confirmed: boolean; xiHome: number; xiAway: number }> {
  const [fixture] = await db
    .select()
    .from(hubFixture)
    .where(eq(hubFixture.sportmonksId, fixtureSportmonksId))
    .limit(1);
  if (!fixture) throw new Error(`Fixture ${fixtureSportmonksId} não sincronizada.`);

  const payload = await smGet<any>(`/lineups/fixtures/${fixtureSportmonksId}?include=player;formation`, 60_000);
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];

  await db.delete(hubLineupPlayer).where(eq(hubLineupPlayer.fixtureId, fixture.id));

  let xiHome = 0;
  let xiAway = 0;
  let homeFormation: string | null = null;
  let awayFormation: string | null = null;

  for (const l of rows) {
    const smTeamId = Number(l.team_id);
    const sideIsHome = await isHomeTeam(fixture.homeTeamId, smTeamId);
    const internalTeamId = sideIsHome ? fixture.homeTeamId : fixture.awayTeamId;

    const playerRaw = l.player || {};
    const playerId = playerRaw.id
      ? await upsertPlayer({
          sportmonksId: Number(playerRaw.id),
          name: String(playerRaw.display_name || playerRaw.name || "Jogador"),
          imageUrl: playerRaw.image_path ?? null,
          position: playerRaw.position?.name ?? null,
          dateOfBirth: playerRaw.date_of_birth ?? null,
          height: playerRaw.height ?? null,
          weight: playerRaw.weight ?? null,
          teamId: internalTeamId,
        })
      : null;

    const role = ROLE_BY_TYPE[Number(l.type_id)] ?? (l.formation_position ? "xi" : "bench");
    if (role === "xi") {
      if (sideIsHome) xiHome += 1;
      else xiAway += 1;
    }

    await db
      .insert(hubLineupPlayer)
      .values({
        fixtureId: fixture.id,
        teamId: internalTeamId,
        playerId,
        role,
        position: playerRaw.position?.name ?? null,
        shirtNumber: playerRaw.jersey_number ? Number(playerRaw.jersey_number) : null,
        isCaptain: Boolean(playerRaw.captain),
        formationPosition: l.formation_position ? Number(l.formation_position) : null,
        injuryType: l.injury?.name ?? null,
      })
      .onConflictDoNothing();

    const formation = l.formation?.name ? String(l.formation.name) : null;
    if (formation) {
      if (sideIsHome) homeFormation = formation;
      else awayFormation = formation;
    }
  }

  const confirmed = xiHome >= 11 && xiAway >= 11;
  await db
    .insert(hubLineup)
    .values({ fixtureId: fixture.id, confirmed, homeFormation, awayFormation, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: hubLineup.fixtureId,
      set: { confirmed, homeFormation, awayFormation, updatedAt: new Date() },
    });

  return { confirmed, xiHome, xiAway };
}

async function isHomeTeam(homeTeamIdInternal: number, smTeamId: number): Promise<boolean> {
  const [team] = await db.select({ id: hubTeam.id }).from(hubTeam).where(eq(hubTeam.sportmonksId, smTeamId)).limit(1);
  return team?.id === homeTeamIdInternal;
}

/** Normaliza o rótulo de mercado do provedor para o nosso vocabulário. */
export function normalizeMarketSelection(labelRaw: string): { market: string; selection: string } | null {
  const label = labelRaw.trim().toLowerCase();
  if (["home", "1"].includes(label)) return { market: "1X2", selection: "Home" };
  if (["draw", "x"].includes(label)) return { market: "1X2", selection: "Draw" };
  if (["away", "2"].includes(label)) return { market: "1X2", selection: "Away" };
  if (label.startsWith("both teams to score")) {
    return { market: "BTTS", selection: label.includes("no") ? "No" : "Yes" };
  }
  if (label === "home or draw") return { market: "DoubleChance", selection: "HomeOrDraw" };
  if (label === "away or draw") return { market: "DoubleChance", selection: "AwayOrDraw" };
  if (label === "home or away") return { market: "DoubleChance", selection: "HomeOrAway" };
  const total = label.match(/(over|under)\s+(\d+(?:\.\d+)?)/);
  if (total) {
    const line = total[2];
    return { market: "Over/Under", selection: `${total[1] === "over" ? "Over" : "Under"} ${line}` };
  }
  return null;
}

export type OddsSyncResult = { fixtureId: number; written: number; bookmakers: string[] };

/**
 * Odds pré-jogo por casa. O bookmaker marcado como `isPick` é o de referência
 * da oportunidade (Pinnacle, igual ao original) e a odd guardada é a odd do
 * momento — valor que o ledger usa depois para o ROI.
 */
export async function syncOdds(fixtureSportmonksId: number): Promise<OddsSyncResult> {
  const [fixture] = await db
    .select({ id: hubFixture.id })
    .from(hubFixture)
    .where(eq(hubFixture.sportmonksId, fixtureSportmonksId))
    .limit(1);
  if (!fixture) throw new Error(`Fixture ${fixtureSportmonksId} não sincronizada.`);

  const payload = await smGet<any>(`/odds/pre-match/fixtures/${fixtureSportmonksId}?include=bookmaker;market`, 60_000);
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  const bookmakers = new Set<string>();
  let written = 0;

  for (const o of rows) {
    const mapped = normalizeMarketSelection(String(o.label || o.name || ""));
    if (!mapped) continue;
    const bookmakerName = String(o.bookmaker?.name || "Desconhecida");
    const slug = slugify(bookmakerName);
    const odds = Number(o.value);
    if (!Number.isFinite(odds) || odds <= 1) continue;
    bookmakers.add(bookmakerName);
    await db
      .insert(hubBookmakerOdd)
      .values({
        fixtureId: fixture.id,
        market: mapped.market,
        selection: mapped.selection,
        bookmaker: bookmakerName,
        bookmakerSlug: slug,
        odds,
        isPick: slug === "pinnacle",
        isKalshi: slug === "kalshi",
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [hubBookmakerOdd.fixtureId, hubBookmakerOdd.market, hubBookmakerOdd.selection, hubBookmakerOdd.bookmakerSlug],
        set: { odds, fetchedAt: new Date(), isPick: slug === "pinnacle" },
      });
    written += 1;
  }

  return { fixtureId: fixture.id, written, bookmakers: [...bookmakers] };
}

/** Lista as ligas do provedor para o seed inicial (Admin → Hub). */
export async function listProviderLeagues(): Promise<Array<{ id: number; name: string; country: string | null }>> {
  const payload = await smGet<any>(`/leagues?include=country&per_page=100`, 600_000);
  const rows: any[] = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map((l) => ({ id: Number(l.id), name: String(l.name), country: l.country?.name ?? null }));
}

/** Jogos que já têm lineup confirmado hoje — base do job de análise final. */
export async function fixturesReadyForFinal(limit = 40): Promise<Array<{ fixtureId: number; sportmonksId: number; homeTeamId: number; awayTeamId: number }>> {
  const rows = await db
    .select({
      fixtureId: hubFixture.id,
      sportmonksId: hubFixture.sportmonksId,
      homeTeamId: hubFixture.homeTeamId,
      awayTeamId: hubFixture.awayTeamId,
    })
    .from(hubFixture)
    .innerJoin(hubLineup, eq(hubLineup.fixtureId, hubFixture.id))
    .where(
      and(
        eq(hubLineup.confirmed, true),
        eq(hubFixture.liveState, "NS"),
        sql`${hubFixture.matchDate} between now() - interval '15 minutes' and now() + interval '90 minutes'`,
      ),
    )
    .limit(limit);
  return rows;
}

/**
 * Grava produção de jogador na temporada (insumo do ajuste de escalação).
 *
 * A origem do número é responsabilidade do chamador: o job de estatísticas do
 * provedor monta as linhas aqui. Deixar a escrita separada da coleta mantém
 * este arquivo testável e evita inventar campo que o plano do provedor não
 * devolve.
 */
export async function upsertPlayerStat(row: {
  playerSportmonksId: number;
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
    .where(eq(hubPlayer.sportmonksId, row.playerSportmonksId))
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

/** Ids internos de liga por slug — conveniência para os scripts de sync. */
export async function leagueIdBySlug(slug: string): Promise<number | null> {
  const [row] = await db.select({ id: hubLeague.id }).from(hubLeague).where(eq(hubLeague.slug, slug)).limit(1);
  return row?.id ?? null;
}

export async function existingFixtureIds(sportmonksIds: number[]): Promise<number[]> {
  if (!sportmonksIds.length) return [];
  const rows = await db
    .select({ id: hubFixture.sportmonksId })
    .from(hubFixture)
    .where(inArray(hubFixture.sportmonksId, sportmonksIds));
  return rows.map((r) => r.id);
}
