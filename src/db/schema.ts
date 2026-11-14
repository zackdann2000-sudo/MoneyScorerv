import { pgTable, serial, text, integer, timestamp, boolean, jsonb, real, uniqueIndex } from "drizzle-orm/pg-core";

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