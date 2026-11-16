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

/**
 * Cache das estatísticas COMPARATIVAS do time (mandante × visitante) de uma
 * partida — uma linha por jogo, porque `/fixtures/statistics` devolve os dois
 * times numa única resposta.
 *
 * Separada de `player_stats_cache` de propósito: contratos diferentes e
 * invalidação independente. Regra de validade na rota: 24h quando a partida
 * está encerrada (dado definitivo) e 5min quando está ao vivo.
 */
export const matchTeamStatsCache = pgTable("match_team_stats_cache", {
  matchId: text("match_id").primaryKey(),
  league: text("league").notNull().default(""),
  source: text("source").notNull().default(""),
  fixtureId: text("fixture_id").notNull().default(""),
  finalizada: boolean("finalizada").notNull().default(false),
  /** Lista de TeamStatMetric: { key, label, home, away, percent }. */
  payload: jsonb("payload").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("match_team_stats_updated_idx").on(t.updatedAt)]);

/**
 * Cache persistido da API pública do GameRead (módulo ISOLADO /gameread).
 *
 * Motivo: a API é de terceiros, sem contrato e sem SLA. Sem cache, cada visita
 * da tela vira uma requisição pesada lá (o props-radar devolve ~280 KB/624
 * props); com tráfego real isso rende bloqueio de IP. TTL de 15min aplicado na
 * rota, não aqui — a tabela só guarda o último payload conhecido.
 *
 * `cacheKey` já embute o endpoint e a data/id ("props_radar:2026-11-16"), então
 * a mesma tabela serve jogos do dia, props, linhas e comparação.
 */
export const gamereadCache = pgTable("gameread_cache", {
  cacheKey: text("cache_key").primaryKey(),
  endpoint: text("endpoint").notNull().default(""),
  dateKey: text("date_key"),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("gameread_cache_updated_idx").on(t.updatedAt)]);

/**
 * Props fixadas pelo usuário no radar do GameRead (módulo ISOLADO /gameread).
 *
 * `propKey` é o id estável montado pela lib (fixture:mercado:dono:linha:seleção),
 * então a mesma prop continua "pinada" entre uma sincronização e outra da API.
 * O payload relevante é denormalizado: se a API de terceiros sair do ar ou
 * mudar de formato, a lista do usuário continua legível.
 */
export const gamereadPinnedProps = pgTable("gameread_pinned_props", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propKey: text("prop_key").notNull(),
  market: text("market").notNull().default(""),
  marketLabel: text("market_label").notNull().default(""),
  selection: text("selection").notNull().default(""),
  line: real("line"),
  odd: real("odd"),
  bookmaker: text("bookmaker").notNull().default(""),
  subjectName: text("subject_name").notNull().default(""),
  subjectPhoto: text("subject_photo").notNull().default(""),
  homeName: text("home_name").notNull().default(""),
  awayName: text("away_name").notNull().default(""),
  leagueName: text("league_name").notNull().default(""),
  fixtureId: text("fixture_id").notNull().default(""),
  kickoffUtc: text("kickoff_utc").notNull().default(""),
  hitRateL10: real("hit_rate_l10"),
  score: real("score"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("gr_pin_user_prop").on(t.userId, t.propKey)]);

/**
 * Cache das fontes públicas do apitou.com.br (módulo ISOLADO /apitou).
 *
 * O /dados.js original tem ~22 MB — não dá para baixar no request do usuário.
 * um job protegido baixa, faz o parse e grava aqui o RESUMO do dia; as telas
 * consomem somente este payload enxuto, com refresh sob demanda.
 */
export const apitouCache = pgTable("apitou_cache", {
  cacheKey: text("cache_key").primaryKey(),
  kind: text("kind").notNull().default(""), // "semana" | "linhas"
  geradoEm: text("gerado_em"),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [index("apitou_cache_updated_idx").on(t.updatedAt)]);

/**
 * Desajustes fixados pelo usuário (props com vantagem modelo × mercado).
 * `propKey` = fixtureId:mercado:selecao:linha (id estável entre refreshes).
 */
export const apitouPinnedDesajustes = pgTable("apitou_pinned_desajustes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  propKey: text("prop_key").notNull(),
  mercado: text("mercado").notNull().default(""),
  selecao: text("selecao").notNull().default(""),
  linha: real("linha"),
  odd: real("odd"),
  probModelo: real("prob_modelo"),
  edge: real("edge"),
  qi: real("qi"),
  homeName: text("home_name").notNull().default(""),
  awayName: text("away_name").notNull().default(""),
  fixtureId: text("fixture_id").notNull().default(""),
  kickoffUtc: text("kickoff_utc").notNull().default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("apt_pin_user_prop").on(t.userId, t.propKey)]);

/**
 * Eventos do Stripe já processados (idempotência do webhook).
 *
 * O Stripe reentrega um evento quando não recebe 2xx, e em pagamentos com
 * retry isso é rotina. Sem este registro, cada reentrega somaria mais dias de
 * VIP ao usuário. A PK no id do evento faz a segunda inserção falhar.
 */
export const stripeEventos = pgTable("stripe_eventos", {
  id: text("id").primaryKey(),
  tipo: text("tipo").notNull().default(""),
  criadoEm: timestamp("criado_em").notNull().defaultNow(),
});
