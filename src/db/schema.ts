import { pgTable, serial, text, integer, timestamp, boolean, jsonb, real, uniqueIndex, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passHash: text("pass_hash").notNull(),
  role: text("role").notNull().default("user"), // user | admin | owner
  plan: text("plan").notNull().default("trial"), // free | trial | vip
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at"),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  provider: text("provider").primaryKey(), // espn | footballdata | sportmonks | bzzoiro | onesignal_rest
  token: text("token").notNull().default(""),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull().default(""),
  league: text("league").notNull().default(""),
  logo: text("logo").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("fav_user_team").on(t.userId, t.teamId)]);

export const alertPrefs = pgTable("alert_prefs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull().default("*"),
  matchId: text("match_id").notNull().default(""),
  alerts: jsonb("alerts").notNull().default({}),
}, (t) => [uniqueIndex("pref_user_team_match").on(t.userId, t.teamId, t.matchId)]);

export const pushSubs = pgTable("push_subs", {
  endpoint: text("endpoint").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  keys: jsonb("keys").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull().unique(),
  league: text("league").notNull().default(""),
  matchDate: timestamp("match_date"),
  homeName: text("home_name").notNull().default(""),
  awayName: text("away_name").notNull().default(""),
  modelType: text("model_type").notNull().default(""),
  pHome: real("p_home").notNull().default(0),
  pDraw: real("p_draw").notNull().default(0),
  pAway: real("p_away").notNull().default(0),
  pOver25: real("p_over25").notNull().default(0),
  fav: text("fav").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  settled: boolean("settled").notNull().default(false),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  brier: real("brier"),
});

export const picks = pgTable("picks", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  settled: boolean("settled").notNull().default(false),
  green: boolean("green"),
});

export const alertState = pgTable("alert_state", {
  matchId: text("match_id").primaryKey(),
  state: jsonb("state").notNull().default({}),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const visits = pgTable("visits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  path: text("path").notNull().default("/"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tipVotes = pgTable("tip_votes", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  voterKey: text("voter_key").notNull(),
  choice: text("choice").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("vote_match_voter").on(t.matchId, t.voterKey)]);

export const tipComments = pgTable("tip_comments", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  author: text("author").notNull().default("Torcedor"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tipLikes = pgTable("tip_likes", {
  id: serial("id").primaryKey(),
  voterKey: text("voter_key").notNull(),
  target: text("target").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("like_voter_target").on(t.voterKey, t.target)]);

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Múltipla"),
  legs: jsonb("legs").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Histórico imutável das picks publicadas (não substitui a tabela picks). */
export const pickLedger = pgTable("pick_ledger", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  date: text("date").notNull(),
  league: text("league").notNull().default(""),
  marketKey: text("market_key").notNull(),
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pendente"),
  oddMercado: real("odd_mercado"),
  oddJusta: real("odd_justa"),
  ev: real("ev"),
  profit: real("profit"),
  isPick: boolean("is_pick").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  settledAt: timestamp("settled_at"),
}, (t) => [uniqueIndex("ledger_match_market").on(t.matchId, t.marketKey)]);

export const consents = pgTable("consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  voterKey: text("voter_key"),
  push: boolean("push").notNull().default(false),
  terms: boolean("terms").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const deletionRequests = pgTable("deletion_requests", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  // Registro legal (LGPD): sobrevive à exclusão da conta, por isso SET NULL e não CASCADE.
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pendente"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Contador de rate limiting por janela fixa.
 *
 * A chave é `<escopo>:<identificador>` (ex.: `login:203.0.113.5`) e a janela é
 * representada por `windowStart` (truncado ao início do bloco). O contador é
 * incrementado atomicamente em src/lib/rateLimit.ts, e as linhas vencidas são
 * apagadas pela mesma rotina — não há job de limpeza separado.
 */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull().default(0),
  windowStart: timestamp("window_start").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
}, (t) => [index("rate_limits_expires_at_idx").on(t.expiresAt)]);
/**
 * Cache das estatísticas por jogador de UMA partida.
 *
 * Motivo: `/fixtures/players` da API-Football consome cota por requisição e o
 * plano gratuito permite apenas 100/dia. A regra é: consulta a API uma vez,
 * grava aqui, e passa a servir do banco. Para partidas ENCERRADAS o dado é
 * definitivo, então a linha vale 24h sem nova chamada (`finalizada`).
 *
 * `payload` guarda a lista já normalizada (nome, time, lado e os contadores),
 * para que a rota não precise reprocessar formatos de fornecedor differentes.
 */
export const playerStatsCache = pgTable("player_stats_cache", {
  matchId: text("match_id").primaryKey(),
  league: text("league").notNull().default(""),
  source: text("source").notNull().default(""),
  fixtureId: text("fixture_id").notNull().default(""),
  finalizada: boolean("finalizada").notNull().default(false),
  payload: jsonb("payload").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("player_stats_cache_updated_idx").on(t.updatedAt)]);

/**
 * Foto do jogador (TheSportsDB). Gravada uma única vez na vida por jogador —
 * `playerKey` é o nome normalizado. `photo` nulo significa "já consultamos e
 * não existe", evitando repetir a busca a cada requisição.
 */
export const playerPhotos = pgTable("player_photos", {
  playerKey: text("player_key").primaryKey(),
  playerName: text("player_name").notNull().default(""),
  photo: text("photo"),
  source: text("source").notNull().default("TheSportsDB"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Escudo de time (TheSportsDB) — apenas fallback quando a ESPN não trouxe. */
export const teamBadges = pgTable("team_badges", {
  teamKey: text("team_key").primaryKey(),
  teamName: text("team_name").notNull().default(""),
  badge: text("badge"),
  source: text("source").notNull().default("TheSportsDB"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
