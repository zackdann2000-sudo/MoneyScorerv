# Recon map — Scoore.ai (app.scoore.ai)

> Fonte: **somente páginas públicas**. Login-gated não foi observado (não há acesso à
> conta do usuário nesta sessão, nem browser). Nada foi decompilado, nenhum bundle
> JS foi lido e nenhuma chamada de API privada foi registrada.

## Fontes

| # | fonte | URL | o que deu |
|---|---|---|---|
| 1 | marketing | https://scoore.ai/ | posicionamento, 40+ mercados, 79% "accuracy", preço/planos |
| 2 | método | https://scoore.ai/how-ai-predicts-football/ | SC-Neura v3.1, Trust Score, 3 dias antes, 100+ ligas |
| 3 | planos | https://scoore.ai/subscription-comparison/ | matriz Free/Starter/Pro/Expert e limites diários |
| 4 | SEO por liga | https://scoore.ai/football-predictions/{liga}-predictions/ | 9 páginas de liga (PL, La Liga, Serie A, Bundesliga, Ligue 1, UCL, Nations, Liga Portugal, MLS) |
| 5 | app (público) | https://app.scoore.ai/login · /register · /price | Laravel + sessão; login social Google (`/auth/google`); app é PWA/site, não só nativo |
| 6 | lojas | App Store `id6752802131` (Scora) · Play `com.tryserg.scora` | existência de app nativo |
| 7 | blog | https://scoore.ai/category/blog/ | estratégias, H2H, gestão de banca |

## Core loop (o que o produto vende)

**Fixture → probabilidades do modelo por mercado → Trust Score → pick + value bet → resultado do dia anterior.**
Não é um chat: é um feed de picks com probabilidade independente da odd.

## Inventário de telas

| ID | tela | como chegar | propósito | componentes | estados |
|---|---|---|---|---|---|
| S01 | Marketing home | `/` | pitch, prova social, preço, CTA | hero, contadores (79%/40+/1000+), depoimentos, strip de ligas, tabela de planos | — |
| S02 | Como a IA prevê | `/how-ai-predicts-football/` | confiança no modelo | 4 passos, comparativo vs "tipsters", FAQ | — |
| S03 | Liga (SEO) | `/football-predictions/{liga}/` | entrada orgânica | 200+ data points, forma, xG, "3 dias antes" | — |
| S04 | Blog | `/category/blog/` | SEO/educação | cards de artigo | — |
| S05 | Login | `app.scoore.ai/login` | entrar | e-mail/senha, Google OAuth, texture bg | erro de credencial |
| S06 | Registro | `app.scoore.ai/register` | criar conta | e-mail/senha, termos | — |
| S07 | Planos | `app.scoore.ai/price` (+ `#price`) | assinar | Free/Starter/Pro/Expert, mensal/anual | — |
| S08* | Hoje / feed de jogos | pós-login | lista de fixtures do dia com pick | filtro por data/liga, card de jogo, tag de mercado | vazio (sem jogos), carregando |
| S09* | Detalhe da partida | clique no card | AI Match Overview | probabilidades 1X2, mercados (BTTS, Over/Under, Correct Score…), Trust Score, forma recente, H2H, xG, insights | bloqueado por plano |
| S10* | Value bets | menu | odds com edge | lista odd/modelo/EV, bookmaker | sem value no dia |
| S11* | Picks selecionados / filtros | menu (Expert) | afinidade por usuário | filtros por mercado/liga/odd, salvar | só Expert |
| S12* | Insights (Expert) | dentro do jogo | análise textual | parágrafos gerados, "checked by experts" | só Expert |
| S13* | Ontem / histórico | seção "Yesterday" | prova de acerto | lista W/L, taxa de acerto | — |
| S14* | Conta/assinatura | avatar | plano, quota, cobrança | uso do dia (1/6/20/∞), portal de cobrança | — |

`*` = **inferida** do texto público (confiança média/alta). Não vista.

## Fluxos

```
F01 Visitante avalia e cria conta
    S01 -> S07 (preço) -> S05 -> Google/e-mail -> S06 -> S08      (5 passos)
F02 Novo usuário consome o 1º pick grátis
    S08 -> S09 (1 análise/dia) -> paywall no 2º                     (2 passos)
F03 Converte para pago
    paywall -> S07 -> checkout -> volta ao S09                      (3 passos)
F04 Consulta value bet
    S10 -> S09 -> odd + edge                                        (2 passos)
F05 Confere se acertou
    S13 (ontem) -> detalhe do jogo                                  (1–2 passos)
F06 Assinante Expert filtra picks
    S11 -> filtros -> S09                                           (2–3 passos)
```

## Componentes recorrentes

`MatchCard` (times, hora, liga, pick, odd, tag de mercado) · `ProbabilityBar` (1X2) ·
`TrustScore` (nota + rótulo) · `MarketTab` (lista de mercados) · `ValueBetRow` (odd, edge, casa) ·
`Paywall/QuotaBadge` (1/6/20/∞ por dia) · `PlanTable` · `ResultBadge` (W/L) · `LeagueStrip` ·
`AuthForm` (e-mail + Google) · `CookieBanner`/Meta pixel (marketing).

## Modelo de dados inferido

```
User           id, email, name, provider(google|email), password_hash, plan_id,
               quota_used_today, quota_reset_at, locale, created_at
Plan           id, slug(free|starter|pro|expert), price_month, price_year,
               predictions_per_day, features(json)
Subscription   user_id, plan_id, status, current_period_end, provider(stripe?)
League         id, name, country, slug(SEO)
Team           id, name, logo, league_id
Fixture        id, league_id, home_team, away_team, kickoff_at, status, score
Prediction     id, fixture_id, market, selection, probability, odds, trust_score,
               published_at, model_version, confidence
Insight        id, prediction_id | fixture_id, text, type, expert_validated
ValueBet       id, prediction_id, bookmaker, odd, edge, captured_at
Result         prediction_id, outcome(hit|miss|void), settled_at
Notification   user_id, type, fixture_id, sent_at
```
Evidência: tabela de planos (quota diária, mercados por plano), "Trust Score", "Yesterday",
"3 dias antes", "40+ markets", "100+ leagues", login Google. Confiança: alta para
User/Plan/Subscription/Prediction/ValueBet; média para Insight/Notification.

## O que NÃO é clonável

- **SC-Neura v3.1** e os 15 anos de dados licenciados: o produto é o modelo. Reimplemente
  um equivalente com seus dados, não copie o deles.
- Números de marketing ("79% accuracy", "50k users", depoimentos): não reutilizar.
- Copy, logo, fontes (Poppins licenciada), screenshots e marca "Scoore/Scora".
- Base de odds/parceiros e qualquer API privada deles.

## Tamanho

Total: ~14 telas (7 observadas + 7 inferidas), 6 fluxos, 10 entidades.
**M** para o núcleo (feed + detalhe + value bet + planos/quota + resultados);
**L** se entrar modelo próprio com xG e 40 mercados; **XL** se incluir insights por IA
validados por especialistas.

## Gap vs GreenScore (o que já temos)

| Scoore | GreenScore hoje | falta |
|---|---|---|
| Feed do dia com pick | `/hub`, `/jogos` com prob. 1X2 | tag de mercado no card |
| Trust Score | **TRUST** em `/ev`, `/edge` | expor no card do jogo |
| Value bet / EV | `/ev` + `/edge` | odd de múltiplas casas (temos `odds-casas`) |
| 40+ mercados | ~15 (props, over/under, BTTS parcial) | mercados por plano |
| 3 dias antes | probabilidades pré-jogo no hub | publicação antecipada |
| Insights (Expert) | **Relatório IA** (`AiReport`) | gate por plano |
| Ontem/resultados | **Track Record** `/desempenho` | badge W/L no card |
| Planos por quota diária | trial 24h + VIP único | **quotas diárias Free/Pro/Expert** |
| SEO por liga | `/ligas` genérica | 9+ landing pages por liga |
| Login Google | e-mail/senha | OAuth |

**Resumo:** ~70% do núcleo já existe no GreenScore. O que falta e mais vende é
**quota diária por plano** (o funil Free→Pro) e **páginas de liga para SEO**.
