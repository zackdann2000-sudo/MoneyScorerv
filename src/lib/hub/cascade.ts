import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hubBookmakerOdd, hubFixture, hubFixtureContext, hubLeague, hubLineup, hubLineupPlayer, hubTeam } from "@/db/hub-schema";
import { cached } from "@/lib/cache";
import {
  ensureSeason,
  findFixtureByTeams,
  fixtureRef,
  linkProviderId,
  providerIdsFor,
  slugify,
  teamSimilarity,
  upsertFixture,
  upsertLeague,
  upsertPlayer,
  upsertTeam,
  type FixtureRef,
  type Provider,
} from "./identity";
import { espnFixturesForDate, espnH2HForFixture, espnLineupsForFixture, espnOddsForFixture, espnStatsForFixture, competitionTypeFor } from "./espn-hub";
import { fdFixturesForDate, fdTablePositions } from "./footballdata-hub";
import { bzFindEventId, bzH2HForEvent, bzLineupsForEvent, bzOddsForEvent, bzStatsForEvent } from "./bzzoiro-hub";
import { smFixturesForDate, smLineupsForFixture, smOddsForFixture, smRefreshLive } from "./sportmonks";
import type { ContextPayload, LineupPayload, OddsWrite, RawFixture } from "./types";
import { extrairCartoes } from "./cartoes";
import { isMainLeague } from "@/lib/mainLeagues";

/**
 * SISTEMA DE CASCATA do módulo Hub.
 *
 * Quatro APIs reais: ESPN, Football-Data.org, Sportmonks e Bzzoiro. Nenhuma
 * delas cobre tudo, e cada uma falha de um jeito diferente. Esta é a ordem
 * fixa — e a razão de cada posição:
 *
 *  FIXTURES      ESPN  ->  Football-Data.org  ->  Sportmonks (último recurso)
 *                (ESPN é grátis e sem chave; FD tem token e cobre tier-one;
 *                 SM só entra se os dois primeiros vierem vazios)
 *  ODDS          Sportmonks  ->  Bzzoiro  ->  ESPN
 *                (SM tem muitas casas incluindo Pinnacle; Bzzoiro tem consenso;
 *                 ESPN publica DraftKings no summary)
 *  LINEUPS       Sportmonks  ->  Bzzoiro  ->  ESPN
 *                (ESPN fecha a fila porque só publica XI oficial ~1h antes)
 *  STATS + H2H   Bzzoiro  ->  ESPN
 *
 * REGRA DE OURO: se nenhum fornecedor tiver o dado, não se grava nada. Sem odd,
 * a partida fica com probabilidade e sem tag de "Valor" (`pickOpportunity`
 * exige odd > 1.01, então nunca há oportunidade inventada).
 *
 * Toda função devolve `attempts`: quem respondeu, quem falhou e por quê. É o
 * que o relatório do `hub:sync` imprime e o que se olha quando algo some.
 */

export type Attempt = { provider: string; ok: boolean; reason?: string; count?: number };

export type FixtureSyncReport = {
  date: string;
  seen: number;
  created: number;
  /** Jogos recebidos do fornecedor e DESCARTADOS por não serem das 16 ligas. */
  discarded: number;
  attempts: Attempt[];
  source: string;
};

const motivo = (e: unknown) => String((e as Error)?.message || e || "falha").slice(0, 180);

/** Time: reaproveita o mesmo clube vindo de outro fornecedor (nome parecido na liga). */
async function resolveTeamId(input: {
  source: Provider;
  externalId: string;
  name: string;
  logo?: string | null;
  countryIso2?: string | null;
  leagueId: number;
}): Promise<number> {
  const [existente] = await db
    .select({ id: hubTeam.id })
    .from(hubTeam)
    .where(and(eq(hubTeam.source, input.source), eq(hubTeam.externalRef, input.externalId)))
    .limit(1);
  if (existente) {
    return upsertTeam({
      source: input.source,
      externalRef: input.externalId,
      name: input.name,
      logoUrl: input.logo,
      countryIso2: input.countryIso2,
      leagueId: input.leagueId,
    });
  }

  // Mesmo clube já gravado por outro fornecedor: casar por nome evita dividir
  // o histórico de forma entre ESPN e Football-Data.
  const candidatos = await db
    .select({ id: hubTeam.id, name: hubTeam.name })
    .from(hubTeam)
    .where(eq(hubTeam.leagueId, input.leagueId))
    .limit(400);
  let melhor: { id: number; score: number } | null = null;
  for (const c of candidatos) {
    const score = teamSimilarity(c.name, input.name);
    if (score >= 0.9 && (!melhor || score > melhor.score)) melhor = { id: c.id, score };
  }
  if (melhor) return melhor.id;

  return upsertTeam({
    source: input.source,
    externalRef: input.externalId,
    name: input.name,
    logoUrl: input.logo,
    countryIso2: input.countryIso2,
    leagueId: input.leagueId,
  });
}

/** Grava uma fixture crua de qualquer fornecedor e devolve o id interno.
 *
 * PORTA DE ENTRADA DO `hub_fixture`: nenhuma linha nasce sem passar por aqui.
 * Por isso o filtro de ligas vive AQUI e não em cada fornecedor — ESPN,
 * Football-Data, Sportmonks e Bzzoiro são todos podados no mesmo ponto.
 *
 * Devolve `null` quando a liga não é uma das 16 permitidas: o jogo é descartado
 * antes de existir time, liga ou partida no banco (não sobra lixo de Bolívia,
 * liga de base ou copa regional na base). Chamar de qualquer job (cron, rota
 * manual ou CLI, todos via `sync-runner`) passa pelo mesmo veto.
 */
export async function persistFixture(raw: RawFixture): Promise<number | null> {
  // Etapa 0 — VETO DE LIGA. Roda antes de qualquer escrita.
  if (!isMainLeague(raw.league.name, raw.league.countryName ?? raw.league.countryIso2 ?? null)) {
    return null;
  }

  const leagueId = await upsertLeague({
    source: raw.source,
    externalRef: raw.league.externalId,
    name: raw.league.name,
    logoUrl: raw.league.logo ?? null,
    countryIso2: raw.league.countryIso2 ?? null,
    countryName: raw.league.countryName ?? null,
    competitionType: competitionTypeFor(raw.league.name, Boolean(raw.league.isCup)),
    isCup: raw.league.isCup,
    sportmonksId: raw.source === "sportmonks" ? Number(raw.externalId) : null,
  });

  const seasonId = raw.league.seasonKey
    ? await ensureSeason(leagueId, raw.league.seasonKey, raw.league.seasonName ?? raw.league.seasonKey)
    : null;

  const homeTeamId = await resolveTeamId({
    source: raw.source,
    externalId: raw.home.externalId,
    name: raw.home.name,
    logo: raw.home.logo,
    countryIso2: raw.home.countryIso2,
    leagueId,
  });
  const awayTeamId = await resolveTeamId({
    source: raw.source,
    externalId: raw.away.externalId,
    name: raw.away.name,
    logo: raw.away.logo,
    countryIso2: raw.away.countryIso2,
    leagueId,
  });

  const valores = {
    leagueId,
    seasonId,
    homeTeamId,
    awayTeamId,
    matchDate: raw.kickoff,
    liveState: raw.liveState,
    homeScore: raw.homeScore,
    awayScore: raw.awayScore,
    homeRedCards: raw.homeRedCards ?? null,
    awayRedCards: raw.awayRedCards ?? null,
    minutesPlayed: raw.minutesPlayed ?? null,
    venueName: raw.venueName ?? null,
    venueCity: raw.venueCity ?? null,
    stageName: raw.stageName ?? null,
    roundName: raw.roundName ?? null,
    isCup: raw.isCup ?? raw.league.isCup,
    sportmonksId: raw.sportmonksId ?? null,
  };

  // Jogo que o fornecedor já entregou antes -> caminho normal, idempotente.
  const [jaExiste] = await db
    .select({ id: hubFixture.id })
    .from(hubFixture)
    .where(and(eq(hubFixture.source, raw.source), eq(hubFixture.externalRef, raw.externalId)))
    .limit(1);

  let fixtureId: number;
  if (jaExiste) {
    fixtureId = await upsertFixture({ source: raw.source, externalRef: raw.externalId, ...valores });
  } else {
    // Antes de criar: a partida já existe por outro fornecedor (fallback sobre
    // metade da rodada)? Então só vinculamos o id novo à fixture existente.
    const duplicada = await findFixtureByTeams({
      matchDate: raw.kickoff,
      homeName: raw.home.name,
      awayName: raw.away.name,
      minScore: 0.9,
    });
    fixtureId = duplicada ?? (await upsertFixture({ source: raw.source, externalRef: raw.externalId, ...valores }));
  }

  if (!jaExiste && fixtureId) await mergeFixtureState(fixtureId, raw);

  await linkProviderId(fixtureId, raw.source, raw.externalId);
  return fixtureId;
}

/** Atualiza placar/estado de uma fixture que nasceu em outro fornecedor. */
async function mergeFixtureState(fixtureId: number, raw: RawFixture): Promise<void> {
  const [atual] = await db.select().from(hubFixture).where(eq(hubFixture.id, fixtureId)).limit(1);
  if (!atual) return;
  const ranking = (s: string) => (s === "FT" || s === "AET" ? 3 : s === "NS" || s === "POSTPONED" ? 0 : 1);
  const liveState = ranking(atual.liveState) > ranking(raw.liveState) ? atual.liveState : raw.liveState;
  const finished = liveState === "FT" || liveState === "AET";
  const homeScore = raw.homeScore ?? atual.homeScore;
  const awayScore = raw.awayScore ?? atual.awayScore;
  await db
    .update(hubFixture)
    .set({
      liveState,
      homeScore,
      awayScore,
      ...(finished ? { homeScoreFt: homeScore, awayScoreFt: awayScore } : {}),
      updatedAt: new Date(),
    })
    .where(eq(hubFixture.id, fixtureId));
}

/** Grava as posições de tabela quando o fornecedor as entrega. */
async function applyTablePositions(raw: RawFixture, fixtureId: number): Promise<void> {
  if (raw.source !== "footballdata") return;
  const posicoes = await fdTablePositions(raw.league.externalId);
  const home = posicoes[raw.home.externalId];
  const away = posicoes[raw.away.externalId];
  if (home == null || away == null) return;
  await db
    .update(hubFixture)
    .set({ homeTablePosition: home, awayTablePosition: away, updatedAt: new Date() })
    .where(eq(hubFixture.id, fixtureId));
}

/* ================================ FIXTURES ================================ */

export async function syncFixturesCascade(dateIso: string): Promise<FixtureSyncReport> {
  const attempts: Attempt[] = [];
  let total = 0;
  let discarded = 0;
  let lastSource = "indisponível";

  const gravar = async (rows: RawFixture[], provider: string) => {
    let created = 0;
    let descartados = 0;
    for (const raw of rows) {
      try {
        if (Number.isNaN(raw.kickoff.getTime())) continue;
        const id = await persistFixture(raw);
        // `null` = jogo de liga fora das 16: não é erro, é veto.
        if (id == null) {
          // TODO(debug temporário): remover quando a ingestão de Champions/
          // Europa League estiver validada. Mostra exatamente o que o filtro
          // barrou, para separar "liga não mapeada" de "sem jogo no range".
          console.log(
            `[sync][descartado] ${raw.league.name} (${raw.league.countryName ?? raw.league.countryIso2 ?? "?"}) ` +
              `· ${raw.source} · ${raw.home.name} x ${raw.away.name}`,
          );
          descartados += 1;
          continue;
        }
        await applyTablePositions(raw, id);
        created += 1;
      } catch (e) {
        attempts.push({ provider, ok: false, reason: `falha ao gravar ${raw.home.name} x ${raw.away.name}: ${motivo(e)}` });
      }
    }
    discarded += descartados;
    return created;
  };

  // 1) ESPN — fonte primária de jogos.
  try {
    const rows = await espnFixturesForDate(dateIso);
    const created = await gravar(rows, "espn");
    attempts.push({ provider: "espn", ok: rows.length > 0, count: created, reason: rows.length ? undefined : "sem jogos na data" });
    if (rows.length) {
      total += created;
      lastSource = "ESPN";
    }
  } catch (e) {
    attempts.push({ provider: "espn", ok: false, reason: motivo(e) });
  }

  // 2) Football-Data.org — fallback quando a ESPN não trouxe nada.
  if (total === 0) {
    try {
      const rows = await fdFixturesForDate(dateIso);
      const created = await gravar(rows, "footballdata");
      attempts.push({ provider: "footballdata", ok: rows.length > 0, count: created, reason: rows.length ? undefined : "sem jogos na data" });
      if (rows.length) {
        total += created;
        lastSource = "Football-Data.org";
      }
    } catch (e) {
      attempts.push({ provider: "footballdata", ok: false, reason: motivo(e) });
    }
  } else {
    attempts.push({ provider: "footballdata", ok: false, reason: "não consultado (ESPN respondeu)" });
  }

  // 3) Sportmonks — último recurso, só se os dois primeiros vieram vazios.
  if (total === 0) {
    try {
      const rows = await smFixturesForDate(dateIso);
      const created = await gravar(rows, "sportmonks");
      attempts.push({ provider: "sportmonks", ok: rows.length > 0, count: created, reason: rows.length ? undefined : "sem jogos na data" });
      if (rows.length) {
        total += created;
        lastSource = "Sportmonks";
      }
    } catch (e) {
      attempts.push({ provider: "sportmonks", ok: false, reason: motivo(e) });
    }
  }

  return { date: dateIso, seen: total + discarded, created: total, discarded, attempts, source: lastSource };
}

/** Atualiza placar/estado dos jogos de hoje que já estão no banco. */
export async function refreshLiveCascade(): Promise<{ date: string; touched: number; attempts: Attempt[] }> {
  const hoje = new Date().toISOString().slice(0, 10);
  const attempts: Attempt[] = [];
  let touched = 0;

  try {
    const rows = await espnFixturesForDate(hoje);
    const aoVivo = rows.filter((r) => r.liveState !== "NS" || (r.homeScore ?? 0) + (r.awayScore ?? 0) > 0);
    for (const raw of aoVivo) {
      try {
        const id = await persistFixture(raw);
        if (id == null) continue; // liga fora das 16 — não existe no banco
        touched += 1;
      } catch (e) {
        attempts.push({ provider: "espn", ok: false, reason: motivo(e) });
      }
    }
    attempts.push({ provider: "espn", ok: true, count: touched });
  } catch (e) {
    attempts.push({ provider: "espn", ok: false, reason: motivo(e) });
  }

  try {
    const r = await smRefreshLive();
    touched += r.touched;
    attempts.push({ provider: "sportmonks", ok: true, count: r.touched });
  } catch (e) {
    attempts.push({ provider: "sportmonks", ok: false, reason: motivo(e) });
  }

  return { date: hoje, touched, attempts };
}

/* ================================== ODDS ================================== */

export type OddsSyncReport = {
  fixtureId: number;
  source: string;
  written: number;
  bookmakers: string[];
  attempts: Attempt[];
};

/** Liga da fixture (para saber o código ESPN da competição). */
async function leagueOf(fixtureId: number) {
  const rows = await db
    .select({
      id: hubLeague.id,
      source: hubLeague.source,
      externalRef: hubLeague.externalRef,
      isExperimental: hubLeague.isExperimental,
    })
    .from(hubFixture)
    .innerJoin(hubLeague, eq(hubLeague.id, hubFixture.leagueId))
    .where(eq(hubFixture.id, fixtureId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Acha o jogo equivalente no Sportmonks.
 *
 * Necessário porque a fixture pode ter nascido na ESPN: para pedir odds/lineup
 * à Sportmonks precisamos do id DELA para a mesma partida. Casa por nome dos
 * times na lista do dia e memoriza o vínculo em `hub_fixture_source`.
 */
async function resolveSportmonksFixture(ref: FixtureRef): Promise<{
  fixtureExternalId: string;
  homeExternalId: string;
  awayExternalId: string;
} | null> {
  const dia = ref.matchDate.toISOString().slice(0, 10);
  const rows = await cached(`hub:sm:fixtures:${dia}`, 120_000, () => smFixturesForDate(dia));
  let melhor: { row: RawFixture; score: number } | null = null;
  for (const row of rows) {
    const score = Math.min(teamSimilarity(row.home.name, ref.homeName), teamSimilarity(row.away.name, ref.awayName));
    if (score < 0.85) continue;
    if (!melhor || score > melhor.score) melhor = { row, score };
  }
  if (!melhor) return null;
  return {
    fixtureExternalId: melhor.row.externalId,
    homeExternalId: melhor.row.home.externalId,
    awayExternalId: melhor.row.away.externalId,
  };
}

async function writeOdds(fixtureId: number, rows: OddsWrite[]): Promise<{ written: number; bookmakers: string[] }> {
  const bookmakers = new Set<string>();
  let written = 0;
  for (const row of rows) {
    if (!Number.isFinite(row.odds) || row.odds <= 1.01) continue;
    bookmakers.add(row.bookmaker);
    await db
      .insert(hubBookmakerOdd)
      .values({
        fixtureId,
        market: row.market,
        selection: row.selection,
        bookmaker: row.bookmaker,
        bookmakerSlug: row.bookmakerSlug || slugify(row.bookmaker) || "desconhecida",
        odds: row.odds,
        isPick: Boolean(row.isPick),
        isKalshi: Boolean(row.isKalshi),
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [hubBookmakerOdd.fixtureId, hubBookmakerOdd.market, hubBookmakerOdd.selection, hubBookmakerOdd.bookmakerSlug],
        set: { odds: row.odds, isPick: Boolean(row.isPick), fetchedAt: new Date() },
      });
    written += 1;
  }
  return { written, bookmakers: [...bookmakers] };
}

/**
 * Odds de uma fixture: Sportmonks -> Bzzoiro -> ESPN.
 *
 * Devolve `source: "indisponível"` e `written: 0` quando ninguém cota o jogo.
 * Nesse caso o motor continua rodando (probabilidade existe), mas
 * `pickOpportunity` não acha odd e a UI fica sem tag de "Valor".
 */
export async function syncOddsCascade(fixtureId: number): Promise<OddsSyncReport> {
  const attempts: Attempt[] = [];
  const ref = await fixtureRef(fixtureId);
  if (!ref) throw new Error(`Fixture ${fixtureId} não encontrada.`);
  const ids = await providerIdsFor(fixtureId);

  // 1) Sportmonks
  try {
    let smId = ids.sportmonks ?? null;
    if (!smId) {
      const encontrado = await resolveSportmonksFixture(ref);
      if (encontrado) {
        smId = encontrado.fixtureExternalId;
        await linkProviderId(fixtureId, "sportmonks", smId);
      }
    }
    if (smId) {
      const rows = await smOddsForFixture(smId);
      const { written, bookmakers } = await writeOdds(fixtureId, rows);
      attempts.push({
        provider: "sportmonks",
        ok: written > 0,
        count: written,
        reason: written ? undefined : "jogo sem odds publicadas",
      });
      if (written) return { fixtureId, source: "Sportmonks", written, bookmakers, attempts };
    } else {
      attempts.push({ provider: "sportmonks", ok: false, reason: "jogo não encontrado no Sportmonks" });
    }
  } catch (e) {
    attempts.push({ provider: "sportmonks", ok: false, reason: motivo(e) });
  }

  // 2) Bzzoiro (consenso de casas)
  try {
    let eventId: string | null = ids.bzzoiro ?? null;
    if (!eventId) {
      eventId = await bzFindEventId({ kickoff: ref.matchDate, homeName: ref.homeName, awayName: ref.awayName });
      if (eventId) await linkProviderId(fixtureId, "bzzoiro", eventId);
    }
    if (eventId) {
      const rows = await bzOddsForEvent(eventId);
      const { written, bookmakers } = await writeOdds(fixtureId, rows);
      attempts.push({ provider: "bzzoiro", ok: written > 0, count: written, reason: written ? undefined : "evento sem odds" });
      if (written) return { fixtureId, source: "Bzzoiro", written, bookmakers, attempts };
    } else {
      attempts.push({ provider: "bzzoiro", ok: false, reason: "evento não encontrado" });
    }
  } catch (e) {
    attempts.push({ provider: "bzzoiro", ok: false, reason: motivo(e) });
  }

  // 3) ESPN (DraftKings no summary)
  try {
    const liga = await leagueOf(fixtureId);
    const espnId = ids.espn ?? null;
    if (espnId && liga?.source === "espn" && liga.externalRef) {
      const rows = await espnOddsForFixture(liga.externalRef, espnId);
      const { written, bookmakers } = await writeOdds(fixtureId, rows);
      attempts.push({ provider: "espn", ok: written > 0, count: written, reason: written ? undefined : "summary sem pickcenter" });
      if (written) return { fixtureId, source: "ESPN", written, bookmakers, attempts };
    } else {
      attempts.push({ provider: "espn", ok: false, reason: "sem id ESPN para este jogo" });
    }
  } catch (e) {
    attempts.push({ provider: "espn", ok: false, reason: motivo(e) });
  }

  return { fixtureId, source: "indisponível", written: 0, bookmakers: [], attempts };
}

/* ================================ LINEUPS ================================ */

export type LineupSyncReport = {
  fixtureId: number;
  source: string;
  confirmed: boolean;
  players: number;
  attempts: Attempt[];
};

async function writeLineups(fixtureId: number, payload: LineupPayload, provider: Provider): Promise<number> {
  const [fixture] = await db
    .select({ homeTeamId: hubFixture.homeTeamId, awayTeamId: hubFixture.awayTeamId })
    .from(hubFixture)
    .where(eq(hubFixture.id, fixtureId))
    .limit(1);
  if (!fixture) return 0;

  await db.delete(hubLineupPlayer).where(eq(hubLineupPlayer.fixtureId, fixtureId));

  let gravados = 0;
  const lados: Array<{ teamId: number; players: LineupPayload["home"]["players"] }> = [
    { teamId: fixture.homeTeamId, players: payload.home.players },
    { teamId: fixture.awayTeamId, players: payload.away.players },
  ];

  for (const lado of lados) {
    for (const p of lado.players) {
      let playerId: number | null = null;
      try {
        playerId = await upsertPlayer({
          source: provider,
          externalRef: p.externalId || p.name,
          name: p.name,
          position: p.position ?? null,
          shirtNumber: p.shirtNumber ?? null,
          teamId: lado.teamId,
        });
      } catch {
        playerId = null; // jogador sem id utilizável não impede a escalação
      }
      await db
        .insert(hubLineupPlayer)
        .values({
          fixtureId,
          teamId: lado.teamId,
          playerId,
          role: p.role,
          position: p.position ?? null,
          shirtNumber: p.shirtNumber ?? null,
          isCaptain: Boolean(p.isCaptain),
          formationPosition: p.formationPosition ?? null,
          injuryType: p.injuryType ?? null,
        })
        .onConflictDoNothing();
      gravados += 1;
    }
  }

  await db
    .insert(hubLineup)
    .values({
      fixtureId,
      confirmed: payload.confirmed,
      homeFormation: payload.home.formation,
      awayFormation: payload.away.formation,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: hubLineup.fixtureId,
      set: {
        confirmed: payload.confirmed,
        homeFormation: payload.home.formation,
        awayFormation: payload.away.formation,
        updatedAt: new Date(),
      },
    });

  return gravados;
}

/**
 * Escalação de uma fixture: Sportmonks -> Bzzoiro -> ESPN.
 *
 * Só marcamos `confirmed: true` quando o fornecedor entrega XI completo dos
 * dois lados (o Bzzoiro em modo "predicted" entra como NÃO confirmado). É esse
 * booleano que autoriza a análise Final, e só ela cria oportunidade.
 */
export async function syncLineupsCascade(fixtureId: number): Promise<LineupSyncReport> {
  const attempts: Attempt[] = [];
  const ref = await fixtureRef(fixtureId);
  if (!ref) throw new Error(`Fixture ${fixtureId} não encontrada.`);
  const ids = await providerIdsFor(fixtureId);

  // 1) Sportmonks
  try {
    let smId: string | null = ids.sportmonks ?? null;
    if (!smId) {
      const encontrado = await resolveSportmonksFixture(ref);
      if (encontrado) {
        smId = encontrado.fixtureExternalId;
        await linkProviderId(fixtureId, "sportmonks", smId);
      }
    }
    if (smId) {
      const payload = await smLineupsForFixture(smId);
      if (payload) {
        const players = await writeLineups(fixtureId, payload, "sportmonks");
        attempts.push({ provider: "sportmonks", ok: true, count: players });
        return { fixtureId, source: "Sportmonks", confirmed: payload.confirmed, players, attempts };
      }
      attempts.push({ provider: "sportmonks", ok: false, reason: "escalação ainda não publicada" });
    } else {
      attempts.push({ provider: "sportmonks", ok: false, reason: "jogo não encontrado no Sportmonks" });
    }
  } catch (e) {
    attempts.push({ provider: "sportmonks", ok: false, reason: motivo(e) });
  }

  // 2) Bzzoiro
  try {
    let eventId: string | null = ids.bzzoiro ?? null;
    if (!eventId) {
      eventId = await bzFindEventId({ kickoff: ref.matchDate, homeName: ref.homeName, awayName: ref.awayName });
      if (eventId) await linkProviderId(fixtureId, "bzzoiro", eventId);
    }
    if (eventId) {
      const payload = await bzLineupsForEvent(eventId);
      if (payload) {
        const players = await writeLineups(fixtureId, payload, "bzzoiro");
        attempts.push({ provider: "bzzoiro", ok: true, count: players });
        return { fixtureId, source: "Bzzoiro", confirmed: payload.confirmed, players, attempts };
      }
      attempts.push({ provider: "bzzoiro", ok: false, reason: "evento sem escalação" });
    } else {
      attempts.push({ provider: "bzzoiro", ok: false, reason: "evento não encontrado" });
    }
  } catch (e) {
    attempts.push({ provider: "bzzoiro", ok: false, reason: motivo(e) });
  }

  // 3) ESPN — último recurso; só vale quando a escalação é oficial.
  try {
    const liga = await leagueOf(fixtureId);
    const espnId = ids.espn ?? null;
    if (espnId && liga?.source === "espn" && liga.externalRef) {
      const payload = await espnLineupsForFixture(liga.externalRef, espnId);
      if (payload) {
        const players = await writeLineups(fixtureId, payload, "espn");
        attempts.push({ provider: "espn", ok: true, count: players });
        return { fixtureId, source: "ESPN", confirmed: payload.confirmed, players, attempts };
      }
      attempts.push({ provider: "espn", ok: false, reason: "summary sem escalação" });
    } else {
      attempts.push({ provider: "espn", ok: false, reason: "sem id ESPN para este jogo" });
    }
  } catch (e) {
    attempts.push({ provider: "espn", ok: false, reason: motivo(e) });
  }

  return { fixtureId, source: "indisponível", confirmed: false, players: 0, attempts };
}

/* ============================ STATS + H2H ============================ */

export type ContextSyncReport = {
  fixtureId: number;
  source: string;
  h2h: boolean;
  stats: boolean;
  attempts: Attempt[];
};

async function saveContext(fixtureId: number, provider: Provider, h2h: ContextPayload["h2h"], stats: ContextPayload["stats"]) {
  const [atual] = await db
    .select({ h2h: hubFixtureContext.h2h, stats: hubFixtureContext.stats, source: hubFixtureContext.source })
    .from(hubFixtureContext)
    .where(eq(hubFixtureContext.fixtureId, fixtureId))
    .limit(1);
  const source = h2h ? provider : atual?.source ?? provider;
  const statsFinal = stats ?? atual?.stats ?? null;
  await db
    .insert(hubFixtureContext)
    .values({
      fixtureId,
      source,
      h2h: h2h ?? atual?.h2h ?? null,
      stats: statsFinal,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: hubFixtureContext.fixtureId,
      set: {
        source,
        h2h: h2h ?? atual?.h2h ?? null,
        stats: statsFinal,
        fetchedAt: new Date(),
      },
    });

  await gravarCartoes(fixtureId, statsFinal);
}

/**
 * Persiste os cartões do jogo nas colunas de `hub_fixture`.
 *
 * Por que aqui e não na leitura: a média de cartões da liga era calculada
 * varrendo o JSON de contexto em cada request (até 120 jogos, busca por texto
 * na chave). Extrair no sync transforma isso num `avg()` de coluna.
 *
 * Regras:
 *  - só escreve a cor que veio: `null` do fornecedor NÃO apaga o que já existe;
 *  - chamado no mesmo ponto para Bzzoiro e ESPN, então não há dois caminhos de
 *    escrita para divergir.
 */
async function gravarCartoes(fixtureId: number, stats: ContextPayload["stats"]): Promise<void> {
  const cartoes = extrairCartoes(stats);
  if (!cartoes) return;

  const set: { yellowCards?: number; redCards?: number } = {};
  if (cartoes.yellow != null) set.yellowCards = cartoes.yellow;
  if (cartoes.red != null) set.redCards = cartoes.red;
  if (Object.keys(set).length === 0) return;

  await db.update(hubFixture).set(set).where(eq(hubFixture.id, fixtureId));
}

/** Estatística e H2H: Bzzoiro -> ESPN. Nada é gravado se ninguém responder. */
export async function syncContextCascade(fixtureId: number): Promise<ContextSyncReport> {
  const attempts: Attempt[] = [];
  const ref = await fixtureRef(fixtureId);
  if (!ref) throw new Error(`Fixture ${fixtureId} não encontrada.`);
  const ids = await providerIdsFor(fixtureId);

  const concluido = (source: string, h2h: boolean, stats: boolean): ContextSyncReport => ({
    fixtureId,
    source,
    h2h,
    stats,
    attempts,
  });

  // 1) Bzzoiro
  try {
    let eventId: string | null = ids.bzzoiro ?? null;
    if (!eventId) {
      eventId = await bzFindEventId({ kickoff: ref.matchDate, homeName: ref.homeName, awayName: ref.awayName });
      if (eventId) await linkProviderId(fixtureId, "bzzoiro", eventId);
    }
    if (eventId) {
      const h2h = await bzH2HForEvent(eventId).catch(() => null);
      const stats = await bzStatsForEvent(eventId).catch(() => null);
      if (h2h || stats) {
        await saveContext(fixtureId, "bzzoiro", h2h, stats);
        attempts.push({ provider: "bzzoiro", ok: true });
        return concluido("Bzzoiro", Boolean(h2h), Boolean(stats));
      }
      attempts.push({ provider: "bzzoiro", ok: false, reason: "evento sem stats/h2h" });
    } else {
      attempts.push({ provider: "bzzoiro", ok: false, reason: "evento não encontrado" });
    }
  } catch (e) {
    attempts.push({ provider: "bzzoiro", ok: false, reason: motivo(e) });
  }

  // 2) ESPN
  try {
    const liga = await leagueOf(fixtureId);
    const espnId = ids.espn ?? null;
    if (espnId && liga?.source === "espn" && liga.externalRef) {
      const h2h = await espnH2HForFixture(liga.externalRef, espnId, ref.homeName).catch(() => null);
      const stats = await espnStatsForFixture(liga.externalRef, espnId).catch(() => null);
      if (h2h || stats) {
        await saveContext(fixtureId, "espn", h2h, stats);
        attempts.push({ provider: "espn", ok: true });
        return concluido("ESPN", Boolean(h2h), Boolean(stats));
      }
      attempts.push({ provider: "espn", ok: false, reason: "summary sem stats/h2h" });
    } else {
      attempts.push({ provider: "espn", ok: false, reason: "sem id ESPN para este jogo" });
    }
  } catch (e) {
    attempts.push({ provider: "espn", ok: false, reason: motivo(e) });
  }

  return concluido("indisponível", false, false);
}
