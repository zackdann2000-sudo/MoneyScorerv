import { sql } from "drizzle-orm";
import { pgTable, serial, text, integer, timestamp, boolean, jsonb, real, uuid, check, uniqueIndex, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  /**
   * Id público (M4/D1). A PK continua `serial` — reescrever PK com sessão ativa,
   * FKs e webhook em produção é cirurgia de alto risco para um ganho que o
   * `public_id` entrega: id não enumerável para expor em URL/API.
   * `gen_random_uuid()` no banco garante o valor mesmo em INSERT fora do app.
   */
  publicId: uuid("public_id").notNull().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passHash: text("pass_hash").notNull(),
  role: text("role").notNull().default("user"), // user | admin | owner
  plan: text("plan").notNull().default("trial"), // free | trial | vip | starter | pro | expert
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  /**
   * QUOTA DIÁRIA. `plan` diz *o que* a pessoa pode ver, `dailyQuota` diz
   * *quanto por dia*: free 1, starter 6, pro 20, expert 999.
   * `quotaUsed` zera quando `quotaDay` deixa de ser hoje — a virada é
   * detectada na leitura (sem cron e sem job de reset).
   */
  dailyQuota: integer("daily_quota").notNull().default(1),
  quotaUsed: integer("quota_used").notNull().default(0),
  quotaDay: text("quota_day").notNull().default(""),
  /** UUID do dispositivo (localStorage) — base do anti-fraude do trial. */
  deviceId: text("device_id"),
  /** IP de origem do cadastro — segunda barreira do anti-fraude. */
  registrationIp: text("registration_ip"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** M4/D4 — tocado pelo trigger `touch_updated_at()` (não pelo app). */
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("users_public_id_idx").on(t.publicId),
  index("users_device_idx").on(t.deviceId),
  index("users_ip_idx").on(t.registrationIp),
  // M4/D3 — os valores reais usados no código (trialPolicy.ts, admin/users, stripe).
  check("users_plan_chk", sql`${t.plan} in ('free', 'trial', 'vip', 'starter', 'pro', 'expert')`),
  index("users_quota_day_idx").on(t.quotaDay),
  check("users_role_chk", sql`${t.role} in ('user', 'admin', 'owner')`),
]);

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // A PK é o token: sem este índice, login/logout e o cascade de users ->
  // sessions varrem a tabela inteira (o Postgres precisa de userId à esquerda).
  index("sessions_user_idx").on(t.userId),
  index("sessions_expires_idx").on(t.expiresAt),
]);

export const apiKeys = pgTable("api_keys", {
  provider: text("provider").primaryKey(), // espn | footballdata | sportmonks | bzzoiro | onesignal_rest
  token: text("token").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const favorites = pgTable("favorites", {
  id: serial("id").primaryKey(),
  publicId: uuid("public_id").notNull().defaultRandom(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull(),
  teamName: text("team_name").notNull().default(""),
  league: text("league").notNull().default(""),
  logo: text("logo").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("fav_user_team").on(t.userId, t.teamId),
  uniqueIndex("favorites_public_id_idx").on(t.publicId),
]);

export const alertPrefs = pgTable("alert_prefs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull().default("*"),
  matchId: text("match_id").notNull().default(""),
  alerts: jsonb("alerts").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pref_user_team_match").on(t.userId, t.teamId, t.matchId)]);

export const pushSubs = pgTable("push_subs", {
  endpoint: text("endpoint").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  keys: jsonb("keys").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull().unique(),
  league: text("league").notNull().default(""),
  matchDate: timestamp("match_date", { withTimezone: true }),
  homeName: text("home_name").notNull().default(""),
  awayName: text("away_name").notNull().default(""),
  modelType: text("model_type").notNull().default(""),
  pHome: real("p_home").notNull().default(0),
  pDraw: real("p_draw").notNull().default(0),
  pAway: real("p_away").notNull().default(0),
  pOver25: real("p_over25").notNull().default(0),
  fav: text("fav").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settled: boolean("settled").notNull().default(false),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  brier: real("brier"),
});

export const picks = pgTable("picks", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  settled: boolean("settled").notNull().default(false),
  green: boolean("green"),
});

export const alertState = pgTable("alert_state", {
  matchId: text("match_id").primaryKey(),
  state: jsonb("state").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const visits = pgTable("visits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  path: text("path").notNull().default("/"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tipVotes = pgTable("tip_votes", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  voterKey: text("voter_key").notNull(),
  choice: text("choice").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("vote_match_voter").on(t.matchId, t.voterKey)]);

export const tipComments = pgTable("tip_comments", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  author: text("author").notNull().default("Torcedor"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tipLikes = pgTable("tip_likes", {
  id: serial("id").primaryKey(),
  voterKey: text("voter_key").notNull(),
  target: text("target").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("like_voter_target").on(t.voterKey, t.target)]);

export const tickets = pgTable("tickets", {
  id: serial("id").primaryKey(),
  publicId: uuid("public_id").notNull().defaultRandom(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Múltipla"),
  legs: jsonb("legs").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("tickets_public_id_idx").on(t.publicId)]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("ledger_match_market").on(t.matchId, t.marketKey),
  // M4/D3 — valores reais: credibility.ts grava `ao_vivo` e `anulada`, além dos
  // três de liquidação. O plano listava só ('pendente','green','red','void'),
  // que teria quebrado o cron de liquidação com 500.
  check("ledger_status_chk", sql`${t.status} in ('pendente', 'ao_vivo', 'green', 'red', 'anulada')`),
]);

export const consents = pgTable("consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  voterKey: text("voter_key"),
  push: boolean("push").notNull().default(false),
  terms: boolean("terms").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deletionRequests = pgTable("deletion_requests", {
  id: serial("id").primaryKey(),
  publicId: uuid("public_id").notNull().defaultRandom(),
  email: text("email").notNull(),
  // Registro legal (LGPD): sobrevive à exclusão da conta, por isso SET NULL e não CASCADE.
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pendente"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("deletion_requests_public_id_idx").on(t.publicId),
  check("dr_status_chk", sql`${t.status} in ('pendente', 'concluido', 'recusado')`),
]);

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
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Escudo de time (TheSportsDB) — apenas fallback quando a ESPN não trouxe. */
export const teamBadges = pgTable("team_badges", {
  teamKey: text("team_key").primaryKey(),
  teamName: text("team_name").notNull().default(""),
  badge: text("badge"),
  source: text("source").notNull().default("TheSportsDB"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("apitou_cache_updated_idx").on(t.updatedAt)]);

/**
 * Cache do módulo King STATS (thekingstats.com).
 *
 * Guarda dois tipos de payload, discriminados por `kind`:
 *   "jogos"   — a lista do dia (cache_key "jogos:YYYYMMDD")
 *   "oport"   — oportunidades calculadas do dia (cache_key "oport:YYYYMMDD")
 *
 * O mesmo padrão do apitou: TTL de 15 min com stale-while-revalidate, para
 * não bater na fonte a cada request nem deixar a tela vazia.
 */
export const kingstatsCache = pgTable("kingstats_cache", {
  cacheKey: text("cache_key").primaryKey(),
  kind: text("kind").notNull().default(""),
  geradoEm: text("gerado_em"),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("kingstats_cache_updated_idx").on(t.updatedAt)]);

/**
 * Cache do módulo NerdyTips (nerdytips.com).
 *
 * Uma linha por página já transformada:
 *   "palpites"   — board do dia
 *   "destaques"  — bet of the day + slip
 *   "progresso"  — desempenho público (KPIs + tabela mensal)
 *   "partida:<id>" — detalhe de um jogo
 *
 * Guardamos o resumo (poucos KB), nunca o HTML inteiro.
 */
export const nerdytipsCache = pgTable("nerdytips_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("nerdytips_cache_updated_idx").on(t.updatedAt)]);

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Cache do xG oficial por time (API-Football).
 * Chave = ID do time na API-Football; TTL de 24h controlado por `fetched_at`.
 * Evita estourar a cota refazendo `/fixtures/statistics` a cada render.
 */
export const teamXgCache = pgTable("team_xg_cache", {
  teamId: text("team_id").primaryKey(),
  teamName: text("team_name").notNull().default(""),
  xgFor: real("xg_for").notNull().default(0),
  xgAgainst: real("xg_against").notNull().default(0),
  sample: integer("sample").notNull().default(0),
  source: text("source").notNull().default("api-football"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Tokens de dispositivo FCM (Firebase Cloud Messaging).
 * Um usuário pode ter vários aparelhos. Token é a chave (único por instalação).
 */
export const fcmTokens = pgTable("fcm_tokens", {
  token: text("token").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  platform: text("platform").notNull().default("android"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("fcm_tokens_user_idx").on(t.userId)]);

/**
 * Log de alertas de valor já enviados — evita push duplicado da mesma
 * oportunidade (chave = matchId:mercado) dentro da janela de dedupe.
 */
export const valueAlertLog = pgTable("value_alert_log", {
  chave: text("chave").primaryKey(),
  matchId: text("match_id").notNull().default(""),
  mercado: text("mercado").notNull().default(""),
  evPct: real("ev_pct").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Track record (histórico de resultados) das oportunidades de valor.
 * Cada linha = um palpite gerado; `status` vai de pendente → green/red na
 * liquidação. Unidade de stake = % da banca (Half-Kelly).
 */
export const valueBetHistory = pgTable("value_bet_history", {
  id: serial("id").primaryKey(),
  matchId: text("match_id").notNull(),
  mercado: text("mercado").notNull(),
  rotulo: text("rotulo").notNull().default(""),
  linha: real("linha"),
  odd: real("odd").notNull().default(0),
  /**
   * CLV — o par de odds da Pinnacle que prova se batemos o mercado.
   *
   * `oddAbertura` é gravada no instante do pick (é a odd que a publicação usa).
   * `oddFechamento` é lida pelo cron de liquidação, na primeira passagem depois
   * do apito inicial — o Hub guarda só o último snapshot da Pinnacle, então
   * essa é a leitura mais próxima do fechamento que existe sem histórico.
   * `clvPct = (abertura / fechamento − 1) × 100`; positiva = mercado andou na
   * nossa direção. Sem as duas pontas da MESMA casa, os três campos ficam
   * nulos e a tela mostra "—" (nunca uma média inventada).
   */
  oddAbertura: real("odd_abertura"),
  oddFechamento: real("odd_fechamento"),
  clvPct: real("clv_pct"),
  fechamentoEm: timestamp("fechamento_em", { withTimezone: true }),
  evPct: real("ev_pct").notNull().default(0),
  stake: real("stake").notNull().default(0),
  probModelo: real("prob_modelo").notNull().default(0),
  matchDate: text("match_date").notNull().default(""),
  homeName: text("home_name").notNull().default(""),
  awayName: text("away_name").notNull().default(""),
  leagueName: text("league_name").notNull().default(""),
  status: text("status").notNull().default("pendente"), // pendente | green | red
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  settledAt: timestamp("settled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("vbh_match_mercado").on(t.matchId, t.mercado),
  index("vbh_status_idx").on(t.status),
  index("vbh_date_idx").on(t.matchDate),
  index("vbh_clv_idx").on(t.clvPct),
  // Só os 3 que `resultadoDoMercado()` devolve (trackRecord.ts) + o inicial.
  check("vbh_status_chk", sql`${t.status} in ('pendente', 'green', 'red')`),
]);

/**
 * Cache de Player Props por time (API-Football), TTL 24h.
 * O campo `payload` guarda a amostra normalizada dos jogadores (últimos jogos)
 * para não gastar cota a cada visita à aba.
 */
export const playerPropsCache = pgTable("player_props_cache", {
  teamKey: text("team_key").primaryKey(),
  teamId: text("team_id").notNull().default(""),
  teamName: text("team_name").notNull().default(""),
  sample: integer("sample").notNull().default(0),
  payload: jsonb("payload").notNull().default({}),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Cache dos RANKINGS por liga (tela /rankings), gravado pelo cron diário.
 *
 * `payload` guarda a base já montada (`EntradaTime[]`: time + jogos, com
 * escanteios e cartões por jogo). Sem isso o cron não serviria para nada, porque
 * o cache em memória morre junto com a lambda.
 */
export const rankingsCache = pgTable("rankings_cache", {
  liga: text("liga").primaryKey(),
  times: integer("times").notNull().default(0),
  jogos: integer("jogos").notNull().default(0),
  payload: jsonb("payload").notNull().default([]),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Log de tentativas de trial NEGADAS (modelo de negócio: 1 dia grátis por
 * device/IP).
 *
 * Por que existe, se `users.registration_ip` já guarda o IP de quem entrou:
 * aquela coluna só registra quem **ganhou** o trial. Aqui ficam as tentativas
 * recusadas — é o que permite responder "quantas contas estão tentando burlar
 * o trial, com qual IP e por qual motivo" sem inventar telemetria depois.
 *
 * Não é fonte de decisão: a decisão é lida de `users` (device_id + IP). Esta
 * tabela é histórico, por isso `motivo` é texto e não enum — novas regras
 * (ex.: e-mail descartável, ASN de datacenter) entram sem migration.
 */
export const trialIps = pgTable("trial_ips", {
  id: serial("id").primaryKey(),
  ip: text("ip").notNull(),
  email: text("email").notNull().default(""),
  /** `device` | `ip` — mesmo vocabulário de `motivoBloqueio()`. */
  motivo: text("motivo").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("trial_ips_ip_idx").on(t.ip, t.createdAt)]);

/**
 * Lock de trabalho entre processos (lease com expiração) — M3.
 *
 * Por que uma tabela e não `pg_try_advisory_lock`: o app roda no endpoint
 * POOLED do Neon (PgBouncer em modo transação), e ali dois clientes Node
 * distintos caem na MESMA sessão do Postgres (mesmo `pg_backend_pid`). Advisory
 * lock é de sessão, então é reentrante nesse cenário: medido, dois clientes
 * receberam `true` ao mesmo tempo e o lock não excluiu nada.
 *
 * O lease resolve com uma linha e um relógio:
 *   - pegar  = insert ... on conflict do update ... where expira_em < now()
 *              (atômico: só um vence; quem perde não espera)
 *   - soltar = delete where nome and dono
 *   - morrer = a lease expira sozinha (substitui o "unlock no finally")
 *
 * `dono` identifica a execução (uuid + origem), então um processo que perdeu a
 * lease por expiração não apaga o lock de quem pegou depois.
 */
export const syncLock = pgTable("sync_lock", {
  nome: text("nome").primaryKey(),
  dono: text("dono").notNull(),
  expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("sync_lock_expira_idx").on(t.expiraEm)]);

/* Módulo Hub (clone funcional DumbleScore) — esquema próprio, reexportado para o drizzle-kit. */
export * from "./hub-schema";
