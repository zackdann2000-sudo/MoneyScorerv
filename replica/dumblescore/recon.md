# Recon — DumbleScore (dumblescore.com)

> Recon clean-room do serviço de análise de futebol **DumbleScore**.
> Fontes usadas: `robots.txt`, `sitemap.xml` (18.845 URLs), as 6 páginas de
> topo renderizadas, os bundles JS públicos do app (para inventário de telas e
> de rotas de API) e os endpoints **públicos** da API (`api.dumblescore.com`).
> Nada de conta paga, nada de scraper em loop. O objetivo é reconstruir a
> funcionalidade com código e textos próprios, não copiar código, assets ou copy.

## 1. O que o produto é

Um "centro de jogos" que calcula probabilidades próprias para partidas de
futebol (o próprio site chama o resultado de *oportunidade*: uma seleção com
valor esperado positivo). O ciclo de vida de cada jogo tem quatro estágios:

```
Preview  ->  Análise final (~60 min antes, escalações confirmadas)  ->  Ao vivo  ->  Review
```

- A **análise final** é a que decide a oportunidade e é a única que entra nas
  estatísticas públicas de acerto/ROI.
- Cada oportunidade é contada como **1 unidade** na odd do momento da
  publicação. Perdas ficam no histórico, nada é apagado.
- O modelo avalia o **elenco escalado** (xG por jogador, quem falta, banco
  enfraquecido), não só a média histórica do time.

Stack observada: Next.js (App Router, RSC, turbopack), MUI + Emotion, i18n por
path (`/pt`, `/en`, `/es`, `/fr`, `/it`, `/de`, `/zh-CN`), API separada em
`api.dumblescore.com` (ASP.NET, `traceId` no formato W3C), dados de futebol do
provedor Sportmonks (`cdn.sportmonks.com`), pagamentos por Stripe, PWA + app
Android, e um servidor MCP (`mcp.dumblescore.com`) para Claude/ChatGPT.

Monetização em quatro degraus:

| plano | preço | entrega |
| --- | --- | --- |
| Grátis | 0 | 3 jogos por semana com análise completa e oportunidade |
| Trial | 3 dias | plano intermediário liberado, e-mails de conversão |
| Scout | €3,90 | todos os jogos de campeonato em 2 ligas escolhidas |
| Oracle | €29 | tudo de campeonato, notificações de análise final e oportunidades |
| Alchemist | €49 | + outliers, arbitragem, cenários (múltiplas), exportações |
| Créditos | avulso | compra de análise avulsa, multi-bet e arbitragem |

## 2. Inventário de telas

| ID | tela | rota | propósito |
| --- | --- | --- | --- |
| S01 | Centro de Jogos (hoje) | `/matchcenter` | jogos de hoje com probabilidades 1X2 e estado da oportunidade |
| S02 | Arquivo de resultados | `/matchcenter/past` | jogos encerrados, resultado, xG e avaliação do modelo |
| S03 | Detalhe da partida | `/matchcenter/past/<id>-<slug>` e modal do jogo | análise preview/final, lineup, xG, fatores, odds |
| S04 | Sinais | `/signals` | três abas: Discrepâncias, Cenários, Arbitragem |
| S05 | Dados — ligas | `/leagues`, `/leagues/<slug>` | tabela, temporadas, jogos por liga |
| S06 | Dados — times | `/teams` | busca de times com país e liga |
| S07 | Dados — jogadores | `/players` | ranking de jogadores com nota, gols, assistências |
| S08 | Desempenho | `/performance` | histórico público: acerto, ROI, por liga e por mercado |
| S09 | Assinatura | `/pricing` | planos, trial, comparação com o grátis |
| S10 | Claude & ChatGPT | `/ai-apps` | conectar o MCP por OAuth, revogar conexão |
| S11 | Updates (blog) | `/updates`, `/updates/<slug>` | changelog do modelo e posts explicativos |
| S12 | Ajuda | `/help` | artigos + tooltips contextuais na interface |
| S13 | Institucional | `/disclaimer`, `/privacy`, `/terms`, `/imprint` | legal |
| S14 | Conta | `/account` | plano, créditos, métodos de login, região, bookmakers, exclusão |
| S15 | Minhas análises | `/my-analyses` | compras: avulsas, cenários, arbitragem, outliers |
| S16 | Watchlist | `/watchlist` | oportunidades e outliers que o usuário segue |
| S17 | Notificações | `/notifications` | central + configuração por canal e tipo |
| S18 | Suporte | `/support` | chat de tickets com a equipe |
| S19 | Loja | `/shop` (modal/página) | abas: análises, oportunidades, cenários, arbitragem, outliers |
| S20 | Checkout | `/checkout` | Stripe, cupom, trial, comparação de features |
| S21 | Onboarding | `/onboarding` | passos: como funciona, região, aviso legal, notificações, time favorito |
| S22 | Compartilhado | `/share/<token>` | card público de uma análise |
| S23 | Entrar | `/login` | Google, Telegram, link mágico por e-mail |
| S24 | Admin | `/admin` (24 seções) | dashboard de jobs, usuários, prompts, cupons, fórum, updater |

## 3. Fluxos do usuário

```
F01  Visitante -> Centro de Jogos
     S01 (lista do dia) -> S03 modal (probabilidades, xG livre)
       -> paywall "análise final" -> S09 pricing -> checkout (Stripe)

F02  Free user semanal
     3 jogos/semana liberados; ao esgotar, banner de upgrade e previews de
     jogos já analisados. Notificações de "próxima análise" para reengajar.

F03  Warehouse -> oportunidade
     S01 (selo de oportunidade) -> S19 aba oportunidades -> S03 detalhe
       -> comprar com crédito OU assinar Oracle

F04  Sinais
     S04 -> Discrepâncias (provider acima do mercado) / Cenários (3-5 jogos
       que combinam) / Arbitragem (odds cruzadas entre casas) -> S03

F05  Transparência (SEO e confiança)
     S08 desempenho -> filtros (período, liga, mercado) -> S02 resultados
       -> S03 com "review" pós-jogo e xG evaluation

F06  Dados
     S05 ligas -> temporadas -> jogos; S07 jogadores -> perfil -> time

F07  Assistente
     S10 conectar Claude/ChatGPT via MCP OAuth -> ler jogos/análises do usuário

F08  Suporte e conta
     S18 ticket -> admin responde; S14 troca de plano, região, bookmakers,
       exclusão de conta (LGPD), histórico de compras
```

## 4. Modelo de dados inferido

Derivado das respostas públicas (schedule, share/analysis, statistics, players,
leagues) — nomes normalizados para o nosso esquema.

```
league        id, sportmonks_id, name, slug, logo, country, competition_type,
              is_tracked, is_experimental
season        league_id, key(2026-2027), name, sportmonks_id
team          id, sportmonks_id, name, slug, logo, country_iso2, league_id
player        sportmonks_id, name, slug, image, position, detailed_position,
              shirt_number, nationality, dob, height, weight, team_id
fixture       id, sportmonks_id, league_id, season_id, stage, round, match_date,
              venue, home_team_id, away_team_id, scores (h/a, ht/ft), red_cards,
              live_state, minutes_played, is_cup, is_postponed,
              home/away_table_position
team_stats    team_id, league_id, season, form (last 5), goals_for/against avg,
              league_goal_avg, clean_sheet_streak, scoring_streak
lineup        fixture_id, team_id, formation, players[]
lineup_player fixture_id, player_id, role (xi|bench|sidelined), position,
              shirt_number, is_captain, injury_type, expected_return
analysis      id, fixture_id, version, type (Preview|Final|Review),
              lineups_included, text, confidence, predicted_xg_home/away,
              key_factors[], risk_factors[], lab_insights[], summary(jsonb),
              created_at, model_version, prompt_id
prediction    analysis_id, market (1X2|Over/Under|BTTS|DoubleChance),
              selection (Home|Draw|Away|Yes|No|HomeOrDraw|Over 2.5|...),
              probability
top_score     analysis_id, home, away, probability
xg_factor     analysis_id, side, factor_type, impact, weight, context(jsonb),
              detail(jsonb)
value_bet     analysis_id, market, selection, probability, odds, value,
              max_playable_odds, is_hot_pick, is_substitution
bookmaker_odd fixture_id, market, selection, bookmaker, slug, odds, fetched_at,
              is_pick, is_kalshi
opportunity   analysis_id, market, selection, odds, stake=1, outcome
              (won|lost|void|pending), settled_at, profit, roi
scenario      id, size(3..5), odds_combined, ev, leg[]
arbitrage     id, market, profit_margin, leg[] (bookmaker + odds)
outlier       id, fixture_id, bookmaker, market, deviation, ref_odds
user          id, email, role, region, language, plan, trial_ends_at,
              credits, created_at, deleted_at
subscription  user_id, tier, status, provider (stripe|paddle), period_end,
              cancel_at_period_end, price
purchase      user_id, kind (analysis|multibet|arbitrage), ref_id, credits_spent
watchlist     user_id, kind, ref_id, created_at
favorite_team user_id, team_id, notify
notification  user_id, type, payload, channel (inapp|email|push|telegram), read_at
user_settings user_id, odds_bookmakers[], favorite_team_prompt_seen, region
coupon        code, kind, percent/days, max_redemptions, valid_from/to
support_ticket / message     chat de suporte
prompt        league_id, version, content, active, performance(jsonb)
job_log       job_name, status, started_at, finished_at, error
```

## 5. Superfície de API observada (144 rotas no bundle)

| grupo | rotas | leitura |
| --- | --- | --- |
| público | `public/config`, `public/featured-analysis`, `public/announcements`, `public/performance-summary`, `public/help/tips`, `public/fixtures/:id` | dados sem login |
| catálogo | `schedule`, `schedule/fixtures`, `schedule/live-scores`, `leagues`, `teams`, `players`, `statistics/*` | jogos, ligas, times, desempenho |
| loja | `shop/analyses|chances|scenarios|arbitrage|outliers` (+`full`, `track`), `signals/compare` | paywall por item |
| conta | `account/me|features|region|language|logout|redeem-coupon|deletion`, `auth/{google,telegram,magic-link}` | identidade |
| pagamentos | `payments/plans|pricing-preview|stripe/checkout|upgrade|downgrade|cancel` | Stripe |
| engajamento | `notifications*`, `favorite-teams*`, `watchlist`, `my-analyses/*`, `support/chats`, `share/*` | retenção |
| IA | `ai-apps` (OAuth do MCP) | integração externa |
| admin | 41 rotas | jobs, prompts, cupons, fórum, analytics, logs, sync de odds |

## 6. Features-chave que definem o produto

1. **Ciclo preview → final → live → review** por partida, com a oportunidade só
   na análise final (escalação confirmada).
2. **Ensemble de mercados**: 1X2, Over/Under (1.5–3.5), BTTS, Dupla chance, com
   probabilidade por seleção e placares mais prováveis.
3. **xG por jogador e por escalação**: fatores com impacto e peso
   (`MissingKeyPlayer`, `WeakDefense`, `StandingsAdvantage`, `StrongRecentForm`,
   `SmallSampleRegression`, `HighScoringLeague`, ...), alguns liberados só com
   assinatura.
4. **"The Lab"**: padrões estatísticos recentes (eficiência por xG, domínio por
   intervalo de minutos, padrão de primeiro gol) com `solidityScore`.
5. **Odds multi-casa** (Pinnacle como referência, Bet365, 1xBet, Sporttip,
   Kalshi), odd mínima jogável (break-even do modelo) e `maxPlayableOdds`.
6. **Desempenho público auditável**: acerto, ROI, lucro, por mercado, por liga,
   por semana, incluindo "nenhum valor" count.
7. **xG evaluation** pós-jogo: xG previsto vs gols reais, acertou placar/tendência/
   diferença de gols, grade (`hit|near|miss`).
8. **Sinais**: discrepância de provedor, cenários (parlays de 3-5), arbitragem
   cruzada, outliers de odds por casa.
9. **Freemium com 3 jogos/semana + trial de 3 dias + créditos avulsos**.
10. **Multi-idioma (7 locales)**, PWA + Android, notificações push/e-mail/Telegram.
11. **Servidor MCP** para Claude/ChatGPT lerem as análises do usuário.
12. **Confiança explícita**: "contamos também quando erramos", previews nunca
    contam, liga experimental marcada e fora das estatísticas.
