# Architecture: Money Sênior (rebuild do core do Gol Sinyali)

> **Status:** plano de convergência escrito em 2026-11-21, depois de auditar o
> código existente. Este documento **não** é um plano greenfield: o app já roda
> com 35 tabelas e 66 rotas. Ele é o alvo para onde o código existente converge,
> com a ordem de execução e o critério de "pronto" de cada etapa.
>
> Regra que vale para todo o documento: **um banco, sem microserviços.** O
> clone não precisa da arquitetura do original, precisa das features dele.

## Stack

| layer | choice | why |
| --- | --- | --- |
| web | Next.js 16 (App Router) + TypeScript | já é o adotado; SSR barato no Vercel |
| styling | Tailwind 4 + tokens | já é o adotado |
| mobile | PWA instalável (sem Expo) | `public/manifest.json` + `InstallApp`; push via web-push/FCM |
| database | Postgres no Neon | já é o adotado; serverless, um banco só |
| ORM | Drizzle + drizzle-kit | já é o adotado; migrations versionadas |
| auth | sessão própria (cookie httpOnly + scrypt) | já é o adotado (`src/lib/auth.ts`) |
| payments | Stripe (Checkout + webhook) | já é o adotado (`src/lib/stripe.ts`) |
| email | **não existe** — hoje só push | lacuna: recuperação de senha e recibo não têm canal |
| jobs | Vercel Cron + GitHub Actions + sync preguiçoso | ver "Jobs" abaixo; **precisa de um dono só** |
| files | **não existe** — escudos/fotos em tabela | `player_photos`, `team_badges`; ok no tamanho atual |
| hosting | Vercel | já é o adotado |


**Em uma linha:** Next.js + Drizzle + Neon + Stripe no Vercel, jobs em Vercel
Cron com um script de GitHub Actions como plano B, e o cache de conteúdo
terceirizado em tabelas `*_cache` no próprio Postgres.

## Schema

**Tables: 35. Access rules: checagem no data layer (uma por query), sem RLS.**
Decisão: Neon não tem RLS por padrão habilitado como o Supabase e o app inteiro
consulta via um pool único (`src/db/index.ts`). Então a regra é explícita e
única: **toda query que toca dado de usuário filtra por `userId` no `where`**,
e nenhuma `page.tsx` fala com o banco (a exceção atual, `src/app/edge/page.tsx`,
entra no M4).

### Estado atual (auditado em 2026-11-21)

O que **está de acordo** com a skill e não deve ser mexido:

- FKs com `on delete` decidido, não o default.
- Índices em FK e em coluna de filtro/ordenação.
- Unique indexes que resolvem corrida no banco, não na UI:
  `fav_user_team`, `pref_user_team_match`, `vote_match_voter`, `like_voter_target`,
  `ledger_match_market`, `vbh_match_mercado`, `gr_pin_user_prop`, `apt_pin_user_prop`.
- Idempotência de webhook por PK de evento (`stripe_eventos.id` = id do evento).
- Sem dinheiro em tabela: preço vive no Stripe, então a regra "integer cents +
  currency" não é violada — não há coluna monetária para errar.

Os 4 desvios que este documento resolve:

| # | desvio | medido | impacto |
| --- | --- | --- | --- |
| D1 | PK `serial` em vez de `uuid` | 16 `serial(`, 0 `uuid(` | id de usuário enumerável se vazar em URL/API |
| D2 | `timestamp` sem fuso | 46 `timestamp(`, 0 `withTimezone` | funciona **por coincidência** (TZ do processo = UTC); dev/local já desloca 3h |
| D3 | nenhum `check`/enum em status | 0 `check(` em 35 tabelas | status inválido entra e quebra filtro silenciosamente |
| D4 | tabelas sem `updated_at` | 25 de 35 | impossível saber quando um dado de usuário mudou; sem base para sync incremental |

E um quinto item, de disciplina de migration (não é schema, é processo):

| D5 | SQL fora do journal do drizzle | `drizzle/0010_rankings_cache.sql`, `gameread_cache.sql`, `gameread_pinned_props.sql` | `drizzle-kit` acha que o banco não tem essas tabelas; a próxima `generate` pode tentar recriá-las |

### Plano de correção do schema

Ordem **obrigatória**: D2 → D3 → D4 → D5 → D1. A ordem não é gosto: D2 e D3 são
aditivas e reversíveis; D1 é a única que reescreve PK e por isso vai por último,
quando o resto já estiver estável.

#### D2 — `timestamp` → `timestamptz` (uma migration, um release)

O valor atual é "UTC por acidente": o cliente `pg` serializa um `Date` com
offset e o Postgres descarta o offset ao gravar em `timestamp` sem fuso. Como o
processo na Vercel roda em UTC, o resultado coincide com UTC. Em qualquer
processo com `TZ=America/Sao_Paulo` (dev local, runner, script), o mesmo código
grava 3h diferente e a leitura desloca de volta — erro invisível.

**Pré-checagem obrigatória antes de rodar** (senão a conversão corrompe dado):

```sql
-- 1. o processo que gravou estava mesmo em UTC?
show timezone;
-- 2. sanidade: uma linha conhecida bate com o horário real?
select id, expires_at, now() from sessions order by id desc limit 3;
-- 3. quantas linhas existem em cada tabela afetada (para comparar depois)
```

**Migration** (padrão para as 46 colunas; só as colunas de fuso semântico, não
as de "dia" que já são `text`):

```sql
alter table sessions
  alter column expires_at type timestamptz using expires_at at time zone 'UTC',
  alter column created_at type timestamptz using created_at at time zone 'UTC';

alter table users
  alter column created_at type timestamptz using created_at at time zone 'UTC';

-- ... repetir por tabela; default passa a ser now() (timestamptz)
alter table apitou_cache
  alter column updated_at type timestamptz using updated_at at time zone 'UTC',
  alter column updated_at set default now();
```

No Drizzle: trocar `timestamp(` por `timestamp(..., { withTimezone: true })` em
`src/db/schema.ts` **no mesmo commit** da migration, senão a próxima `generate`
gera o inverso.

**Critério de pronto:** `select count(*) from information_schema.columns where
table_schema='public' and data_type='timestamp without time zone'` devolve 0;
`npm run typecheck` verde; `sessions.expires_at` de um login novo cai em UTC.

**Risco e rollback:** `at time zone 'UTC'` é reversível
(`... at time zone 'UTC'` de novo com o tipo antigo) **enquanto ninguém gravar
no meio**. Rodar em janela de baixo tráfego e com o app em modo leitura
(`APITOU_ENABLED=0` não basta; o certo é não ter deploy concorrente).

#### D3 — `check` em campos de status (aditivo, sem downtime)

Status hoje são `text` livre. Os 5 que importam:

```sql
alter table users        add constraint users_plan_chk
  check (plan in ('free','trial','vip')) not valid;           -- users.plan, schema.ts:9
alter table pick_ledger  add constraint ledger_status_chk
  check (status in ('pendente','green','red','void')) not valid;
alter table value_bet_history add constraint vbh_status_chk
  check (status in ('pendente','green','red')) not valid;      -- schema.ts:440
alter table deletion_requests add constraint dr_status_chk
  check (status in ('pendente','concluido','recusado')) not valid;
alter table tickets      add constraint tickets_status_chk
  check (status in ('pendente','pago','cancelado')) not valid;

-- só depois de validar os dados existentes:
-- alter table users validate constraint users_plan_chk;
```

`not valid` é o detalhe que permite criar a constraint sem varrer a tabela e
sem falhar por causa de lixo antigo. **Antes do `validate`**, rodar a query que
lista valores fora do enum e corrigir caso a caso — se `validate` falhar com 500
mil linhas, o deploy trava.

#### D4 — `updated_at` nas 25 tabelas que não têm

```sql
alter table favorites add column updated_at timestamptz not null default now();
-- e um trigger único, em vez de 25 triggers escritos à mão:
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

create trigger t_favorites_touch before update on favorites
  for each row execute function touch_updated_at();
```

Só nas tabelas onde "quando mudou" tem significado: `favorites`, `alert_prefs`,
`users`, `tickets`, `pick_ledger`, `value_bet_history`, `deletion_requests`,
`gameread_pinned_props`, `apitou_pinned_desajustes`, `fcm_tokens`. As tabelas de
log/append-only (`visits`, `tip_votes`, `stripe_eventos`, `value_alert_log`,
`rate_limits`) **não ganham** `updated_at` — linha imutável não tem update, e
adicionar a coluna só cria a obrigação falsa de mantê-la.

#### D5 — fechar o buraco do journal

Os 3 arquivos `.sql` fora de `drizzle/meta/_journal.json` são o risco real: a
próxima `drizzle-kit generate` compara schema × snapshot e pode emitir um
`create table gameread_cache` que já existe. Ação: gerar o snapshot dos 3 via
`drizzle-kit generate` numa branch limpa e commitar como `0011_sync_journal` (só
o journal + snapshots; nenhum SQL novo), conferindo com
`drizzle-kit check`. **Enquanto isso, não rodar `db:push`.**

#### D1 — `uuid`: decisão consciente de divergir da letra da skill

A skill pede `id uuid primary key default gen_random_uuid()` em toda tabela.
Trocar a PK de 16 tabelas num app com sessão ativa, FKs e webhook em produção é
cirurgia de alto risco para um ganho que se obtém de forma barata. Proposta:

1. **Tabelas novas** (a partir de agora) nascem com `uuid primary key default
   gen_random_uuid()` + `created_at`/`updated_at` `timestamptz`. Sem exceção.
2. **Tabelas existentes com id exposto** (`users`, `tickets`, `deletion_requests`,
   `favorites`) ganham `public_id uuid not null default gen_random_uuid()` +
   `unique index`, e a API passa a expor `public_id` em vez do `serial`. É
   aditivo, reversível e mata o problema real (id enumerável).
3. **Reescrever PK para uuid** fica como item separado, sem data, executável só
   se houver motivo concreto (merge de base, multi-tenant, importação externa).

Isto é uma divergência **declarada** da skill, com o motivo escrito aqui: a
regra existe para id não adivinhável; `public_id` entrega isso sem o risco da
reescrita de PK.

### Tabelas (inventário)

| grupo | tabelas | observação |
| --- | --- | --- |
| identidade/acesso | `users`, `sessions`, `api_keys`, `consents`, `deletion_requests` | D1 (public_id), D2, D3, D4 |
| personalização | `favorites`, `alert_prefs`, `alert_state`, `push_subs`, `fcm_tokens` | D4 |
| conteúdo/palpites | `predictions`, `picks`, `pick_ledger`, `tickets`, `value_bet_history`, `value_alert_log` | D3 nos status |
| social | `tip_votes`, `tip_comments`, `tip_likes`, `visits` | append-only, sem D4 |
| cache de terceiros (9) | `apitou_cache`, `kingstats_cache`, `nerdytips_cache`, `gameread_cache`, `player_stats_cache`, `match_team_stats_cache`, `team_xg_cache`, `player_props_cache`, `rankings_cache` | **alvo do M3 (particionamento) e do M6 (retenção)** |
| assets | `player_photos`, `team_badges` | candidatos a R2 quando crescerem |
| pins de usuário | `gameread_pinned_props`, `apitou_pinned_desajustes` | D4 |
| infra | `rate_limits`, `stripe_eventos` | `rate_limits` precisa de job de expurgo |

## API

Rotas dos dois módulos auditados (as demais 58 seguem o mesmo desenho). Regra que
vale para todas: **rota não calcula negócio** — ela valida entrada, chama
`store`/motor e serializa.

### /apitou

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET/POST `/api/apitou/sync` | baixa as fontes, reduz e grava o resumo | `CRON_SECRET` (Vercel Cron) ou `x-apitou-key`; falha fechada sem segredo | `?estado=1` (só status) | `{ok, duracaoMs, jogos, props, avisos}` | F-admin |
| GET `/api/apitou/jogos` | lista enxuta do dia (sem props) | público | `?date=YYYY-MM-DD` | `{geradoEm, stale, dias[], jogos[]}` | F01 |
| GET `/api/apitou/jogo/:id` | detalhe + props calculadas de 1 jogo | público | id do fixture | jogo + `PropCalculada[]` + desajustes | F02 |
| GET `/api/apitou/desajustes` | agregação transversal de props com vantagem | público | `?nivel&date&limit&principais` | `{props[], total}` | F03 |

### /kingstats

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET `/api/kingstats/jogos` | lista do dia do cache/source | público | `?date` | `{dayKey, jogos[]}` | F01 |
| GET `/api/kingstats/oportunidades` | cálculo Poisson do dia (caro) | público | `?date&revalidate=1` | `{oportunidades[], parcial, cached, stale}` | F04 |
| GET `/api/kingstats/jogo/:id` | detalhe do jogo | público | id | jogo + stats | F02 |
| GET `/api/kingstats/resumo` | desempenho/resultados | público | — | KPIs + tabela | F05 |

**Webhooks in:** Stripe (`/api/webhooks/stripe`, idempotente por `stripe_eventos.id`).
**Webhooks out:** nenhum.
**Jobs:**

| nome | onde | quando | o que faz |
| --- | --- | --- | --- |
| `/api/cron/diario` | Vercel Cron (`vercel.json`) | 09:00 UTC | roda `sincronizarEGravar()` do apitou + tarefas do dia |
| `/api/track-record/run` | Vercel Cron | 13:00 UTC | fecha resultado dos palpites do dia anterior |
| `apitou-sync` | GitHub Actions | 06:00 UTC | baixa + grava o resumo (plano B, runner próprio) |
| sync preguiçoso | dentro do request | primeira visita do dia | `garantirResumo()` quando não há cache |

> **Três escritores no mesmo registro** (09:00 cron, 06:00 Actions, lazy). Não é
> redundância saudável, é concorrência sem dono. Decisão deste documento: **o
> Vercel Cron é o dono único** do sync diário; o GitHub Actions passa a ser
> *watchdog* (verifica e escreve só se o dado estiver velho) e o lazy sync fica
> como rede de segurança. Correção no M1.

## Cache: do monolito ao particionado (alvo do M3)

### O que está errado hoje

`apitou_cache` tem **uma linha** (`semana-v2`) com a semana inteira em jsonb.
Consequências medidas:

1. `/api/apitou/jogo/:id` faz `garantirResumo()` e depois `calcularJogo(jogo)`:
   para abrir **um** jogo, o processo carrega e parseia **a semana toda**.
2. `/api/apitou/desajustes` chama `calcularTodas(jogos)` a **cada request**, sem
   cache nenhum de resultado.
3. Qualquer revalidação reescreve o blob inteiro (1291 kB): não há como
   atualizar só o jogo que mudou de odd.
4. Um único `cache_key` para todo o conteúdo = um ponto de falha de escrita e de
   leitura concorrente.

O `/kingstats` já faz o certo: **uma chave por dia e por tipo de trabalho**
(`jogos:YYYYMMDD` barato, `oport:YYYYMMDD` caro), com TTL por chave. É esse o
padrão a propagar.

### Desenho alvo

| chave | conteúdo | quem grava | TTL | tamanho esperado |
| --- | --- | --- | --- | --- |
| `meta:apitou` | `{geradoEm, fonte, dias[], jogosTotal, versao}` | job | 6h | ~1 KB |
| `dia:<YYYY-MM-DD>` | jogos enxutos daquele dia (sem props) | job | 6h | 30–80 KB |
| `jogo:<fixtureId>` | props calculadas + desajustes de 1 jogo | lazy, na 1ª leitura | 15 min | 5–20 KB |
| `desajustes:<YYYY-MM-DD>:<nivel>` | resultado já agregado e ordenado | lazy | 15 min | 20–50 KB |

Ganhos diretos: abrir um jogo deixa de custar o parse da semana; atualizar um dia
não reescreve os outros; o desajuste sai pronto do cache em vez de ser recalculado
por request; e cada linha tem tamanho previsível (importa para o `jsonb` e para
o payload de rede).

### Migration em 3 releases (sem big bang)

**Release A — dual write, read antigo.** O job grava `meta:apitou` + `dia:*`
**e** continua gravando `semana-v2`. Nenhuma leitura muda. Se algo der errado,
basta parar de gravar as chaves novas. (`store.ts` ganha `gravarParticionado()`
ao lado do caminho atual.)

**Release B — read novo com fallback.** `garantirResumo()` vira um wrapper:
`garantirDia(dia)` lê `dia:<dia>`; se não existir, cai no `semana-v2` e
particiona em memória. Rotas não mudam de assinatura — `/api/apitou/jogos` passa a
pedir só o dia, `/jogo/:id` passa a ler `jogo:<id>`. `desajustes` grava
`desajustes:<dia>:<nivel>`.

**Release C — remover `semana-v2`.** Só quando os logs mostrarem zero fallback por
7 dias seguidos. Apagar `semana` (a linha órfã do cron antigo, 1,2 MB de dado
morto) e `semana-v2`.

### Corrida e lock (junto com o M3)

O lock atual (`store.ts:72`) é um `Promise` em memória — vale por instância. Com
N instâncias serverless existem N syncs de 22 MB em paralelo. Troca por advisory
lock do Postgres, que é global:

```sql
-- no início do job/sync: se não pegar o lock, outro processo está trabalhando
select pg_try_advisory_lock(hashtext('apitou-sync'));
-- no fim, sempre (mesmo em erro):
select pg_advisory_unlock(hashtext('apitou-sync'));
```

`pg_try_advisory_lock` devolve `false` na hora em vez de enfileirar: quem chega
depois serve o cache velho e sai. Para o sync preguiçoso isso é o comportamento
correto — ninguém deve esperar 36 s por um download que outro já está fazendo.

### Critério de pronto do M3

- `select cache_key, length(payload::text) from apitou_cache` sem nenhuma linha
  acima de 120 kB.
- `/api/apitou/jogo/:id` responde em < 150 ms com cache quente (hoje: parse da
  semana).
- Dois requests simultâneos em instâncias diferentes produzem **um** download
  (verificável pelo log do job: uma linha por execução).
- `/api/apitou/desajustes` responde `cached: true` em 2 chamadas seguidas.

## The parts that bite

- **time zones:** D2 é a origem. Regra: `timestamptz` no banco, UTC no banco,
  `America/Sao_Paulo` só na borda (`diaLocal()` em `jogos/route.ts:16` e
  `desajustes/route.ts:19`). Jogo de 21h não pode virar "amanhã".
- **idempotência:** webhook do Stripe já é idempotente por PK do evento. O sync
  do apitou **é** idempotente (upsert por chave) — o que falta é *serialização*,
  não idempotência.
- **races:** advisory lock (M3). Enquanto não existir, o `concurrency` do GitHub
  Actions cobre só o Actions.
- **rate limits:** `/api/apitou/*` não tem `rateLimit` e `/desajustes` recalcula
  por request — hoje é o endpoint mais caro do app sem teto. Enquanto o M3 não
  chega, cache do resultado (uma linha, TTL 15 min) resolve 90%.
- **retenção:** nenhuma tabela de cache tem expurgo. `kingstats_cache` cresce 2
  linhas/dia, `gameread_cache` e `player_stats_cache` crescem por jogo. Job diário
  `delete from <cache> where updated_at < now() - interval '30 days'` (M6).
- **busca:** nenhuma (sem full-text). Se entrar, `tsvector` + índice GIN, não
  `ilike %x%`.
- **realtime/offline:** PWA serve cache do service worker; não há fila offline.
  Escopo consciente: não fazer.
- **e-mail:** não existe canal. Recuperação de senha hoje é impossível. Lacuna de
  produto, não de arquitetura — mas entra no M5.
- **multi-tenancy:** não há. `user_id` em tudo, um tenant por usuário. Se virar
  B2B, o passo é `org_id` antes de qualquer feature.
- **GDPR/LGPD:** `deletion_requests` + `deleteUserCascade` existem e é o único
  ponto de deleção — bom. Falta o mesmo para as tabelas de cache com dado
  pessoal derivado (nenhuma hoje tem).

## Risco 6 — dependência de fonte não-oficial (plano de contingência)

### O que está em risco, em concreto

| módulo | endpoint | como é acessado | o que quebra se sumir |
| --- | --- | --- | --- |
| /apitou | `GET /dados.js` (22 MB), `GET /linhas.js` | arquivo JS público, **UA de Android falsificado** (`fonte.ts:20`), sem contrato | props de jogadores, escalações, árbitro, H2H, odds, desajustes — **as 3 abas do módulo** |
| /kingstats | `/api/dashboard-cache`, `/api/dashboard-goal-stats`, `/api/dashboard-resumo` | rotas internas achadas no bundle Next | oportunidades Poisson, jogos, desempenho |

A skill (Step 3) é categórica: *"only official, public APIs with the user's own
keys; never the original app's private endpoints"*. Os dois módulos violam isso.
Não é um bug a corrigir numa tarde — é uma **dívida de contrato** e este plano
trata dela como risco contínuo, não como incidente.

O que agrava: os dois módulos **não degradam**, eles somem. `garantirResumo()`
devolve `503` se nunca houve sync e o app inteiro perde `/apitou`; `/kingstats`
devolve `502`. Não existe feature flag, não existe tela de indisponibilidade
honesta.

### 1. Detectar antes do usuário (M1, barato, fazer primeiro)

O job já verifica a linha no banco (Quick Fix de 2026-11-21). Falta o canário de
**conteúdo**, que é o que pega quebra silenciosa (site responde 200 com dados
vazios, que é o modo de falha mais provável):

```js
// scripts/apitou-sync.mjs, antes de gravar:
const pisoJogos = Number(process.env.APITOU_MIN_JOGOS ?? 20);
const pisoProps = 200;
if (resumo.jogos.length < pisoJogos)
  throw new Error(`só ${resumo.jogos.length} jogos (piso ${pisoJogos}) — possível quebra de formato`);
if (props < pisoProps) throw new Error(`${props} props (piso ${pisoProps})`);
if (!resumo.jogos.some((j) => j.arbitro)) throw new Error("nenhum árbitro: parser perdeu um campo");
```

Com o workflow atual, isso já vira **issue automática** em vez de silêncio. Os
pisos são configuráveis por env porque o volume real muda em semana de
paralização.

Segundo canário, semanal: baixar as fontes e rodar o parser contra a fixture
(`fonte.test.cjs` já existe) — se o formato mudou, o teste falha e o `git` mostra
o diff.

### 2. Não ficar sem o último dado bom (escrow)

Hoje, se o sync falhar 30 dias, o app serve o mesmo payload de 30 dias atrás —
o que já é o comportamento certo (stale-while-revalidate), mas ninguém **sabe**
que está velho. Regra: `stale` já vai na resposta; a UI precisa mostrar.
Adicionar `meta:apitou.ultimoSucessoEm` e a tela exibe "dados de <data>" quando a
idade passa de 24h. Nunca esconder a idade do dado — é a diferença entre um app
degradado e um app mentiroso.

Snapshot fora do banco (M6): uma cópia diária do resumo em R2/arquivo, 7 dias de
retenção. Serve para dois casos: restaurar depois de um `delete` acidental e
reprocessar com um parser novo sem depender da origem no ar.

### 3. Inverter a dependência (a correção de verdade, M5)

O projeto **já tem** a infraestrutura para não depender de fonte não-oficial:
`src/lib/providers.ts` implementa uma cascata oficial com registro de quem
respondeu (`Cascade<T>` com `attempts[]`), sobre ESPN (grátis, sem chave),
Football-Data.org, Sportmonks, Bzzoiro e API-Football. O padrão existe, só não é
usado como **fonte primária** — apitou/kingstats viraram o core por acidente.

Decomposição do que o /apitou entrega, por origem que pode substituir:

| dado | pode vir de | já implementado? | esforço |
| --- | --- | --- | --- |
| fixtures/jogos do dia | ESPN, Football-Data.org | ✅ `espn.ts`, `providers.ts` | trocar a chamada |
| placar/ao vivo | ESPN | ✅ | — |
| escalação | ESPN (`summary`) | ✅ | — |
| H2H | ESPN | ✅ `h2hEngine.ts` | — |
| estatísticas de time | ESPN, Sportmonks | ✅ | — |
| xG | API-Football → fallback ESPN | ✅ `xgOfficial.ts` | — |
| **props de jogador** | Sportmonks (pago) ou API-Football | ⚠️ parcial | **médio** — é o único dado sem substituto barato |
| **odds por linha** (o que gera os "desajustes") | API-Football (100 req/dia free) | ⚠️ parcial (`fiveDollar`, `stamp`) | **médio-alto** — cota é o gargalo |

**Conclusão do plano:** 80% do /apitou é reproduzível com fonte oficial que o
projeto já integra. O que não é: **props de jogador e odds granulares**. Então a
arquitetura alvo é:

```
core (fixtures, resultados, stats, xG, H2H)  ← ESPN/Football-Data/Sportmonks  [primário]
enrichment (props, odds por linha, desajustes) ← apitou/kingstats             [opcional]
```

Com esse desenho, "o apitou cair" deixa de ser incidente P1 e passa a ser
degradação: o app mostra jogos, análise e histórico (core oficial), e sinaliza
"props indisponíveis". A inversão é o único item deste documento que muda o
**produto**, não a infraestrutura — por isso vem depois do M4.

### 4. Kill switch por módulo

`APITOU_ENABLED` / `KINGSTATS_ENABLED` (default `1`), lidos no server, na rota.
Com `0`: rotas devolvem o último payload com `degradado: true` em vez de 502, e a
UI mostra uma faixa. Custo: ~30 linhas. Benefício: parar um módulo quebrado sem
deploy. **Não** usar `NEXT_PUBLIC_*` (exigiria rebuild).

### 5. Postura legal e de contrato

- Ler o ToS das duas origens e registrar por escrito o que é permitido.
- **Parar de falsificar User-Agent** assim que houver rota oficial ou plano
  comercial: UA de browser é o que caracteriza burla de controle de acesso, e é
  a parte mais difícil de defender.
- Atribuir a fonte na UI enquanto o dado vier dela; não redistribuir o payload
  bruto (API pública de dados da origem, não de scraping).
- Pedir acesso/parceria. É a única saída que transforma risco em SLA — e o custo
  de um plano de dados oficial é menor que o custo de uma semana de /apitou fora
  do ar.

### 6. Runbook: "o apitou caiu agora"

| T | ação | quem |
| --- | --- | --- |
| T+0 | issue automática do `apitou-sync` (ou canário manual: `node scripts/apitou-sync.mjs --dry-run`) | automático |
| T+0 | confirmar se é origem ou nosso lado: `curl` do `dados.js` de **outra rede**, conferir `HTTP` e o começo do corpo (`window.`). Se vier HTML com 200 → headers/UA bloqueados; se 403/404 → rota mudou | dev |
| T+15min | se origem mudou: `APITOU_ENABLED=0` e redeploy de env (Vercel) — app serve último snapshot com faixa "dados de <data>" | dev |
| T+1h | abrir `/api/apitou/sync?estado=1` e confirmar `idadeMin`; se > 24h, comunicar na home | dev |
| T+1d | decidir: (a) parser novo se o formato mudou; (b) acelerar M5 se a rota sumiu | produto |
| T+7d | se não voltou: `/apitou` sai do menu e as telas viram "em manutenção" — não deixar 503 na navegação | produto |

Gatilho de decisão escrito antes do incidente é o que separa degradação de
pânico: em T+15min ninguém precisa discutir arquitetura.

## Build order

O que já existe virou o marco 0. Ordem por risco decrescente, não por facilidade.

**M0 — Quick Fix (feito, commit `89ab22e`).**
Chave única do cache (`cache-key.json`), verificação pós-gravação no script e
issue automática em falha / fechamento automático na recuperação.
*Screens:* — *Tabelas:* `apitou_cache` *Rotas:* `/api/apitou/sync`, job `apitou-sync`.

**M1 — Observabilidade do que já roda (1 dia, zero migration).**
Canário de conteúdo no script (pisos + campo obrigatório), idade do dado exposta
na UI, dono único do sync (Vercel Cron; Actions vira watchdog), `rateLimit` em
`/api/apitou/*`, cache do resultado de `/desajustes` (uma linha, TTL 15 min).
*Tabelas:* `apitou_cache`, `kingstats_cache` *Rotas:* as 4 do apitou.

**M2 — D2 `timestamptz` (1 dia, 1 migration).**
Pré-checagem de fuso, uma migration, schema Drizzle no mesmo commit.
*Tabelas:* as 46 colunas *Rotas:* todas (efeito indireto em sessão/trial).

**M3 — Cache particionado + advisory lock (2–3 dias).**
Releases A→B→C descritas acima.
*Tabelas:* `apitou_cache` (chaves novas) *Rotas:* `/jogos`, `/jogo/:id`, `/desajustes`.
*Depende de:* M1 (para medir o fallback antes de remover).

**M4 — D3 enums, D4 `updated_at`, D5 journal, D1 `public_id` (2 dias).**
Tudo aditivo, em migrations separadas, uma por PR.
*Tabelas:* todas *Rotas:* as que expõem id (`/api/auth/me`, `/api/conta`, `/api/tickets`).

**M5 — Inverter a dependência (2–4 semanas).**
Cascata oficial como primária para o core; apitou/kingstats atrás de flag como
enrichment; `/gameread` e `/nerdytips` entram na mesma varredura depois.
*Esforço maior:* props de jogador e odds granulares — decidir se vende plano
pago nesses dois antes de investir.

**M6 — Retenção e escrow (1 dia).**
Job de expurgo (30 dias nas `*_cache`, 7 dias em `rate_limits`), snapshot diário
fora do banco.

**M7 — Must-haves do `features.csv` que ainda faltam.**
A matriz do recon (9 `must`) é do clone do Gol Sinyali, não dos módulos internos:
`features.csv` está com `clone=no` em todas as linhas. Quando o escopo virar
"lançar a versão própria", este é o marco que fecha os 9 must — e ele depende de
M5, porque "palpite do dia + cupom + track record" quer o core em fonte oficial.

## Output

**Stack em uma linha:** Next.js 16 + Drizzle + Neon + Stripe na Vercel, conteúdo
de terceiros em `*_cache` no Postgres, jobs em Vercel Cron (Actions como watchdog).

**Contagem:** 35 tabelas, 66 rotas de API (8 nos dois módulos auditados), 4 jobs,
0 microserviços, 0 RLS (checagem por query no data layer).

**Os três pontos mais arriscados:**

1. **Fonte não-oficial** com UA falsificado (`fonte.ts:20`) — pode sumir sem
   aviso e é o único item que não se resolve com código. Mitigação: M1 + M5.
2. **Cache monolítico do apitou** (1,29 MB numa linha, parse integral por
   request) + lock só de processo — primeira coisa a estourar sob carga.
   Mitigação: M3.
3. **Três escritores no mesmo cache** sem dono (cron 09:00, Actions 06:00, lazy)
   — já causou o bug do `cache_key`. Mitigação: M1.

**Próximo passo:** `/replica-design` para fixar tokens e componentes do shell
antes do M1 (a faixa de "dados de <data>" e a tela de módulo degradado precisam
de componente aprovado, senão viram improviso em produção).
