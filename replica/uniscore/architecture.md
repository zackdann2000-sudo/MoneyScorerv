# Architecture: GreenScore × Uniscore — plano das features que faltam

Fonte: `replica/uniscore/recon.md` + `features.csv` (36 linhas).
Alvo: só o que o GreenScore **ainda não tem**. O que já existe fica listado como
reaproveitado, para não reconstruir o que está pronto.

Data: 2026-02-19 · Estado do código conferido em `src/db/hub-schema.ts`,
`src/app/api/**`, `src/components/match/**`, `src/app/{ligas,times,jogos,hub}`.

---

## 0. Anti-escopo: o que o GreenScore JÁ tem

Isto saiu da leitura do código, não da memória. Não faz parte do plano.

| Uniscore | já existe em | prova |
| --- | --- | --- |
| S01 lista por liga + seletor de data | `components/flash/GamesBoard.tsx` | grupos colapsáveis (`open` state), `?data=YYYY-MM-DD&liga=`, polling com `updated` |
| S04 detalhe em abas | `components/match/MatchClient.tsx` | 12 abas: OPORTUNIDADES, PRÉ LIVE, LIVE, H2H, H2H REAL, JOGADORES, PROPS, ESTATÍSTICAS, IA ANALISTA, FORMAÇÕES, CLASSIFICAÇÃO, MONEY |
| S05 timeline (leitura) | `InfoTabs.tsx` → `Timeline` | gol/pênalti/contra/amarelo/vermelho/sub/VAR, placar parcial, VIP gate |
| S06 escalações | `components/Lineup` + `hub_lineup`/`hub_lineup_player` | XI/banco/desfalque, formação, capitão, lesão |
| S07 previsão IA | `hub_analysis` + `hub_prediction` + `hub_value_bet` | 1X2, O/U, BTTS, dupla chance, top-score, xG, confiança |
| S08 H2H | `H2HTab` + `hub_fixture_context.h2h` | agregado + lista + radial over/btts |
| S09 dados | `StatsTab`/`TeamStatsTab` + `hub_fixture_context.stats` | posse, finalizações, escanteios, faltas, cartões, xG |
| S12 página de time (parcial) | `app/times/[id]` + `hub_team` | header, forma, médias, escalação, favorito |
| S18 infra de alerta | `alert_prefs`, `push_subs`, `fcm_tokens`, `web-push` | assinatura, permissão, envio VAPID |
| Odds multi-casa (1X2/O-U/BTTS/dupla) | `hub_bookmaker_odd` + `OddsMultiCasa` | por casa, valor, outlier |
| Multi-idioma de UI (PT-BR) | — | fixo em pt-BR, sem catálogo |

**Conclusão da auditoria:** o grosso da fatia central S01→S10 já está construído.
Os buracos reais são **6 features** + 3 dívidas estruturais. É isso que o plano cobre.

---

## 1. Os buracos reais (com evidência)

| # | gap | evidência no código | prioridade | esforço |
| --- | --- | --- | --- | --- |
| G1 | **Classificação não é persistida** — `/api/standings` chama ESPN/Football-Data ao vivo; sem tabela, sem desempate, sem histórico, sem fallback | `src/app/api/standings/route.ts` → `getStandingsComFonte()`; nenhuma tabela `*standing*` no schema | must | M |
| G2 | **Não existe página de competição** — `/ligas` só conta jogos do dia | `app/ligas/page.tsx` (36 linhas, só contagem) | must | M |
| G3 | **Sem artilharia/assistências por competição** — `hub_player_stat` tem `goals`/`assists` mas só alimenta o modelo; nenhuma rota expõe | `lib/hub/analysis.ts:119` único consumidor | should | S |
| G4 | **Timeline não é persistida** — `Timeline` lê do resumo ESPN ao vivo do jogo aberto; não há eventos para fixtures do hub nem histórico | `hub_fixture` tem `homeScore`/`minutesPlayed`, nenhuma tabela de evento | must | M |
| G5 | **Odds: sem handicap asiático, sem linha explícita, sem abertura vs atual** | `SM_MARKET_LABEL` = 1X2, BTTS, O/U, DoubleChance; `hub_bookmaker_odd` sem `line`/`opening_odds` | must | M |
| G6 | **Alerta de gol com som não existe** — há infra de push, mas nenhum evento de gol dispara | grep por goal alert: zero; `alert_state` é global por `match_id`, não por usuário | should | M |
| G7 | **Sem busca por time/competição** — só `supertips/search` (palpite) | `app/api/supertips/search` é o único search | should | S |
| G8 | **Sem grade de TV** | nenhuma referência a `broadcast`/`canal` | could | S |
| G9 | **Sem vídeos de destaque** | nenhuma referência a `highlight`/`video` em fixture | could | S |
| G10 | **Schema mono-esporte** — `hub_fixture` assume home/away + gols; tênis não encaixa | `hub_fixture` sem coluna `sport` | could | L |
| G11 | **Share/deep-link sem cartão social** — 0 tags `openGraph`/`twitter:` no app | grep em `src/app` = 0 | could | S |
| G12 | **PWA não guarda o último placar** — service worker ignora `/api/` de propósito | `public/sw.js:99` `if (url.pathname.startsWith("/api/")) return;` | could | S |
| G13 | **Sem i18n** — pt-BR cravado em todo componente | nenhum `next-intl`/catálogo | must* | M |

`*G13`: é "must" no `features.csv` do Uniscore, mas é decisão de produto do GreenScore.
Se o público é BR-only, **não construir**; está aqui só para não ser esquecido.

---

## 2. Stack

Nada muda. O plano reaproveita o que já roda em produção — trocar de stack para
clonar 6 features é o caminho mais caro possível.

| camada | escolha (existente) | por quê |
| --- | --- | --- |
| web | Next.js 16 App Router + TypeScript | já em uso, 40+ rotas |
| estilo | Tailwind 4 + tokens do projeto | já em uso, `--acc`/`--panel`/etc |
| banco | Postgres (Drizzle 0.45, `node-postgres`) | `hub_*` já é o schema canônico |
| ORM | Drizzle Kit (`db:generate` → `db:push`) | migrações 0000→0017 já aplicadas |
| auth | sessão própria (`sessions`) + `users.plan` | já em uso, Stripe ligado |
| pagamentos | Stripe Checkout + webhook `stripe_eventos` | já em uso (VIP/trial) |
| email | Resend (a definir se G6 precisar de e-mail) | push cobre gol; e-mail só se fallback |
| jobs | Vercel Cron → `/api/cron/*` + `hub_job_log` | `sync_lock` e `hub_job_log` já existem |
| push | `web-push` (VAPID) + `fcm_tokens` | já em uso para value alerts |
| host | Vercel (`vercel.json` presente) | já em uso |

**Regra:** um banco, nenhum microserviço. As 6 features novas são **uma migração**
(0018) + rotas + telas. Zero dependência nova de infra.

---

## 3. Schema — migração `0018_uniscore_gaps`

Convenções seguidas do `hub-schema.ts` existente: `serial`/`bigserial` como PK
(o schema não usa uuid em `hub_*`), `timestamptz` sempre, `text` + `check` em vez
de enum nativo (padrão do repo), FKs com `on delete` **decidido**.

### 3.1 `hub_standing` — classificação persistida (G1, G2)

```sql
create table hub_standing (
  id            bigserial primary key,
  league_id     integer not null references hub_league(id)  on delete cascade,
  season_id     integer          references hub_season(id)  on delete cascade,
  team_id       integer not null references hub_team(id)    on delete cascade,
  -- "Regular Season" | "Group A" | "Championship Round". NULL = tabela única.
  stage_name    text,
  position      integer not null,
  played        integer not null default 0,
  wins          integer not null default 0,
  draws         integer not null default 0,
  losses        integer not null default 0,
  goals_for     integer not null default 0,
  goals_against integer not null default 0,
  -- Derivado: mantido pelo sync, não pelo app. Evita divergir do GF-GC.
  goal_diff     integer not null default 0,
  points        integer not null default 0,
  -- Últimos 5, do mais antigo ao mais novo: "VVEED". Alimenta FormDots.
  form          text,
  -- Separar casa/fora permite a tabela "resumida" da S10.
  form_home     text,
  form_away     text,
  source        text not null,
  updated_at    timestamptz not null default now(),
  constraint hub_standing_played_chk
    check (played >= wins + draws + losses)
);

-- A tabela é um snapshot: 1 linha por time por fase.
create unique index hub_standing_uq
  on hub_standing (league_id, season_id, coalesce(stage_name, ''), team_id);
create index hub_standing_order_idx
  on hub_standing (league_id, season_id, stage_name, position);
```

Desempate **não** vira tabela: é jsonb no `hub_league`, porque é 1 valor por
competição e muda uma vez por ano.

```sql
alter table hub_league
  add column tiebreak_rules jsonb not null default '["points","goal_diff","goals_for"]',
  add column has_knockout  boolean not null default false;
```

`["points","goal_diff","goals_for"]` é o default FIFA. A Serie A italiana usa
`points → goal_diff → goals_for`; a brasileira usa `points → wins → goal_diff`.
A ordem é **dado**, não código — assim a S10 pode dizer "por que o time está em 4º".

**Estado mata-mata (S10, "copa sem tabela"):** se `has_knockout = true` e não
houver linha em `hub_standing`, a UI mostra o bracket placeholder em vez de
"sem dados". Sem coluna nova.

### 3.2 `hub_match_event` — timeline persistida (G4, e insumo do G6)

```sql
create table hub_match_event (
  id                bigserial primary key,
  fixture_id        integer not null references hub_fixture(id) on delete cascade,
  -- Id do evento NO fornecedor. É a chave de idempotência do sync.
  provider_event_id text,
  minute            integer not null,
  -- 90+3
  minute_extra      integer,
  -- 1|2|3|4|5 (1ºT, 2ºT, prorrogação 1/2, pênaltis)
  period            integer not null default 1,
  side              text not null,
  team_id           integer references hub_team(id)   on delete set null,
  type              text not null,
  player_id         integer references hub_player(id) on delete set null,
  player_name       text,
  assist_player_id  integer references hub_player(id) on delete set null,
  -- substituição: quem sai
  player_out_id     integer references hub_player(id) on delete set null,
  -- placar DEPOIS do evento: é o "parcial" da timeline
  score_home        integer,
  score_away        integer,
  detail            text,
  created_at        timestamptz not null default now(),
  constraint hub_match_event_side_chk check (side in ('home','away')),
  constraint hub_match_event_type_chk
    check (type in ('goal','pen','own_goal','pen_miss','yellow','second_yellow',
                    'red','sub','var'))
);

create index hub_match_event_timeline_idx on hub_match_event (fixture_id, period, minute, id);
-- NULLs são distintos em índice único no Postgres: evento sem id do fornecedor
-- pode repetir, evento COM id nunca repete.
create unique index hub_match_event_provider_uq
  on hub_match_event (fixture_id, provider_event_id);
create index hub_match_event_recent_idx on hub_match_event (created_at);
```

`hub_match_event_recent_idx` existe **para o G6**: o job de alerta varre
"eventos de gol criados desde o último `hub_job_log`", e sem esse índice ele
faz seq scan em cada tick de 60s.

### 3.3 Odds: linha + abertura vs atual (G5)

`hub_bookmaker_odd` fica como está (é a odd **corrente**). Duas colunas entram e
uma tabela nova guarda o histórico.

```sql
alter table hub_bookmaker_odd
  add column line        numeric(6,2) not null default 0,
  add column opening_odds real,
  add column moved_at     timestamptz;

-- O line passa a fazer parte da identidade: "Home" com -0.5 e +0.5 são
-- apostas diferentes. Sem isso o upsert sobrescreve a linha errada.
drop index if exists hub_bookmaker_odd_uq;
create unique index hub_bookmaker_odd_uq
  on hub_bookmaker_odd (fixture_id, market, selection, bookmaker_slug, line);
```

Mercado asiático usa `market = 'AsianHandicap'`, `selection = 'Home'|'Away'`,
`line = -0.75 / +0.75`. Europeu (`1X2`) e O/U vão com `line = 0` ou a linha do
mercado (`2.5`), o que já é compatível.

```sql
-- Append-only: a "abertura vs atual" da S15 sai daqui, não de um campo morto.
create table hub_odds_snapshot (
  id          bigserial primary key,
  fixture_id  integer not null references hub_fixture(id) on delete cascade,
  market      text not null,
  selection   text not null,
  line        numeric(6,2) not null default 0,
  bookmaker_slug text not null,
  odds        real not null,
  captured_at timestamptz not null default now()
);
create index hub_odds_snapshot_key_idx
  on hub_odds_snapshot (fixture_id, market, selection, bookmaker_slug, captured_at);
```

Retenção: o job diário apaga snapshot com `captured_at < now() - interval '7 days'`.
Odds de jogo encerrado não servem para nada depois da liquidação.

### 3.4 Alerta de gol (G6)

Assinatura reusa `alert_prefs` (já tem `userId`, `teamId`, `matchId` e jsonb
`alerts` livre). Falta o **registro de envio**, para não mandar 2× o mesmo gol.

```sql
create table hub_goal_alert_log (
  id         bigserial primary key,
  user_id    integer not null references users(id) on delete cascade,
  event_id   bigint  not null references hub_match_event(id) on delete cascade,
  sent_at    timestamptz not null default now(),
  -- true = saiu; false = falhou (permite retentar no próximo tick)
  delivered  boolean not null default true,
  error      text
);
create unique index hub_goal_alert_log_uq on hub_goal_alert_log (user_id, event_id);
create index hub_goal_alert_log_retry_idx on hub_goal_alert_log (delivered, sent_at);
```

`unique (user_id, event_id)` é a garantia dura: por mais que o cron rode duas
vezes no mesmo minuto (o `sync_lock` pode expirar), o gol não é enviado 2×.

### 3.5 TV e vídeo (G8, G9) — gated

Só valem com fornecedor licenciado. Schema existe para não bloquear a UI depois.

```sql
create table hub_broadcast (
  id            bigserial primary key,
  fixture_id    integer references hub_fixture(id) on delete cascade,
  league_id     integer references hub_league(id) on delete cascade,
  country_iso2  text not null,
  channel_name  text not null,
  channel_url   text,
  kind          text not null default 'tv',
  updated_at    timestamptz not null default now(),
  constraint hub_broadcast_kind_chk check (kind in ('tv','stream')),
  -- Ou é do jogo, ou da liga — nunca dos dois, nunca nenhum.
  constraint hub_broadcast_scope_chk
    check ((fixture_id is not null) or (league_id is not null))
);
create unique index hub_broadcast_uq
  on hub_broadcast (coalesce(fixture_id, -1), country_iso2, channel_name);

create table hub_highlight (
  id            bigserial primary key,
  fixture_id    integer not null references hub_fixture(id) on delete cascade,
  provider      text not null,
  external_id   text not null,
  embed_url     text not null,
  thumbnail_url text,
  duration_s    integer,
  published_at  timestamptz,
  -- Licença precisa ser explícita. Sem 'true' a API não devolve o vídeo.
  rights_cleared boolean not null default false,
  created_at    timestamptz not null default now()
);
create unique index hub_highlight_uq on hub_highlight (provider, external_id);
```

### 3.6 Busca (G7) — sem tabela nova, só índice

```sql
create extension if not exists pg_trgm;
create index hub_team_name_trgm   on hub_team   using gin (name gin_trgm_ops);
create index hub_league_name_trgm on hub_league using gin (name gin_trgm_ops);
create index hub_team_slug_prefix on hub_team (slug text_pattern_ops);
```

`hub_team.slug` e `hub_league.slug` já existem e são únicos. Busca ordena por
`similarity()` desc, corta em 20. Sem Elastic, sem serviço externo.

### 3.7 i18n (G13) — só se o produto deixar de ser BR-only

```sql
alter table users add column locale text not null default 'pt-BR';
alter table hub_league add column name_i18n jsonb not null default '{}';
alter table hub_team   add column name_i18n jsonb not null default '{}';
```

Catálogos em `src/i18n/{pt-BR,en,es}.json`, rota `/[locale]/...` via middleware.
**Decisão pendente do dono do produto** — não entra no caminho crítico.

### 3.8 Multi-esporte (G10) — adiado, e por quê

`hub_fixture` assume `home_team_id`/`away_team_id` + `home_score`/`away_score` +
`live_state` de futebol. Tênis é 1×1 com sets e games; basquete tem quartos.
Fazer isso agora significa:

```sql
-- NÃO aplicar nesta fase. Esboço do custo real:
alter table hub_fixture add column sport text not null default 'football';
alter table hub_fixture add column score_detail jsonb;  -- sets/games/quartos
alter table hub_team add column sport text not null default 'football';
-- + todas as queries de hubGames/hubGameDetail ganham filtro por sport
-- + live_state precisa de um superconjunto, não do enum de futebol
```

É trabalho **L** e não é must. Fica fora. O `sport` default `'football'` pode
entrar já na 0018 (custo zero, 1 coluna) para a migração futura ser aditiva.

---

## 4. API

Regra: leitura pública (SEO), escrita autenticada. Toda rota lê do banco, **nada
chama o fornecedor no request** — quem chama é o cron.

### 4.1 Rotas novas

| method path | faz o quê | quem | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `GET /api/hub/fixture/[id]/events` | timeline ordenada por período/minuto, com placar parcial | público (VIP: só 3 eventos) | `id` | `{ events[], truncated }` | S05, F02 |
| `GET /api/hub/standings` | tabela por competição/temporada/fase | público | `league` (slug ou id), `season?`, `stage?` | `{ stage, rows[], tiebreak[], hasKnockout }` | S10, F07 |
| `GET /api/hub/competition/[slug]` | header da liga + tabela + últimos/próximos jogos | público | `slug` | `{ league, standings, fixtures, scorers }` | S11, F07 |
| `GET /api/hub/competition/[slug]/scorers` | artilharia/assistências da temporada | público | `slug`, `market=goals\|assists`, `limit?` | `{ rows[] }` | S11 |
| `GET /api/hub/team/[slug]` | ficha completa: próximos, últimos, posição, elenco | público | `slug` | `{ team, next[], last[], standing, squad[] }` | S12, F06 |
| `GET /api/hub/fixture/[id]/odds` | odds por mercado, com linha e abertura vs atual | público | `id`, `market?` | `{ markets[], snapshots[] }` | S15, F04 |
| `GET /api/hub/fixture/[id]/broadcast` | grade de TV do jogo (e da liga como fallback) | público | `id` | `{ channels[] }` | S17 |
| `GET /api/hub/fixture/[id]/highlights` | vídeos com `rights_cleared = true` | público | `id` | `{ videos[] }` | S16 |
| `GET /api/hub/search` | times + competições por nome/slug | público | `q` (≥2 chars), `limit?` | `{ teams[], leagues[] }` | descoberta |
| `PUT /api/hub/goal-alerts` | liga/desliga alerta de gol + som por jogo ou time | **auth** | `{ scope, fixtureId?, teamId?, sound }` | `{ ok, scope[] }` | S18 |
| `GET /api/hub/goal-alerts` | estado atual dos alertas do usuário | **auth** | — | `{ alerts[] }` | S18 |

### 4.2 Webhooks

Nenhum novo. O Stripe já entra em `/api/webhooks/stripe` e não muda.

### 4.3 Jobs (cron) — o coração do plano

Todos gravar em `hub_job_log` e respeitar `sync_lock`. **Nenhum job novo inventa
um lock paralelo.**

| job | schedule | o que faz | idempotência |
| --- | --- | --- | --- |
| `hub-events-live` | a cada 60s, só quando há `hub_fixture.live_state` ativo na janela ±3h | puxa eventos dos jogos ao vivo → upsert `hub_match_event` | `unique (fixture_id, provider_event_id)` |
| `hub-events-backfill` | 1×/dia 04:00 BRT | fecha timeline de jogos `FT` das últimas 24h | idem |
| `hub-standings` | 1×/dia 05:00 + 1h após o último jogo do dia | recalcula `hub_standing` da temporada corrente | upsert por `(league, season, stage, team)` |
| `hub-scorers` | 1×/dia 05:30 | `hub_player_stat` por temporada (goals/assists/minutes) | upsert por `(player_id, season_id)` |
| `hub-odds-snapshot` | a cada 5min na janela de jogo | insere `hub_odds_snapshot` só se a odd mudou | compara com a última linha; sem mudança = sem insert |
| `hub-odds-purge` | 1×/dia | apaga snapshot `> 7d` | natural |
| `hub-goal-alerts` | a cada 60s, depois de `hub-events-live` | gol novo → push para quem assinou | `unique (user_id, event_id)` |

**Por que a ordem importa:** `hub-goal-alerts` depende de `hub-events-live` ter
rodado. Se rodarem no mesmo minuto, o alerta sai no tick seguinte — atraso de até
60s. Aceitável. Encadear os dois no mesmo endpoint `/api/cron/hub-live` (eventos →
alertas, sequencial) elimina o atraso. **Recomendado.**

---

## 5. As partes que mordem

- **Fuso:** `hub_fixture.match_date` é `timestamptz` (UTC). A UI formata em
  `America/Sao_Paulo` — já é o padrão (`quando()` em `hub/[id]/page.tsx`).
  A **tabela de classificação não tem fuso**: `form` é ordem de jogo, não data.
  O risco real é o `hub-standings` rodar às 05:00 UTC e pegar a rodada pela
  metade. Regra: só recalcular se **todos** os jogos da rodada estiverem `FT`.
- **Idempotência:** todo upsert de sync tem chave única (`provider_event_id`,
  `(league, season, stage, team)`, `(player_id, season_id)`). O push de gol tem
  `(user_id, event_id)`. Webhook do Stripe já é idempotente por `stripe_eventos`.
- **Corrida:** dois ticks de `hub-events-live` simultâneos → `sync_lock` serializa.
  Mas se o lock expirar no meio de uma escrita e outro tick começar, o upsert por
  `provider_event_id` resolve (o segundo é no-op). O placar parcial
  (`score_home`/`score_after`) **não** pode ser recalculado por ordem de chegada:
  vem do fornecedor. Se vier nulo, deixa nulo — nunca infere.
- **Rate limit:** o fornecedor limita por minuto. `hub-events-live` a cada 60s só
  nos jogos ao vivo (tipicamente ≤20 partidas simultâneas) = 20 req/min. O
  `hub-standings` roda 1×/dia. Nada perto do teto. Se estourar, agrupa por liga.
- **Classificação divergente:** `goal_diff` é derivado. Se o sync não atualizar
  GF e GC juntos, a tabela mente. Por isso é coluna materializada (não
  `generated always`) **e** o job recalcula as três juntas numa transação.
- **Desempate:** a ordem em `tiebreak_rules` é o que define posição. Se o
  fornecedor entregar `position` que contradiz a regra, **vence a regra** — senão
  a UI mostra um time em 4º com os mesmos pontos e saldo melhor que o 3º.
- **Licenciamento:** odds exigem casa licenciada (já temos), vídeo exige
  `rights_cleared` (campo novo, default `false`), TV exige curadoria. Nenhuma
  das três pode ser "inferida" de página pública.
- **Privacidade (GDPR/LGPD):** `hub_goal_alert_log` referencia `user_id` com
  `on delete cascade` — o fluxo de `deletion_requests` já apaga o usuário, e o
  log vai junto. Nada a fazer além de confirmar a cascata.
- **SEO:** as rotas novas (`/competicao/[slug]`, `/times/[slug]`) precisam de
  `generateMetadata` + `openGraph` (hoje: **zero** no app). Sem isso a S11/S12
  não ranqueia, que é metade da razão de existir da página no Uniscore.

---

## 6. Ordem de construção

Princípio: cada fase entrega algo visível sozinho, e a fase seguinte não reescreve
a anterior. Dependência dita a ordem, não a tela bonita.

### M0 — Migração 0018 (fundação, invisível)
- **Tabelas:** `hub_standing`, `hub_match_event`, `hub_odds_snapshot`,
  `hub_goal_alert_log`, `hub_broadcast`, `hub_highlight` (+ alters: `hub_league.tiebreak_rules`,
  `hub_league.has_knockout`, `hub_bookmaker_odd.line/opening_odds`, `hub_fixture.sport`)
- **Rotas:** nenhuma
- **Critério de pronto:** `db:generate` limpo, `db:push` aplicado, `typecheck` verde,
  nenhuma query existente quebra (o `unique` de `hub_bookmaker_odd` é o único
  risco — validar o upsert atual do `espn-hub.ts`)

### M1 — Fatia vertical: classificação persistida (S10)
Já existe aba CLASSIFICAÇÃO lendo ESPN ao vivo. Trocar a **fonte** para o banco.
- **Screens:** S10 (dentro de `S04 › CLASSIFICAÇÃO`)
- **Tabelas:** `hub_standing`
- **Rotas:** `GET /api/hub/standings` + job `hub-standings`
- **Pronto quando:** dois jogos consecutivos da Serie A mostram a mesma tabela
  com a API do fornecedor fora do ar. É o teste que prova a persistência.
- **Por que primeiro:** é a fundação da S11 e não depende de nada. É também a
  maior lacuna funcional (hoje, fornecedor cai = aba vazia).

### M2 — Página de competição + artilharia (S11)
- **Screens:** S11 (nova rota `/competicao/[slug]`)
- **Tabelas:** `hub_standing`, `hub_player_stat`, `hub_fixture`
- **Rotas:** `GET /api/hub/competition/[slug]`,
  `GET /api/hub/competition/[slug]/scorers`, job `hub-scorers`
- **Pronto quando:** a página mostra jogos + tabela + artilharia e a tabela
  destaca o time do contexto quando vem de um jogo.
- **Nota:** `hub_player_stat` já é populado pelo `sportmonks.ts:348`. Se a liga
  não tem dado de jogador na fonte, a seção de artilharia mostra "sem dados" —
  **nunca** zero inventado.

### M3 — Timeline persistida (S05)
- **Screens:** S05 (aba Detalhes, hoje alimentada ao vivo)
- **Tabelas:** `hub_match_event`
- **Rotas:** `GET /api/hub/fixture/[id]/events`, jobs `hub-events-live` + `hub-events-backfill`
- **Pronto quando:** um jogo `FT` de ontem mostra a timeline completa sem
  consultar o fornecedor no request.
- **Dependência:** M0. **Desbloqueia:** M4.

### M4 — Alerta de gol com som (S18)
- **Screens:** S18 (toggle no detalhe + em `/config`)
- **Tabelas:** `alert_prefs` (reuso), `hub_goal_alert_log`, `push_subs`/`fcm_tokens` (reuso)
- **Rotas:** `PUT/GET /api/hub/goal-alerts`, job `hub-goal-alerts`
- **Pronto quando:** abrir um jogo ao vivo, ligar o som, esperar um gol, e o
  push chegar **uma vez** (conferir `hub_goal_alert_log`).
- **Risco:** permissão de notificação negada é o caminho comum, não a exceção.
  A UI precisa do estado "negado" com instrução, como no componente `GoalAlertToggle`
  do inventário do recon.

### M5 — Odds: asiática + linha + movimento (S15)
- **Screens:** S15 (aba de odds existente)
- **Tabelas:** `hub_bookmaker_odd` (alter), `hub_odds_snapshot`
- **Rotas:** `GET /api/hub/fixture/[id]/odds`, jobs `hub-odds-snapshot` + `hub-odds-purge`
- **Pronto quando:** um jogo com linha asiática mostra Home -0.75 a 1.90, a
  abertura 2.05, e a variação. Jogo sem casa cotada mostra "sem odds", não "—".
- **Cuidado:** o upsert de `espn-hub.ts`/`sportmonks.ts` precisa passar `line`,
  senão o default `0` faz duas linhas asiáticas colidirem.

### M6 — Descoberta: busca + página de time completa (G7, S12)
- **Screens:** busca no topo, S12 completa (elenco + posição + próximos/últimos)
- **Tabelas:** nenhuma nova (índices trgm)
- **Rotas:** `GET /api/hub/search`, `GET /api/hub/team/[slug]`
- **Pronto quando:** buscar "fla" acha Flamengo em ≤200ms e leva à ficha com
  posição na tabela puxada de `hub_standing`.

### M7 — Should/could licenciados (S16, S17)
- **Tabelas:** `hub_broadcast`, `hub_highlight`
- **Rotas:** `GET /api/hub/fixture/[id]/broadcast`, `.../highlights`
- **Gated:** não começa sem contrato de fornecedor. Schema já está no M0, então
  a fase é só rota + componente quando a licença existir.

### M8 — Adiado conscientemente
- **Multi-esporte (S13):** custo L, sem receita clara, quebra o modelo de fixture.
- **i18n (G13):** decisão de produto. Se BR-only, não fazer.
- **Share/OG (G11) e PWA placar offline (G12):** ganhos de SEO/retenção, ganham
  muito com pouco, mas vêm depois do core.

---

## 7. Contagem e riscos

- **Stack:** 1 linha — mantém Next.js 16 + Drizzle + Postgres + Vercel; zero
  dependência nova.
- **Tabelas:** **6 novas** (`hub_standing`, `hub_match_event`, `hub_odds_snapshot`,
  `hub_goal_alert_log`, `hub_broadcast`, `hub_highlight`) + 5 alters.
- **Rotas:** **11 novas** (9 públicas, 2 autenticadas) + **7 jobs**.
- **Screens novas:** 2 (`/competicao/[slug]`, busca) + 4 completas (S10, S12, S15, S18)
  + 2 gated (S16, S17).

**Os três pontos mais arriscados:**

1. **O unique index de `hub_bookmaker_odd` muda de chave.** É a única alteração
   que pode quebrar código em produção no deploy da 0018. Precisa de dry-run
   contra os dados atuais antes de aplicar.
2. **`hub-goal-alerts` pode mandar push duplicado** se o `sync_lock` expirar
   entre eventos e alertas. Mitigado pela unique `(user_id, event_id)`, mas o
   teste tem que ser rodar o cron 2× no mesmo minuto e conferir 1 push.
3. **Classificação de liga com desempate próprio** (Brasileirão usa vitórias
   antes do saldo). Se o `tiebreak_rules` default FIFA for aplicado ao Brasileirão,
   a tabela fica **errada e plausível** — o pior tipo de bug. Cada liga tracked
   precisa do seu array correto no M1, não no M5.

---

## 8. Próximo passo

`/replica-design` **não** é o próximo passo natural aqui: o GreenScore já tem
design system próprio (tokens, `Crest`, `StatCompareRow`, `FormDots`, `VipLock`).
As 6 features novas devem parecer GreenScore, não Uniscore.

Sequência correta:

1. **Validar o M1 antes de tudo:** rodar `hub-standings` para Serie A + Brasileirão
   e comparar as duas tabelas com o fornecedor, conferindo o desempate do
   Brasileirão. Se a ordem divergir, o problema é `tiebreak_rules`.
2. Depois disso, `/replica-build` no M1→M2, que já estão especificados o
   suficiente para codar.

Documento de trabalho: `replica/uniscore/architecture.md` (este).
SQL da 0018: gerar com `npm run db:generate` a partir do Drizzle, não à mão —
o schema acima é a especificação, o Drizzle é a fonte de verdade.
