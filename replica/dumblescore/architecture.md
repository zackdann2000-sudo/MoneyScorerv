# Arquitetura — Clone DumbleScore (nosso produto)

> Plano técnico para reimplementar o DumbleScore com código próprio, dentro do
> repo `sports_platform`. Nada de copy, assets ou marca do original.

## 1. Decisões de stack

| camada | escolha | por quê |
| --- | --- | --- |
| App | Next.js 16 App Router (já no repo) | RSC para SSR das listas, bom SEO |
| UI | Tailwind 4 + lucide-react (já no repo) | sem MUI, tokens próprios |
| Banco | Postgres + Drizzle (já no repo) | migrações versionadas em `drizzle/` |
| Dados de futebol | Sportmonks (`SPORTMONKS_TOKEN` já existe) | fixtures, lineups, odds, xG |
| Modelo | serviço interno `src/lib/model/*` | Poisson/xG + ajustes por escalação |
| Pagamentos | Stripe (já no repo) | checkout, upgrade/downgrade, webhooks |
| Push | web-push + OneSignal (já no repo) | notificação de análise final |
| E-mail | provider transacional | link mágico + trial |
| Auth | sessão própria (já no repo) + Google/Telegram/magic link | vinculo de métodos |
| Cache/jobs | `sync_lock`, cron endpoints (já no repo) | evita corrida de sync |

Regra de ouro do original que vale copiar como conceito: **preview não conta,
final conta**. Só a análise final (com escalação confirmada) gera oportunidade e
entra no histórico.

## 2. Onde o clone vive

Duas opções:

- **A) mesma app, novo grupo de rotas** `src/app/hub/*` com prefixo de locale.
  Reaproveita auth, Stripe, push, shell, design tokens. Mais rápido, e o site
  atual já tem `ligas`, `times`, `jogadores`, `desempenho` parecidos.
- **B) app separado** no monorepo. Isola o produto, mas duplica auth e billing.

Recomendação: **A**, com módulo `hub` isolado em `src/app/hub`, `src/lib/hub/*`
e `src/db/schema/hub.ts` exportado por `src/db/schema.ts`. Se depois virar
produto próprio, o módulo sai inteiro.

## 3. Esquema (migração nova `drizzle/00xx_hub.sql`)

```sql
create table hub_league (
  id serial primary key,
  sportmonks_id int not null unique,
  name text not null,
  slug text not null unique,
  logo_url text,
  country_iso2 text,
  country_name text,
  competition_type text,             -- Liga | Cup | International
  is_tracked boolean not null default true,
  is_experimental boolean not null default false
);

create table hub_season (
  id serial primary key,
  league_id int not null references hub_league(id) on delete cascade,
  season_key text not null,           -- 2026-2027
  sportmonks_id int,
  is_current boolean not null default false,
  unique (league_id, season_key)
);

create table hub_team (
  id serial primary key,
  sportmonks_id int not null unique,
  name text not null, slug text not null,
  logo_url text, country_iso2 text,
  league_id int references hub_league(id)
);

create table hub_player (
  id serial primary key,
  sportmonks_id int not null unique,
  name text not null, slug text not null unique,
  image_url text, position text, detailed_position text,
  shirt_number int, nationality text, date_of_birth date,
  height int, weight int,
  team_id int references hub_team(id)
);

create table hub_fixture (
  id serial primary key,
  sportmonks_id int not null unique,
  league_id int not null references hub_league(id),
  season_id int references hub_season(id),
  stage_name text, round_name text,
  match_date timestamptz not null,
  venue_name text, venue_city text,
  home_team_id int not null references hub_team(id),
  away_team_id int not null references hub_team(id),
  home_score int default 0, away_score int default 0,
  home_score_ft int default 0, away_score_ft int default 0,
  home_red_cards int default 0, away_red_cards int default 0,
  minutes_played int default 0,
  live_state text,                    -- NS | INPLAY_1ST_HALF | FT | ...
  is_cup boolean default false,
  is_postponed boolean default false,
  home_table_position int, away_table_position int
);
create index hub_fixture_date_idx on hub_fixture (match_date desc);
create index hub_fixture_league_date_idx on hub_fixture (league_id, match_date desc);

create table hub_analysis (
  id serial primary key,
  fixture_id int not null references hub_fixture(id) on delete cascade,
  version int not null default 1,
  analysis_type text not null,        -- Preview | Final | Review
  lineups_included boolean not null default false,
  analysis_text text default '',
  summary jsonb,                      -- kind, favouriteSide, xgHome/Away, over25, btts
  confidence int,
  predicted_home_goals real, predicted_away_goals real,
  key_factors jsonb not null default '[]',
  risk_factors jsonb not null default '[]',
  lab_insights jsonb not null default '[]',
  model_version text,
  prompt_id int,
  created_at timestamptz not null default now(),
  unique (fixture_id, analysis_type, version)
);

create table hub_prediction (
  analysis_id int not null references hub_analysis(id) on delete cascade,
  market text not null,               -- 1X2 | Over/Under | BTTS | DoubleChance
  selection text not null,            -- Home | Draw | Away | Yes | No | Over 2.5 ...
  probability real not null,
  primary key (analysis_id, market, selection)
);

create table hub_top_score (
  analysis_id int not null references hub_analysis(id) on delete cascade,
  home int not null, away int not null, probability real not null,
  primary key (analysis_id, home, away)
);

create table hub_xg_factor (
  id bigserial primary key,
  analysis_id int not null references hub_analysis(id) on delete cascade,
  side text not null,                 -- Home | Away
  factor_type text not null,
  impact real not null default 0,
  weight real not null default 0,
  context jsonb, detail jsonb
);

create table hub_value_bet (
  analysis_id int primary key references hub_analysis(id) on delete cascade,
  market text not null, selection text not null,
  probability real not null, odds real not null,
  value real not null,
  max_playable_odds real,
  is_hot_pick boolean default false,
  is_substitution boolean default false
);

create table hub_bookmaker_odd (
  id bigserial primary key,
  fixture_id int not null references hub_fixture(id) on delete cascade,
  market text not null, selection text not null,
  bookmaker text not null, bookmaker_slug text not null,
  odds real not null,
  is_pick boolean default false, is_kalshi boolean default false,
  fetched_at timestamptz not null default now(),
  unique (fixture_id, market, selection, bookmaker_slug)
);

create table hub_lineup (
  fixture_id int primary key references hub_fixture(id) on delete cascade,
  confirmed boolean not null default false,
  home_formation text, away_formation text
);

create table hub_lineup_player (
  fixture_id int not null references hub_fixture(id) on delete cascade,
  team_id int not null references hub_team(id),
  player_id int references hub_player(id),
  role text not null,                 -- xi | bench | sidelined
  position text, shirt_number int, is_captain boolean default false,
  injury_type text, expected_return date,
  primary key (fixture_id, team_id, player_id, role)
);

create table hub_opportunity (              -- o ledger público
  id serial primary key,
  analysis_id int not null unique references hub_analysis(id) on delete cascade,
  fixture_id int not null references hub_fixture(id) on delete cascade,
  market text not null, selection text not null,
  probability real not null, odds real not null, value real not null,
  stake numeric not null default 1,
  outcome text not null default 'pending',   -- won | lost | void | pending
  is_experimental boolean not null default false,
  profit numeric, settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index hub_opportunity_settled_idx on hub_opportunity (settled_at desc, outcome);

create table hub_xg_evaluation (
  opportunity_id int primary key references hub_opportunity(id) on delete cascade,
  home_xg real, away_xg real, model_home int, model_away int,
  actual_home int, actual_away int,
  exact boolean, tendency boolean, goal_difference boolean, within_one_each boolean,
  grade text                          -- hit | near | miss
);

create table hub_scenario (
  id serial primary key,
  size int not null,                  -- 3..5
  combined_odds real not null,
  expected_value real,
  created_at timestamptz not null default now()
);
create table hub_scenario_leg (
  scenario_id int not null references hub_scenario(id) on delete cascade,
  fixture_id int not null references hub_fixture(id),
  market text not null, selection text not null, odds real not null,
  primary key (scenario_id, fixture_id)
);

create table hub_arbitrage (
  id serial primary key, market text not null,
  profit_margin real not null, created_at timestamptz not null default now()
);
create table hub_arbitrage_leg (
  arbitrage_id int not null references hub_arbitrage(id) on delete cascade,
  fixture_id int not null references hub_fixture(id),
  bookmaker text not null, selection text not null, odds real not null,
  primary key (arbitrage_id, fixture_id, bookmaker)
);

create table hub_outlier (
  id serial primary key,
  fixture_id int not null references hub_fixture(id) on delete cascade,
  market text not null, selection text not null,
  bookmaker text not null, odds real not null, ref_odds real not null,
  deviation real not null, created_at timestamptz not null default now()
);

create table hub_watchlist (
  user_id int not null references users(id) on delete cascade,
  kind text not null,                 -- opportunity | outlier | scenario
  ref_id int not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref_id)
);

create table hub_favorite_team (
  user_id int not null references users(id) on delete cascade,
  team_id int not null references hub_team(id) on delete cascade,
  notify boolean not null default true,
  primary key (user_id, team_id)
);

create table hub_purchase (
  id serial primary key,
  user_id int not null references users(id) on delete cascade,
  kind text not null,                 -- analysis | scenario | arbitrage
  ref_id int not null, credits int not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref_id)
);

create table hub_usage (              -- freemium: 3 jogos por semana
  user_id int not null references users(id) on delete cascade,
  fixture_id int not null references hub_fixture(id) on delete cascade,
  week_start date not null,
  primary key (user_id, fixture_id)
);

create table hub_prompt (
  id serial primary key,
  league_id int references hub_league(id),
  version int not null, content text not null,
  is_active boolean not null default false,
  performance jsonb, created_at timestamptz not null default now()
);

create table hub_job_log (
  id bigserial primary key,
  job_name text not null, status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz, error text
);
```

Reuso do que já existe: `users`, `sessions`, `push_subs`, `stripe_eventos`,
`consents`, `deletion_requests`, `rate_limits`, `sync_lock`.

## 4. Rotas da API (espelho funcional, nomes próprios)

```
GET  /api/hub/schedule?date&view&league      lista de jogos + estado da oportunidade
GET  /api/hub/schedule/live-scores           placares leves (polling 30s)
GET  /api/hub/fixtures/:id                   fixture + análise preview/final + odds
GET  /api/hub/fixtures/:id/odds              odds por casa (com timestamp)
GET  /api/hub/leagues | /api/hub/leagues/:slug
GET  /api/hub/teams?q | /api/hub/players?rank
GET  /api/hub/statistics/summary|markets|leagues|results
GET  /api/hub/performance/presets
GET  /api/hub/signals/discrepancies|scenarios|arbitrage|outliers
GET  /api/hub/shop/chances|scenarios|arbitrage|outliers|analyses
POST /api/hub/shop/purchase                   crédito ou assinatura
GET  /api/hub/me/usage                        contador semanal do freemium
POST /api/hub/me/watchlist | favorites | notifications/read-all
GET  /api/hub/share/:token                    card público
GET  /api/hub/ai/connect                      OAuth do servidor MCP
POST /api/hub/admin/trigger-analysis|sync|recalculate-outcomes
```

## 5. Motor de probabilidade (próprio)

1. **Base**: força de ataque/defesa por time na liga → gols esperados por lado
   (Poisson bivariado com correção de Dixon-Coles para 0-0/1-1).
2. **Ajuste de elenco**: peso por jogador na produção de gols (gols+assistências
   por 90) → se o artilheiro não está no XI, reduz o xG do lado proporcional ao
   peso ausente; banco e desfalques entram no mesmo cálculo.
3. **Forma e contexto**: últimos 5 jogos, média da liga, posição na tabela,
   mando de campo, descanso entre jogos, jogos de copa.
4. **Saídas**: matriz de placares → 1X2, Over/Under 1.5–3.5, BTTS, dupla
   chance, top 5 placares, xG por lado, confiança = função da dispersão e do
   tamanho de amostra.
5. **Oportunidade**: `valor = p_modelo * odd - 1`; publica só se `valor > limiar`
   e a odd real ≥ odd de break-even (`1/p_modelo`). Odd usada = Pinnacle no
   momento da análise final. Guardamos o ledger imutável.
6. **Settle**: ao final do jogo, resolve o mercado, grava `won/lost/void`,
   lucro em unidades e a avaliação de xG (`hit|near|miss`).

## 6. Ordem de construção

**Fatia vertical (primeiro):**
1. migração `hub_*` + seed de uma liga real
2. sync de fixtures/lineups/odds (job + `sync_lock`)
3. motor de probabilidade + gravação de análise Final + oportunidade
4. `S01 Centro de Jogos` + `S03 detalhe` com paywall básico
5. `S08 Desempenho` lendo o ledger
6. settle + review pós-jogo

**Depois, em blocos:**
- Loja e créditos + Stripe upgrade/downgrade/cancel + trial de 3 dias
- Freemium 3/semana + onboarding + notificações (in-app, e-mail, push, Telegram)
- Sinais: discrepâncias, cenários, arbitragem, outliers
- Dados: ligas, times, jogadores, temporadas
- Conta, watchlist, favoritos, suporte
- Multi-idioma, PWA, share público, servidor MCP
- Admin: jobs, prompts versionados, cupons, analytics de trial
