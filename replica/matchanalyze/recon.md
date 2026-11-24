# Match Analyze — recon reverso (evidência pública, sem tocar no código)

Fonte: `https://matchanalyze.com` (Flutter Web/PWA), sitemap, páginas estáticas, bundle `main.dart.js` (4,6 MB, apenas leitura) e listagem da Play Store v1.12.8 / App Store id6761343632.
Método: REA (recon → inventário de telas → modelo de dados inferido → matriz de features), mesma convenção de `replica/`.

> O repositório `morluto/rea` **não contém o código do site** — é um toolkit de engenharia reversa por agentes. Foi usado como método; a extração abaixo vem das fontes acima.

## Stack observada (inferida)
- Flutter Web + CanvasKit, PWA (`manifest.json`, tema `#020B1F`, portrait).
- Backend Supabase (URL e RPCs expostos no JS: `get_match_market_menu`, `get_coin_balance`, `get_active_broadcasts_for_user`).
- PostHog (analytics/feature flags), Google AdMob (rewarded), RevenueCat/StoreKit+Play Billing (`Purchases-*`), OneSignal/FCM (push), Sign in with Apple + Google.
- Dados: agregador tipo FootyStats (`footystats_seasons_catalog`, `league_table_footystats`, métricas `btts_*`, `cards_*`, `corners_*`, `dangerous_attacks_*`, `expected_goals_*`).
- i18n: chaves `ui.*`, `stats.*`, `team_detail.*`, `market.*`, `league.*` — 20 idiomas (EN/TR/ES + 17).

## Inventário de telas (v1.12.8, "rebuilt")
1. **Home / Predictions** — jogos do dia, badge LIVE, Free Pick of the Day, AI Updates, seções por liga.
2. **Live** — placares ao vivo, gráfico de probabilidade de vitória, "Live AI Predictions" (BTTS, cartões over/under, quem lidera, "não haverá mais cartões").
3. **Match detail** (novo): prediction card com % por mercado; pressure; xG flow; shot map; live tracker; highlights; lineups; commentary; momentum; H2H com radar; injuries; referee; coach; stadium; news.
4. **Top Picks / Editor's Picks** — picks do dia + **scorecard público** (Success Rate, % hit rate, calibração).
5. **Combos** — AI Combo Builder + cards prontos: BTTS Combo, First Half Combo, Match Result Combo, Over/Under Combo, Surprise, Balanced, Best value; desbloqueio por moedas/premium.
6. **Ask AI** — chat por jogo, limite diário por tier (free vs premium), "Advanced Ask AI".
7. **Team page** — Overview (form, PPG, home advantage, goal minutes, xG, shot quality, attendance), Attack, Defense, Discipline, Tables, Squad, Injuries, Coach, Stadium.
8. **Player page** — estatísticas de temporada, minutos, gols, assistências, cartões, seguir jogador.
9. **League page** — tabela geral/casa/fora, tabela de forma, tabelas de estatísticas (49 métricas), top appearances, special tables, bracket de copas, Team of the Week.
10. **Search / Browse leagues** — busca unificada (jogos, times, ligas).
11. **Favorites** — times/ligas, lembretes de kickoff, alertas de gol, quiet hours.
12. **News** — feed por jogo/liga.
13. **Store / Coins** — pacotes de moedas, assistir anúncio → moedas, desbloquear palpite/combo, Season League Pass.
14. **Paywall** — semanal/mensal/anual; perks (todos os mercados, Ask AI, live predictions, ad-free).
15. **Account** — e-mail, Google, Apple, forgot password, restore purchases, delete account, sign out.
16. **Menu** — idioma, tema (Midnight/Neon/Light), versão, admin (editor de pick/mercado/probabilidade).
17. **Basketball** (novo) — NBA/WNBA/EuroLeague/EuroCup + 70 ligas: vencedor, total points, margin, team totals, placar por quarto.
18. **Web/SEO** — `/glossary`, `/how-it-works`, `/leagues/*` (50 ligas), `/privacy`, `/terms`, `/support`, `/account-deletion`; robots libera GPTBot/ClaudeBot/PerplexityBot (GEO/AEO).

## Modelo de dados inferido (chaves reais do bundle)
- `match_metrics`: `expected_goals_home/away`, `btts_pct(_home/_away/_overall)`, `cards_avg(_home/_away)`, `corners`, `dangerous_attacks_*`, `attacks_total`, `saves`, `possession`, `shots_on/off_target`, `home_advantage`, `ppg`, `form`.
- `league_stats`: `btts_1h_2h`, `cards_over_0_5..5_5`, `over15/25/35CardsPercentage`, `league_team_over_split_table(_period)`, `league_form_table`, `league_top_appearances`.
- `team_detail`: `attack.*` (xg, shots, conversion, goal_timing, btts_wdl), `defense.xg_against`, `disc.cards_25/35/45`, `overview.*` (ppg, home_adv, attendance, stadium, prediction_risk).
- `match_detail`: `stadium.gf_ga`, `referee.cards_per_match`, `referee.penalties_per_match`, `players.n_assists/n_minutes`, `injuries`, `news`, `lineups`, `coaches`.
- `predictions`: `market`, `pick`, `probability`, `confidence(_raw/_final)`, `confidence_bucket`, `tier` (free/premium/editor), `source`, `status` (won/lost/void), `picked_at_minute`.
- `coins`: `coin_balance`, `coin_ledger`, `coin_pack`, `earn_from_ad`, `daily_max`, `cap`.
- `combos`: `combo_count`, `combo_*` (btts/1h/result/ou/surprise/value).

## O que o GreenScore JÁ tem (equivalente real)
Placar/fixtures · 1X2 e mercados Poisson (BTTS, O/U, 1T, cantos, cartões, impedimentos) · forma 5/6/10 ponderada · splits casa/fora · H2H + Palpite Fixo · classificações · escalações/formações · momentum (pressão 10 min) · timeline ao vivo · props top-3 (6 mercados, média real 10 jogos) · track record · pick do dia/editorial · chat IA · favoritos · notícias · busca · admin · assinatura mensal/anual · PWA · exclusão de conta · árbitro (parcial) · desfalques (parcial).

## O que é GENUINAMENTE NOVO (ordenado por retorno)
1. **Combos + AI Combo Builder** — nenhum equivalente hoje (`combo` = 0 ocorrências no código).
2. **Gráfico de probabilidade de vitória ao vivo** (temos momentum, não win-prob).
3. **xG flow + shot map + heatmap** (temos `xgEst` derivado de finalizações, não xG oficial).
4. **Economia de moedas + rewarded ads + desbloqueio avulso + Season League Pass** (nada hoje).
5. **Basketball** (módulo inteiro, 70+ ligas, quarters/totals/margin).
6. **Bracket de copas + Team of the Week + special tables + most appearances.**
7. **Páginas de técnico e estádio (público/attendance).**
8. **Perfil completo de jogador + seguir jogador.**
9. **Alertas de gol + lembrete de kickoff + quiet hours** (hoje só value-alerts).
10. **Login Google/Apple + recuperação de senha** (hoje só e-mail/senha, sem reset).
11. **20 idiomas + 3 temas** (hoje PT-BR + 1 tema).
12. **Cobertura 1.200+ competições** (hoje 18 ligas canônicas + fallbacks).
13. **Glossário / how-it-works / 50 páginas SEO de liga** (só /metodologia hoje).

## Leitura de produto
O Match Analyze é "probabilidade + prova" com forte camada de monetização por microtransação (moedas) e retenção por notificação (gol/kickoff). O GreenScore é mais profundo em **análise de mercados** (Poisson próprio, props, EV, oportunidades) e mais honesto na marcação de dado estimado — mas perde em **consumo rápido** (combos, live win-prob, shot map) e em **aquisição** (SEO multilíngue, 1.200 ligas).
