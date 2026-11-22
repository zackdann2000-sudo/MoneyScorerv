import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { hubFixture, hubFixtureSource, hubLeague, hubPlayer, hubSeason, hubTeam } from "@/db/hub-schema";

/**
 * Identidade de dados do Hub com QUATRO fornecedores.
 *
 * O banco não pode depender do id de um fornecedor só (a Sportmonks bloqueia
 * odds no plano free e pode ficar fora do ar). Então a identidade canônica de
 * liga, time, jogador e jogo é `(source, external_ref)`: o id de origem + o nome
 * do fornecedor que entregou a linha.
 *
 * `sportmonks_id` continua existindo (nulável) só para compatibilidade com o
 * que já foi gravado. Quem quiser o id de outro fornecedor para a MESMA fixture
 * usa `hub_fixture_source`, que guarda o mapa fixture interna -> id externo.
 *
 * Regras:
 *  - upsert é idempotente por (source, external_ref);
 *  - nunca apaga dado: campo que o fornecedor não mandou fica como estava;
 *  - nenhuma função inventa valor (zero não é "sem dado", é zero).
 */

export type Provider = "espn" | "footballdata" | "sportmonks" | "bzzoiro";

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Letras que o NFD não decompõe: sem isto "Bodø/Glimt" vira "bod-glimt" e
    // não casa com o "Bodo/Glimt" da ESPN.
    .replace(/ø/gi, "o")
    .replace(/æ/gi, "ae")
    .replace(/œ/gi, "oe")
    .replace(/å/gi, "a")
    .replace(/ł/gi, "l")
    .replace(/đ/gi, "d")
    .replace(/ð/gi, "d")
    .replace(/þ/gi, "th")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** Nome de time comparável entre fornecedores ("Aston Villa FC" == "Aston Villa"). */
export function teamTokens(name: string): string[] {
  const lixo = new Set([
    // sufixos e prefixos societários que cada fornecedor escreve de um jeito
    "fc", "sc", "ec", "ac", "af", "afc", "cf", "cd", "ca", "sk", "fk", "as", "sv", "cs", "ss",
    "ud", "ue", "rcd", "fbpa", "spa", "sd", "aa", "ssc", "cfc", "kf", "nkk",
    "club", "clube", "futebol", "association", "sport", "sports", "team",
    // preposições
    "de", "do", "da", "del", "the",
    // palavras que se repetem em meio time e não identificam ninguém
    "atletico", "athletic", "real", "cdad", "deportivo",
  ]);
  return slugify(name)
    .split("-")
    .filter((t) => t.length > 1 && !lixo.has(t));
}

/**
 * 0..1 — quanto dois nomes de time se parecem.
 *
 * Usa CONTENÇÃO (interseção / menor conjunto), não Jaccard: os fornecedores
 * costumam ACRESCENTAR palavras ("PSV" -> "PSV Eindhoven", "Santos" ->
 * "Santos FC"), e Jaccard puniria justamente esse caso, que é o mais comum.
 */
export function teamSimilarity(a: string, b: string): number {
  const ta = new Set(teamTokens(a));
  const tb = new Set(teamTokens(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.min(ta.size, tb.size);
}

const dayStart = (d: Date) => {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
};

export async function upsertLeague(input: {
  source: Provider;
  externalRef: string;
  name: string;
  logoUrl?: string | null;
  countryIso2?: string | null;
  countryName?: string | null;
  competitionType?: "Liga" | "Cup" | "International";
  isCup?: boolean;
  sportmonksId?: number | null;
}): Promise<number> {
  // Slug é único no banco; prefixar a origem evita "serie-a" da ESPN colidir
  // com "serie-a" da Sportmonks (ligas diferentes, mesmo nome).
  const base = slugify(input.name) || `liga-${input.externalRef}`;
  const slug = input.source === "sportmonks" ? base : `${input.source}-${base}`;
  const competitionType = input.competitionType ?? (input.isCup ? "Cup" : "Liga");

  const [row] = await db
    .insert(hubLeague)
    .values({
      source: input.source,
      externalRef: input.externalRef,
      sportmonksId: input.sportmonksId ?? null,
      name: input.name,
      slug,
      logoUrl: input.logoUrl ?? null,
      countryIso2: input.countryIso2 ?? null,
      countryName: input.countryName ?? null,
      competitionType,
    })
    .onConflictDoUpdate({
      target: [hubLeague.source, hubLeague.externalRef],
      set: {
        name: input.name,
        logoUrl: input.logoUrl ?? null,
        countryIso2: input.countryIso2 ?? null,
        countryName: input.countryName ?? null,
        competitionType,
      },
    })
    .returning({ id: hubLeague.id });
  return row.id;
}

export async function upsertTeam(input: {
  source: Provider;
  externalRef: string;
  name: string;
  logoUrl?: string | null;
  countryIso2?: string | null;
  leagueId?: number | null;
  sportmonksId?: number | null;
}): Promise<number> {
  const [row] = await db
    .insert(hubTeam)
    .values({
      source: input.source,
      externalRef: input.externalRef,
      sportmonksId: input.sportmonksId ?? null,
      name: input.name,
      slug: slugify(input.name) || `time-${input.externalRef}`,
      logoUrl: input.logoUrl ?? null,
      countryIso2: input.countryIso2 ?? null,
      leagueId: input.leagueId ?? null,
    })
    .onConflictDoUpdate({
      target: [hubTeam.source, hubTeam.externalRef],
      set: { name: input.name, logoUrl: input.logoUrl ?? null, countryIso2: input.countryIso2 ?? null },
    })
    .returning({ id: hubTeam.id });
  return row.id;
}

export async function upsertPlayer(input: {
  source: Provider;
  externalRef: string;
  name: string;
  imageUrl?: string | null;
  position?: string | null;
  shirtNumber?: number | null;
  teamId?: number | null;
  sportmonksId?: number | null;
}): Promise<number> {
  const [row] = await db
    .insert(hubPlayer)
    .values({
      source: input.source,
      externalRef: input.externalRef,
      sportmonksId: input.sportmonksId ?? null,
      name: input.name,
      slug: slugify(input.name) || `jogador-${input.externalRef}`,
      imageUrl: input.imageUrl ?? null,
      position: input.position ?? null,
      shirtNumber: input.shirtNumber ?? null,
      teamId: input.teamId ?? null,
    })
    .onConflictDoUpdate({
      target: [hubPlayer.source, hubPlayer.externalRef],
      set: {
        name: input.name,
        imageUrl: input.imageUrl ?? null,
        position: input.position ?? null,
        shirtNumber: input.shirtNumber ?? null,
        teamId: input.teamId ?? null,
        updatedAt: new Date(),
      },
    })
    .returning({ id: hubPlayer.id });
  return row.id;
}

/** Garante a temporada da liga (idempotente por league_id + season_key). */
export async function ensureSeason(
  leagueId: number,
  seasonKey: string,
  name: string,
  providerSeasonId?: number | null,
): Promise<number> {
  const [row] = await db
    .insert(hubSeason)
    .values({
      leagueId,
      sportmonksId: providerSeasonId ?? null,
      seasonKey,
      name,
      isCurrent: true,
    })
    .onConflictDoUpdate({
      target: [hubSeason.leagueId, hubSeason.seasonKey],
      set: { name, isCurrent: true },
    })
    .returning({ id: hubSeason.id });
  return row.id;
}

export type FixtureInput = {
  source: Provider;
  externalRef: string;
  leagueId: number;
  seasonId?: number | null;
  homeTeamId: number;
  awayTeamId: number;
  matchDate: Date;
  liveState: string;
  /** null = o fornecedor não informou; mantém o placar que já está no banco. */
  homeScore?: number | null;
  awayScore?: number | null;
  homeRedCards?: number | null;
  awayRedCards?: number | null;
  minutesPlayed?: number | null;
  venueName?: string | null;
  venueCity?: string | null;
  stageName?: string | null;
  roundName?: string | null;
  isCup?: boolean;
  isPostponed?: boolean;
  homeTablePosition?: number | null;
  awayTablePosition?: number | null;
  sportmonksId?: number | null;
};

const FINISHED = new Set(["FT", "AET"]);
const stateRank = (s: string) => (FINISHED.has(s) ? 3 : s === "NS" ? 0 : s === "POSTPONED" ? 0 : 1);

/**
 * Cria/atualiza a fixture daquele fornecedor.
 *
 * Merge não destrutivo:
 *  - placar nulo do fornecedor não zera o placar gravado;
 *  - estado nunca regride (FT não vira NS quando o fornecedor reenvia o jogo);
 *  - posição na tabela só é escrita quando vem preenchida.
 */
export async function upsertFixture(input: FixtureInput): Promise<number> {
  const [existing] = await db
    .select()
    .from(hubFixture)
    .where(and(eq(hubFixture.source, input.source), eq(hubFixture.externalRef, input.externalRef)))
    .limit(1);

  const mergedState =
    existing && stateRank(existing.liveState) > stateRank(input.liveState) ? existing.liveState : input.liveState;
  const isFinished = FINISHED.has(mergedState);
  const homeScore = input.homeScore ?? existing?.homeScore ?? 0;
  const awayScore = input.awayScore ?? existing?.awayScore ?? 0;

  const values = {
    source: input.source,
    externalRef: input.externalRef,
    sportmonksId: input.sportmonksId ?? existing?.sportmonksId ?? null,
    leagueId: input.leagueId,
    seasonId: input.seasonId ?? existing?.seasonId ?? null,
    stageName: input.stageName ?? existing?.stageName ?? null,
    roundName: input.roundName ?? existing?.roundName ?? null,
    matchDate: input.matchDate,
    venueName: input.venueName ?? existing?.venueName ?? null,
    venueCity: input.venueCity ?? existing?.venueCity ?? null,
    homeTeamId: input.homeTeamId,
    awayTeamId: input.awayTeamId,
    homeScore,
    awayScore,
    homeScoreFt: isFinished ? homeScore : (existing?.homeScoreFt ?? 0),
    awayScoreFt: isFinished ? awayScore : (existing?.awayScoreFt ?? 0),
    homeRedCards: input.homeRedCards ?? existing?.homeRedCards ?? 0,
    awayRedCards: input.awayRedCards ?? existing?.awayRedCards ?? 0,
    minutesPlayed: input.minutesPlayed ?? existing?.minutesPlayed ?? 0,
    liveState: mergedState,
    isCup: input.isCup ?? existing?.isCup ?? false,
    isPostponed: input.isPostponed ?? mergedState === "POSTPONED",
    homeTablePosition: input.homeTablePosition ?? existing?.homeTablePosition ?? null,
    awayTablePosition: input.awayTablePosition ?? existing?.awayTablePosition ?? null,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(hubFixture)
    .values(values)
    .onConflictDoUpdate({
      target: [hubFixture.source, hubFixture.externalRef],
      set: values,
    })
    .returning({ id: hubFixture.id });
  return row.id;
}

/** Grava o id do jogo naquele fornecedor para esta fixture interna. */
export async function linkProviderId(fixtureId: number, provider: Provider, externalId: string | number): Promise<void> {
  const id = String(externalId);
  if (!id) return;
  await db
    .insert(hubFixtureSource)
    .values({ fixtureId, provider, externalId: id, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [hubFixtureSource.provider, hubFixtureSource.externalId],
      set: { fixtureId, fetchedAt: new Date() },
    });
}

export async function providerIdsFor(fixtureId: number): Promise<Record<string, string>> {
  const rows = await db
    .select({ provider: hubFixtureSource.provider, externalId: hubFixtureSource.externalId })
    .from(hubFixtureSource)
    .where(eq(hubFixtureSource.fixtureId, fixtureId));
  const out: Record<string, string> = {};
  for (const r of rows) out[r.provider] = r.externalId;
  return out;
}

export type FixtureRef = {
  id: number;
  homeTeamId: number;
  awayTeamId: number;
  homeName: string;
  awayName: string;
  matchDate: Date;
  liveState: string;
};

/** Fixture interna com os nomes dos times (para casar com outro fornecedor). */
export async function fixtureRef(fixtureId: number): Promise<FixtureRef | null> {
  const rows = await db
    .select({
      id: hubFixture.id,
      homeTeamId: hubFixture.homeTeamId,
      awayTeamId: hubFixture.awayTeamId,
      matchDate: hubFixture.matchDate,
      liveState: hubFixture.liveState,
      homeName: hubTeam.name,
    })
    .from(hubFixture)
    .innerJoin(hubTeam, eq(hubTeam.id, hubFixture.homeTeamId))
    .where(eq(hubFixture.id, fixtureId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const [away] = await db.select({ name: hubTeam.name }).from(hubTeam).where(eq(hubTeam.id, row.awayTeamId)).limit(1);
  return { ...row, awayName: away?.name ?? "" };
}

/**
 * Jogo do mesmo dia com os dois times iguais (nome tolerante a fornecedor).
 *
 * Serve para não duplicar a partida quando a ESPN cobre metade do dia e o
 * Football-Data.org cobre a outra: o fallback acha a linha já criada e só
 * atualiza placar/estado.
 */
export async function findFixtureByTeams(input: {
  matchDate: Date;
  homeName: string;
  awayName: string;
  minScore?: number;
}): Promise<number | null> {
  const start = dayStart(input.matchDate);
  const end = new Date(start.getTime() + 86_400_000);
  const rows = await db
    .select({ id: hubFixture.id, homeName: hubTeam.name, matchDate: hubFixture.matchDate })
    .from(hubFixture)
    .innerJoin(hubTeam, eq(hubTeam.id, hubFixture.homeTeamId))
    .where(and(gte(hubFixture.matchDate, start), lt(hubFixture.matchDate, end)))
    .limit(400);

  const min = input.minScore ?? 0.8;
  let best: { id: number; score: number } | null = null;
  for (const r of rows) {
    const homeScore = teamSimilarity(r.homeName, input.homeName);
    if (homeScore < min) continue;
    const [away] = await db
      .select({ name: hubTeam.name })
      .from(hubTeam)
      .innerJoin(hubFixture, eq(hubFixture.awayTeamId, hubTeam.id))
      .where(eq(hubFixture.id, r.id))
      .limit(1);
    if (!away) continue;
    const awayScore = teamSimilarity(away.name, input.awayName);
    if (awayScore < min) continue;
    const score = Math.min(homeScore, awayScore);
    if (!best || score > best.score) best = { id: r.id, score };
  }
  return best?.id ?? null;
}
