import {
  pgTable,
  serial,
  bigserial,
  text,
  integer,
  real,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  index,
  uniqueIndex,
  primaryKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./schema";

/**
 * MÓDULO HUB — clone funcional do DumbleScore.
 *
 * Regras que o esquema precisa garantir (e que o resto do código assume):
 *
 *  1. `hub_analysis` é imutável por (fixture, tipo, versão). Nunca sobrescreve
 *     a análise publicada — publicar de novo cria versão nova, preservando o
 *     histórico que o site expõe publicamente.
 *  2. `hub_opportunity` é um LEDGER append-only de 1 unidade por análise final.
 *     O resultado (`won`/`lost`/`void`) nunca muda depois de gravado: a
 *     correção é uma linha nova? Não — correção é `update` apenas de
 *     `pending -> won|lost|void`, uma única vez, feito por `settle.ts`.
 *  3. Liga experimental (`is_experimental`) gera oportunidade mas com
 *     `is_experimental = true`, e todas as leituras de desempenho filtram
 *     `is_experimental = false`.
 *  4. Preview NUNCA cria oportunidade — só análise do tipo `Final` cria.
 *  5. Lineup é por partida e por time; o papel (`xi`/`bench`/`sidelined`)
 *     participa da chave porque o mesmo jogador pode estar no XI de um lado.
 */

export const hubLeague = pgTable("hub_league", {
  id: serial("id").primaryKey(),
  /** Chave do fornecedor de origem (espn | footballdata | sportmonks | bzzoiro). */
  source: text("source").notNull().default("sportmonks"),
  /** Id da liga NO fornecedor de origem. Identidade canônica junto de `source`. */
  externalRef: text("external_ref"),
  /** Preenchido só quando a linha veio da Sportmonks (compatibilidade). */
  sportmonksId: integer("sportmonks_id").unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  countryIso2: text("country_iso2"),
  countryName: text("country_name"),
  /** Liga | Cup | International — mesmo vocabulário do provedor. */
  competitionType: text("competition_type").notNull().default("Liga"),
  /** Só liga rastreada entra no Centro de Jogos como liga "cheia". */
  isTracked: boolean("is_tracked").notNull().default(true),
  /** Ligas em teste: entram com aviso e ficam FORA das estatísticas. */
  isExperimental: boolean("is_experimental").notNull().default(false),
  /**
   * Regra de desempate da competição, ordenada do critério mais forte ao mais fraco.
   *
   * É DADO, não código: o Brasileirão desempata por VITÓRIAS antes do saldo de
   * gols, e as ligas europeias por SALDO antes de vitórias. Ordenar todo mundo
   * pela regra europeia publica uma tabela errada e plausível (ver
   * `lib/hub/tiebreak.ts` e `scripts/probe-tiebreak.mjs`).
   */
  tiebreakRules: jsonb("tiebreak_rules")
    .$type<string[]>()
    .notNull()
    .default(sql`'["points","goalDifference","goalsFor"]'::jsonb`),
  /** Copa/mata-mata: quando não há tabela, a UI mostra bracket e não "sem dados". */
  hasKnockout: boolean("has_knockout").notNull().default(false),
  oddsProviderId: integer("odds_provider_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("hub_league_country_idx").on(t.countryIso2),
  index("hub_league_tracked_idx").on(t.isTracked),
  uniqueIndex("hub_league_source_ref_uq").on(t.source, t.externalRef),
]);

export const hubSeason = pgTable("hub_season", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull().references(() => hubLeague.id, { onDelete: "cascade" }),
  sportmonksId: integer("sportmonks_id"),
  /** 2026-2027 */
  seasonKey: text("season_key").notNull(),
  name: text("name").notNull().default(""),
  isCurrent: boolean("is_current").notNull().default(false),
}, (t) => [
  uniqueIndex("hub_season_league_key_uq").on(t.leagueId, t.seasonKey),
  index("hub_season_current_idx").on(t.isCurrent),
]);

export const hubTeam = pgTable("hub_team", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().default("sportmonks"),
  externalRef: text("external_ref"),
  sportmonksId: integer("sportmonks_id").unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logoUrl: text("logo_url"),
  countryIso2: text("country_iso2"),
  leagueId: integer("league_id").references(() => hubLeague.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("hub_team_slug_idx").on(t.slug),
  index("hub_team_league_idx").on(t.leagueId),
  uniqueIndex("hub_team_source_ref_uq").on(t.source, t.externalRef),
]);

export const hubPlayer = pgTable("hub_player", {
  id: serial("id").primaryKey(),
  source: text("source").notNull().default("sportmonks"),
  externalRef: text("external_ref"),
  sportmonksId: integer("sportmonks_id").unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  imageUrl: text("image_url"),
  position: text("position"),
  detailedPosition: text("detailed_position"),
  shirtNumber: integer("shirt_number"),
  nationality: text("nationality"),
  dateOfBirth: date("date_of_birth"),
  height: integer("height"),
  weight: integer("weight"),
  teamId: integer("team_id").references(() => hubTeam.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("hub_player_team_idx").on(t.teamId),
  index("hub_player_slug_idx").on(t.slug),
  uniqueIndex("hub_player_source_ref_uq").on(t.source, t.externalRef),
]);

export const hubFixture = pgTable("hub_fixture", {
  id: serial("id").primaryKey(),
  /** Fornecedor que criou a linha e o id do jogo nele. */
  source: text("source").notNull().default("sportmonks"),
  externalRef: text("external_ref"),
  sportmonksId: integer("sportmonks_id").unique(),
  leagueId: integer("league_id").notNull().references(() => hubLeague.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").references(() => hubSeason.id, { onDelete: "set null" }),
  stageName: text("stage_name"),
  roundName: text("round_name"),
  matchDate: timestamp("match_date", { withTimezone: true }).notNull(),
  venueName: text("venue_name"),
  venueCity: text("venue_city"),
  homeTeamId: integer("home_team_id").notNull().references(() => hubTeam.id, { onDelete: "cascade" }),
  awayTeamId: integer("away_team_id").notNull().references(() => hubTeam.id, { onDelete: "cascade" }),
  homeScore: integer("home_score").notNull().default(0),
  awayScore: integer("away_score").notNull().default(0),
  homeScoreFt: integer("home_score_ft").notNull().default(0),
  awayScoreFt: integer("away_score_ft").notNull().default(0),
  homeRedCards: integer("home_red_cards").notNull().default(0),
  awayRedCards: integer("away_red_cards").notNull().default(0),
  /**
   * Cartões amarelos DO JOGO (mandante + visitante).
   *
   * `null` = o fornecedor não informou, e isso é diferente de 0: a média da
   * liga ignora null em vez de contar o jogo como “jogo sem cartão”. Foi por
   * isso que a coluna virou retrato no banco — a média antes dependia de varrer
   * o JSON de contexto a cada request.
   */
  yellowCards: integer("yellow_cards"),
  /**
   * Cartões vermelhos DO JOGO (soma dos dois lados). Mesma semântica de null.
   *
   * As colunas por lado (`home_red_cards`/`away_red_cards`) continuam existindo
   * por compatibilidade com o contrato antigo do `upsertFixture`; quem manda é
   * este total, escrito junto com o contexto da partida.
   */
  redCards: integer("red_cards"),
  minutesPlayed: integer("minutes_played").notNull().default(0),
  /** NS | INPLAY_1ST_HALF | HT | INPLAY_2ND_HALF | FT | AET | POSTPONED */
  liveState: text("live_state").notNull().default("NS"),
  isCup: boolean("is_cup").notNull().default(false),
  isPostponed: boolean("is_postponed").notNull().default(false),
  homeTablePosition: integer("home_table_position"),
  awayTablePosition: integer("away_table_position"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("hub_fixture_date_idx").on(t.matchDate),
  index("hub_fixture_league_date_idx").on(t.leagueId, t.matchDate),
  index("hub_fixture_live_idx").on(t.liveState),
  uniqueIndex("hub_fixture_source_ref_uq").on(t.source, t.externalRef),
]);

/**
 * Vínculo entre uma fixture interna e o id dela em cada fornecedor.
 *
 * O jogo nasce na ESPN, mas as odds podem vir da Sportmonks/Bzzoiro; sem esta
 * tabela cada motor de sync teria de recasar times por nome em todo ciclo.
 * A chave (provider, externalId) é única: um id de provedor aponta para um jogo.
 */
export const hubFixtureSource = pgTable("hub_fixture_source", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  /** espn | footballdata | sportmonks | bzzoiro */
  provider: text("provider").notNull(),
  externalId: text("external_id").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_fixture_source_uq").on(t.provider, t.externalId),
  index("hub_fixture_source_fixture_idx").on(t.fixtureId),
]);

/**
 * Contexto por partida que não cabe no motor Poisson mas o produto exibe:
 * confronto direto (H2H) e estatísticas do jogo. Guardado como JSON do
 * fornecedor, sem reinterpretação — nulo quando nenhum fornecedor respondeu.
 */
export const hubFixtureContext = pgTable("hub_fixture_context", {
  fixtureId: integer("fixture_id").primaryKey().references(() => hubFixture.id, { onDelete: "cascade" }),
  /** espn | bzzoiro | sportmonks */
  source: text("source").notNull(),
  h2h: jsonb("h2h").$type<HubH2H | null>(),
  stats: jsonb("stats").$type<HubMatchStats | null>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Classificação de uma competição — RETRATO, não histórico.
 *
 * Antes desta tabela a classificação vinha do fornecedor a cada request
 * (`/api/standings`), o que significava: fornecedor fora do ar = aba vazia,
 * e nenhuma possibilidade de aplicar/auditar a regra de desempate.
 *
 * Decisões que o esquema garante:
 *
 *  1. `season_id` e `stage_name` são NOT NULL de propósito. Em índice único,
 *     NULLs são DISTINTOS no Postgres: `unique (league, season, stage, team)`
 *     com `season_id` nulo aceitaria a mesma linha duas vezes. Tornar as duas
 *     colunas obrigatórias fecha esse buraco em vez de confiar em `coalesce()`.
 *  2. `goal_diff` é derivado (GF - GC), mas é coluna materializada e o sync
 *     recalcula GF/GC/SG juntos na mesma transação. Coluna gerada seria mais
 *     segura; materializada foi escolhida para o upsert conseguir gravar o
 *     retrato do fornecedor sem divergir do Drizzle.
 *  3. A linha é um retrato do fornecedor: quando o time some da tabela, a linha
 *     é apagada pelo sync (não fica órfã mostrando posição velha).
 */
export const hubStanding = pgTable("hub_standing", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leagueId: integer("league_id").notNull().references(() => hubLeague.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").notNull().references(() => hubSeason.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => hubTeam.id, { onDelete: "cascade" }),
  /** "Regular Season" | "Group A" | "Championship Round". '' = tabela única. */
  stageName: text("stage_name").notNull().default(""),
  /** Posição JÁ calculada pela regra da competição (ver tiebreak.ts). */
  position: integer("position").notNull(),
  played: integer("played").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  draws: integer("draws").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  goalsFor: integer("goals_for").notNull().default(0),
  goalsAgainst: integer("goals_against").notNull().default(0),
  /** Derivado: goals_for - goals_against, gravado pelo sync junto com os dois. */
  goalDiff: integer("goal_diff").notNull().default(0),
  points: integer("points").notNull().default(0),
  /** Últimos 5, do mais antigo ao mais novo ("VVEED"). Alimenta FormDots. */
  form: text("form"),
  formHome: text("form_home"),
  formAway: text("form_away"),
  /** espn | footballdata */
  source: text("source").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_standing_uq").on(t.leagueId, t.seasonId, t.stageName, t.teamId),
  index("hub_standing_order_idx").on(t.leagueId, t.seasonId, t.stageName, t.position),
  index("hub_standing_team_idx").on(t.teamId),
  check("hub_standing_position_chk", sql`${t.position} >= 1`),
  check("hub_standing_played_chk", sql`${t.played} >= ${t.wins} + ${t.draws} + ${t.losses}`),
  check("hub_standing_goal_diff_chk", sql`${t.goalDiff} = ${t.goalsFor} - ${t.goalsAgainst}`),
]);

export const hubAnalysis = pgTable("hub_analysis", {
  id: serial("id").primaryKey(),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  /** Preview | Final | Review */
  analysisType: text("analysis_type").notNull(),
  lineupsIncluded: boolean("lineups_included").notNull().default(false),
  analysisText: text("analysis_text").notNull().default(""),
  /**
   * Resumo calculado: kind, favouriteSide, favouriteStrength, topProbability,
   * xgHome, xgAway, expectedTotalGoals, over25Probability, bttsProbability.
   */
  summary: jsonb("summary").$type<HubAnalysisSummary>(),
  confidence: integer("confidence"),
  predictedHomeGoals: real("predicted_home_goals"),
  predictedAwayGoals: real("predicted_away_goals"),
  keyFactors: jsonb("key_factors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  riskFactors: jsonb("risk_factors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  labInsights: jsonb("lab_insights").$type<HubLabInsight[]>().notNull().default(sql`'[]'::jsonb`),
  modelVersion: text("model_version").notNull().default("v1"),
  promptId: integer("prompt_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_analysis_fixture_type_version_uq").on(t.fixtureId, t.analysisType, t.version),
  index("hub_analysis_fixture_idx").on(t.fixtureId),
  check("hub_analysis_type_chk", sql`${t.analysisType} in ('Preview', 'Final', 'Review')`),
]);

export const hubPredictionRow = pgTable("hub_prediction", {
  analysisId: integer("analysis_id").notNull().references(() => hubAnalysis.id, { onDelete: "cascade" }),
  /** 1X2 | Over/Under | BTTS | DoubleChance */
  market: text("market").notNull(),
  /** Home | Draw | Away | Yes | No | HomeOrDraw | Over 2.5 | Under 3.5 ... */
  selection: text("selection").notNull(),
  probability: real("probability").notNull(),
}, (t) => [primaryKey({ columns: [t.analysisId, t.market, t.selection] })]);

export const hubTopScore = pgTable("hub_top_score", {
  analysisId: integer("analysis_id").notNull().references(() => hubAnalysis.id, { onDelete: "cascade" }),
  home: integer("home").notNull(),
  away: integer("away").notNull(),
  probability: real("probability").notNull(),
}, (t) => [primaryKey({ columns: [t.analysisId, t.home, t.away] })]);

export const hubXgFactor = pgTable("hub_xg_factor", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  analysisId: integer("analysis_id").notNull().references(() => hubAnalysis.id, { onDelete: "cascade" }),
  /** Home | Away */
  side: text("side").notNull(),
  /** MissingKeyPlayer | WeakDefense | StandingsAdvantage | ... */
  factorType: text("factor_type").notNull(),
  impact: real("impact").notNull().default(0),
  weight: real("weight").notNull().default(0),
  context: jsonb("context").$type<Record<string, unknown>>(),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
}, (t) => [
  index("hub_xg_factor_analysis_idx").on(t.analysisId),
  uniqueIndex("hub_xg_factor_uq").on(t.analysisId, t.side, t.factorType),
]);

export const hubValueBet = pgTable("hub_value_bet", {
  analysisId: integer("analysis_id").primaryKey().references(() => hubAnalysis.id, { onDelete: "cascade" }),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  probability: real("probability").notNull(),
  odds: real("odds").notNull(),
  value: real("value").notNull(),
  /** Break-even do modelo (1/p). Odd abaixo disso é EV negativo. */
  maxPlayableOdds: real("max_playable_odds"),
  isHotPick: boolean("is_hot_pick").notNull().default(false),
  isSubstitution: boolean("is_substitution").notNull().default(false),
});

export const hubBookmakerOdd = pgTable("hub_bookmaker_odd", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  bookmaker: text("bookmaker").notNull(),
  bookmakerSlug: text("bookmaker_slug").notNull(),
  odds: real("odds").notNull(),
  isPick: boolean("is_pick").notNull().default(false),
  isKalshi: boolean("is_kalshi").notNull().default(false),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_bookmaker_odd_uq").on(t.fixtureId, t.market, t.selection, t.bookmakerSlug),
  index("hub_bookmaker_odd_fixture_idx").on(t.fixtureId),
]);

export const hubLineup = pgTable("hub_lineup", {
  fixtureId: integer("fixture_id").primaryKey().references(() => hubFixture.id, { onDelete: "cascade" }),
  confirmed: boolean("confirmed").notNull().default(false),
  homeFormation: text("home_formation"),
  awayFormation: text("away_formation"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hubLineupPlayer = pgTable("hub_lineup_player", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => hubTeam.id, { onDelete: "cascade" }),
  playerId: integer("player_id").references(() => hubPlayer.id, { onDelete: "set null" }),
  /** xi | bench | sidelined */
  role: text("role").notNull(),
  position: text("position"),
  shirtNumber: integer("shirt_number"),
  isCaptain: boolean("is_captain").notNull().default(false),
  formationPosition: integer("formation_position"),
  injuryType: text("injury_type"),
  expectedReturn: date("expected_return"),
}, (t) => [
  uniqueIndex("hub_lineup_player_uq").on(t.fixtureId, t.teamId, t.playerId, t.role),
  index("hub_lineup_player_fixture_idx").on(t.fixtureId),
  check("hub_lineup_player_role_chk", sql`${t.role} in ('xi', 'bench', 'sidelined')`),
]);

export const hubOpportunity = pgTable("hub_opportunity", {
  id: serial("id").primaryKey(),
  analysisId: integer("analysis_id").notNull().unique().references(() => hubAnalysis.id, { onDelete: "cascade" }),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  probability: real("probability").notNull(),
  odds: real("odds").notNull(),
  value: real("value").notNull(),
  stake: numeric("stake", { precision: 6, scale: 2 }).notNull().default("1.00"),
  /** pending | won | lost | void */
  outcome: text("outcome").notNull().default("pending"),
  /** Liga experimental: aparece na UI com aviso, nunca nas estatísticas. */
  isExperimental: boolean("is_experimental").notNull().default(false),
  profit: numeric("profit", { precision: 10, scale: 4 }),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("hub_opportunity_settled_idx").on(t.settledAt, t.outcome),
  index("hub_opportunity_fixture_idx").on(t.fixtureId),
  check("hub_opportunity_outcome_chk", sql`${t.outcome} in ('pending', 'won', 'lost', 'void')`),
  check("hub_opportunity_odds_chk", sql`${t.odds} > 1`),
]);

export const hubXgEvaluation = pgTable("hub_xg_evaluation", {
  opportunityId: integer("opportunity_id").primaryKey().references(() => hubOpportunity.id, { onDelete: "cascade" }),
  homeXg: real("home_xg"),
  awayXg: real("away_xg"),
  modelHome: integer("model_home"),
  modelAway: integer("model_away"),
  actualHome: integer("actual_home"),
  actualAway: integer("actual_away"),
  exact: boolean("exact").notNull().default(false),
  tendency: boolean("tendency").notNull().default(false),
  goalDifference: boolean("goal_difference").notNull().default(false),
  withinOneEach: boolean("within_one_each").notNull().default(false),
  /** hit | near | miss */
  grade: text("grade").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("hub_xg_evaluation_grade_chk", sql`${t.grade} in ('hit', 'near', 'miss')`)]);

export const hubScenario = pgTable("hub_scenario", {
  id: serial("id").primaryKey(),
  /** 3..5 pernas */
  size: integer("size").notNull(),
  combinedOdds: real("combined_odds").notNull(),
  expectedValue: real("expected_value"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("hub_scenario_size_chk", sql`${t.size} between 3 and 5`), index("hub_scenario_created_idx").on(t.createdAt)]);

export const hubScenarioLeg = pgTable("hub_scenario_leg", {
  scenarioId: integer("scenario_id").notNull().references(() => hubScenario.id, { onDelete: "cascade" }),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  odds: real("odds").notNull(),
}, (t) => [primaryKey({ columns: [t.scenarioId, t.fixtureId] })]);

export const hubArbitrage = pgTable("hub_arbitrage", {
  id: serial("id").primaryKey(),
  market: text("market").notNull(),
  /** Margem de lucro no papel: (1/soma dos inversos) - 1. */
  profitMargin: real("profit_margin").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("hub_arbitrage_created_idx").on(t.createdAt)]);

export const hubArbitrageLeg = pgTable("hub_arbitrage_leg", {
  arbitrageId: integer("arbitrage_id").notNull().references(() => hubArbitrage.id, { onDelete: "cascade" }),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  bookmaker: text("bookmaker").notNull(),
  selection: text("selection").notNull(),
  odds: real("odds").notNull(),
}, (t) => [primaryKey({ columns: [t.arbitrageId, t.fixtureId, t.bookmaker] })]);

export const hubOutlier = pgTable("hub_outlier", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  market: text("market").notNull(),
  selection: text("selection").notNull(),
  bookmaker: text("bookmaker").notNull(),
  odds: real("odds").notNull(),
  refOdds: real("ref_odds").notNull(),
  /** odds / refOdds - 1 */
  deviation: real("deviation").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("hub_outlier_fixture_idx").on(t.fixtureId), index("hub_outlier_created_idx").on(t.createdAt)]);

export const hubWatchlist = pgTable("hub_watchlist", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** opportunity | outlier | scenario */
  kind: text("kind").notNull(),
  refId: integer("ref_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.kind, t.refId] }),
  check("hub_watchlist_kind_chk", sql`${t.kind} in ('opportunity', 'outlier', 'scenario')`),
]);

export const hubFavoriteTeam = pgTable("hub_favorite_team", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: integer("team_id").notNull().references(() => hubTeam.id, { onDelete: "cascade" }),
  notify: boolean("notify").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.userId, t.teamId] })]);

export const hubPurchase = pgTable("hub_purchase", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** analysis | scenario | arbitrage */
  kind: text("kind").notNull(),
  refId: integer("ref_id").notNull(),
  credits: integer("credits").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_purchase_uq").on(t.userId, t.kind, t.refId),
  check("hub_purchase_kind_chk", sql`${t.kind} in ('analysis', 'scenario', 'arbitrage')`),
]);

/** Freemium: 3 jogos por semana, contados em semanas UTC. */
export const hubUsage = pgTable("hub_usage", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  fixtureId: integer("fixture_id").notNull().references(() => hubFixture.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.fixtureId] }),
  index("hub_usage_week_idx").on(t.userId, t.weekStart),
]);

export const hubPrompt = pgTable("hub_prompt", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").references(() => hubLeague.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  performance: jsonb("performance").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("hub_prompt_uq").on(t.leagueId, t.version)]);

export const hubJobLog = pgTable("hub_job_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jobName: text("job_name").notNull(),
  /** running | ok | error */
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  detail: jsonb("detail").$type<Record<string, unknown>>(),
}, (t) => [
  index("hub_job_log_name_idx").on(t.jobName, t.startedAt),
  check("hub_job_log_status_chk", sql`${t.status} in ('running', 'ok', 'error')`),
]);

/* ===== tipos compartilhados com o motor ===== */

export type HubAnalysisSummary = {
  kind: "favourite" | "balanced" | "low_goals";
  favouriteSide: "Home" | "Away" | "None";
  favouriteStrength: "slight" | "clear" | "strong" | "none";
  topProbability: number;
  xgHome: number;
  xgAway: number;
  expectedTotalGoals: number;
  over25Probability: number;
  bttsProbability: number;
  /**
   * Existiu odd real para este jogo?
   *
   * false = só probabilidade: a UI NÃO pode mostrar a tag de "Valor" nem
   * "odd" (não houve mercado para comparar). O motor já garante que, sem odd,
   * nenhuma oportunidade é criada — este campo existe para a tela saber disso
   * sem ter de cruzar `hub_bookmaker_odd`.
   */
  hasOdds?: boolean;
  /**
   * Jogos finalizados usados de cada lado quando a análise foi gerada.
   *
   * 0/0 = o motor não tinha histórico nenhum e a análise sairia da média da
   * liga, igual para todo jogo da competição (análise degenerada). O job lê
   * estes dois campos para regerar a análise quando o histórico chegar.
   */
  sampleHome?: number;
  sampleAway?: number;
};

/** Confronto direto resumido, como o fornecedor entregou. */
export type HubH2H = {
  matches: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  avgTotalGoals: number | null;
  recent: Array<{ date: string | null; home: string; away: string; homeScore: number | null; awayScore: number | null }>;
};

/** Estatística de partida (posse, finalizações, xG) por lado, sem inventar. */
export type HubMatchStats = Record<string, { home: number | string | null; away: number | string | null }>;

export type HubLabInsight = {
  patternType: string;
  rank: number;
  solidityScore: number;
  teamName: string;
  text: string;
};

/**
 * Produção ofensiva do jogador na temporada — insumo do ajuste de escalação.
 *
 * O motor usa gols + 0,7×assistências por 90 minutos. Sem esta tabela o ajuste
 * de escalação fica neutro, então ela é opcional para o sistema funcionar, mas
 * necessária para o diferencial do produto.
 */
export const hubPlayerStat = pgTable("hub_player_stat", {
  playerId: integer("player_id").notNull().references(() => hubPlayer.id, { onDelete: "cascade" }),
  seasonId: integer("season_id").notNull().references(() => hubSeason.id, { onDelete: "cascade" }),
  teamId: integer("team_id").references(() => hubTeam.id, { onDelete: "set null" }),
  appearances: integer("appearances").notNull().default(0),
  minutes: integer("minutes").notNull().default(0),
  goals: integer("goals").notNull().default(0),
  assists: integer("assists").notNull().default(0),
  shots: integer("shots").notNull().default(0),
  rating: real("rating"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.playerId, t.seasonId] }),
  index("hub_player_stat_season_idx").on(t.seasonId),
  index("hub_player_stat_team_idx").on(t.teamId),
]);

/* =======================================================================
   MÓDULO ÁRBITROS (feature #5 — recon Craque Stats)
   -----------------------------------------------------------------------
   Dois níveis, de propósito:

   - `hub_referee` guarda o AGREGADO que a fonte publica (jogos, amarelos,
     vermelhos, faltas, pênaltis da temporada/carreira). É o divisor das
     médias exibidas quando a amostra é grande.
   - `hub_referee_appearance` guarda cada jogo apitado que NÓS vimos
     (data + liga + placar). Sem ela o módulo morreria no dia 1: nenhum
     agregado diz *quais* jogos o árbitro apitou.

   Nenhuma das duas inventa número: coluna ausente é `null`, nunca 0. A regra
   está em `src/lib/arbitros.ts` (media() com divisor protegido).
   ======================================================================= */

/**
 * Árbitro consolidado. `nome_norm` (sem acento/caixa/espaço duplo) é a chave
 * de dedupe entre fontes — duas grafias do mesmo nome não viram dois árbitros.
 */
export const hubReferee = pgTable("hub_referee", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  nomeNorm: text("nome_norm").notNull().unique(),
  /** Agregado da fonte: divisor das médias quando existir. */
  jogos: integer("jogos"),
  amarelos: integer("amarelos"),
  vermelhos: integer("vermelhos"),
  faltas: integer("faltas"),
  penaltis: integer("penaltis"),
  /** Quem publicou o agregado (`apitou`, `sportmonks`, …). */
  fonte: text("fonte"),
  vistoEm: timestamp("visto_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("hub_referee_nome_idx").on(t.nomeNorm)]);

/**
 * Um jogo apitado por um árbitro. `fonte + fonte_ref` identifica o jogo na
 * origem, então o cron (que roda várias vezes por dia) só atualiza a linha.
 *
 * Cartões/faltas do jogo ficam `null` quando a fonte não entrega o número por
 * jogo — e é por isso que o agregado de `hub_referee` existe em paralelo.
 */
export const hubRefereeAppearance = pgTable("hub_referee_appearance", {
  id: serial("id").primaryKey(),
  refereeId: integer("referee_id").notNull().references(() => hubReferee.id, { onDelete: "cascade" }),
  matchDate: timestamp("match_date", { withTimezone: true }).notNull(),
  leagueName: text("league_name").notNull().default(""),
  homeName: text("home_name").notNull().default(""),
  awayName: text("away_name").notNull().default(""),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  amarelos: integer("amarelos"),
  vermelhos: integer("vermelhos"),
  faltas: integer("faltas"),
  penaltis: integer("penaltis"),
  fonte: text("fonte").notNull(),
  fonteRef: text("fonte_ref").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("hub_ref_appearance_uq").on(t.fonte, t.fonteRef),
  index("hub_ref_appearance_ref_idx").on(t.refereeId, t.matchDate),
]);
