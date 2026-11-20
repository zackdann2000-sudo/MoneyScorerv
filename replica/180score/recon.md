# 180Score — recon map (clean-room, fontes públicas)

Alvo: https://180score.com · app Android instalado no celular do usuário · recon 20/11/2026.

## 0. Limites e método

- Fontes: `robots.txt`, índices de sitemap (`/__sitemap__/*`), **páginas SSR** (home,
  `/predictions/`, hubs de mercado, `/pricing`, páginas de partida/time), e a ficha
  pública do app no Google Play (`com.grow.score`).
- **Não** abri bundles JS do Nuxt, **não** chamei `/api` (bloqueado no robots),
  **não** usei conta. `/admin` também bloqueado e fora de escopo.
- `robots.txt`: `Disallow: /admin`, `/api`. Sem content-signal de IA; ainda assim
  nada de código, texto de marketing ou asset foi copiado — só estrutura e regras.

## 1. Stack

| sinal | leitura |
| --- | --- |
| `/_nuxt/...`, `nuxt-robots`, `@nuxtjs/sitemap v7.6.0` | **Nuxt 3** (Vue), SSR + hidratação |
| páginas de 250 KB–1,5 MB | HTML SSR gigante: apostam tudo em SEO programático |
| sitemap index: **8 chunks de partidas** (~8.000 URLs), 29 de times, 1 de torneios | escala de catálogo |
| listas com "Loading matches…" + "Retry" | dados do dia são **client-rendered**; o que é SEO (partida/time) é SSR |
| app `com.grow.score` · **4GROW LTD** | 4,2★ · 9,59 mil avaliações · **1M+ downloads** · "Contains ads" · "In-app purchases" · Mature 17+ · atualizado 30/10/2026 |
| `180score.ai` | site irmão, só marketing do "AI Football Predictions" |

Cobertura declarada: **850+ ligas/torneios**, **5+ anos** de histórico, **150+ jogos
analisados por dia**, "mais de 1.000 partidas" analisadas para achar padrões.

## 2. Inventário de telas

| ID | tela | rota | conteúdo observado |
| --- | --- | --- | --- |
| S01 | Home | `/` | ticker "1X **AI Right**" (acertos validados), "Today's AI Predictions" com **TRUST x/10**, TOP MATCHES, LIVE MATCHES, POPULAR MATCHES/COMPETITIONS/TEAMS/PLAYERS, mega-menu (All · Competitions · Teams · Players · Popular Leagues · Leagues By Country), busca, Sign In |
| S02 | Hubs de mercado | `/football-predictions/` `-for-today/` `-for-tomorrow/`; `/best-…`; `/1x2-…`; `/btts-…`; `/over-under-…`; `/over-1-5-…`, `/over-2-5-…`, `/over-3-5-…`; `/under-1-5-…`, `/under-2-5-…`, `/under-3-5-…`; `/double-chance-…` | lista por mercado, com bloco SEO longo explicando o método |
| S03 | Predictions (app-like) | `/predictions/` | "Today's AI Predictions · 20th november", selo `TRUST x/10`, marcador **"1X AI Right"**, botão **Unlock** (paywall) |
| S04 | **Partida** | `/football/match/<casa>-<v-fora>-<id>/` | ver §3 |
| S05 | Time | `/football/team/<slug>-<id>/` | tabs **Info · Standings · Games & Predictions**; squad size, idade média, jogadores locais; forma recente por competição; tabela com PTS/DIFF/GLS/**LAST 5**; filtro Home/Away |
| S06 | Torneio | `/football/tournament/<slug>-<id>/` | classificação, tabela de grupos, próximos jogos |
| S07 | Jogador | `/football/player/<slug>-<id>/` | perfil + stats |
| S08 | Favoritos | `/favorites/` | times, ligas e palpites salvos (exige login) |
| S09 | Planos | `/pricing` | 3 planos + FAQ de cobrança/reembolso |
| S10 | Legal | `/terms-of-service/`, `/privacy-policy/`, `/cookies-policy/`, `/refund-policy/` | 18+, "Gamble Responsibly" |
| S11 | HTML sitemap | `/html-sitemap/football-competitions-1/` `-2/` | índice navegável de competições |
| S12 | Busca + filtros | overlay global | busca de partida/time; **filtro por odd e probabilidade** (pago) |
| S13 | Login / conta | "Sign In" | área logada não inspecionada |

## 3. Anatomia da página de partida (S04)

Cabeçalho: liga + país, data/hora, **estádio** ("Stadio Olimpico"), **árbitro**
("Ermanno Feliciani"), placar, **gols com minuto e autor** (15', 21', 85', 87' × 10', 81')
e o botão **ADD TO FAVOURITE**.

**Tabs**: `Prematch · Predictions · Summary · Power · Success Rate · Lineups · Stats ·
Standings · H2H · Player Ratings`.

**Bloco "AI Predictions" (badge `Optimal`, "powered by")**:

| mercado | exemplo (AS Roma × Cagliari) |
| --- | --- |
| Over 1.5 | odd **1.20** · **75%** |
| Match Winner | odd **1.36** · **43%** |
| Both Teams Score **NO** | odd **1.79** · **53%** |
| Double chance | 1X 1.07 · 60% / 2X 3.05 · 68% *(1X2 completo: 85% / 1.34)* |
| Ladder Over/Under **0.5 → 6.5** | Over 0.5 1.04 · 93% … Under 6.5 1.01 · 98% |

- Nota de rodapé do bloco: **"Prediction type · 85% Probability according to AI · 1.34
  Average rate"** — ou seja, publicam probabilidade **e** a odd média do mercado.
- **TRUST x/10**: score de confiança do pick (aparece na home e nas listas).
- **"AI Right"**: selo de acerto colocado retroativamente no pick vencedor.
- Estados previstos na própria página: *"não terminou"* / *"acabou e o palpite acertou"* /
  *"acabou e o palpite errou"*.
- Enquete **"Who will win? Cast your vote!"** (1/X/2).
- Textos SEO dinâmicos: "Results of previous matches", "analytics and predictions".

## 4. Abas ainda não observadas em conteúdo

`Power`, `Success Rate`, `Lineups`, `Stats`, `Standings`, `H2H`, `Player Ratings` têm
conteúdo **client-side** (o HTML só entrega os rótulos). Pelos textos de venda e pelas
notas da própria página, o que existe:

- **Power Charts** — gráficos de "power"/momentum do time e de gols, "team balance,
  goal timing, power", baseados nos últimos 10 jogos.
- **Success Rate** — taxa de acerto histórica do pick/mercado.
- **Lineups** — escalações confirmadas ("first to get official team lineups").
- **Player Ratings** — nota de desempenho por jogador.
- **Stats/Standings/H2H** — padrão do gênero.

## 5. Planos (público, `/pricing`)

| plano | preço cheio → promo | benefícios |
| --- | --- | --- |
| **Starter · 7 dias** | $11,99 → **$5,99/semana** | sem anúncios, AI predictions (acesso básico), **filtros por odd e probabilidade** |
| **1 mês** (mais popular) | $21,99 → **$10–11,99/mês** | AI predictions completas, **Power Charts**, **Best picks & recomendações**, filtros |
| **1 ano** (melhor oferta) | $59,99 → **$39,99 / 3 meses** | tudo acima + **filtros avançados** + acesso antecipado + suporte prioritário |

- Assinatura presa à conta (multi-dispositivo por login), cancelamento a qualquer momento,
  **sem reembolso** (exceções de cobrança duplicada em 24 h).
- Paywall visível: linhas da lista vêm com **Unlock**; benefício central é "sem anúncios +
  predições completas + Power Charts + recomendações + filtros".

## 6. Modelo de dados inferido

```
users(id, email, password_hash, plan, created_at)
subscriptions(user_id, plan, provider, status, period_end)
sports/competitions(id, name, slug, country, tier)          -- 850+ torneios
teams(id, name, slug, competition_ids) · squad(team_id, size, avg_age, local_players)
players(id, name, slug, team_id, position)
matches(id, competition_id, home_team_id, away_team_id, kickoff, venue, referee,
        status, home_score, away_score)
match_events(match_id, minute, type(goal|card|sub), player_id, team_id)
lineups(match_id, team_id, player_id, starter) · player_ratings(match_id, player_id, rating)
standings(competition_id, team_id, pts, gd, gf, ga, last5)
predictions(match_id, market(1x2|dc|btts|ou), selection, line,
            prob_model, avg_odd, trust_1_10, is_optimal, status(pending|right|wrong))
power_series(match_id|team_id, minute, power_home, power_away, goal_timing_json)
polls(match_id) · votes(match_id, user_id, choice_1x2)
favorites(user_id, kind(team|competition|match), ref_id)
notifications(user_id, match_id, kind)                      -- push do app
```

Regras que a UI deixa explícitas: `prob_model` sempre acompanhada de `avg_odd`;
`trust_1_10` > 0 destaca o pick; `is_optimal` marca o melhor pick do jogo; o pick só é
"sellable" para pagante (`Unlock`) mas o resultado (`right`/`wrong`) fica público.

## 7. O que vale roubar (ideia, não código)

1. **TRUST x/10** — um score único de confiança por pick, muito mais digerível que três
   porcentagens separadas. Dá para derivar do nosso `probModelo`, `evPct` e tamanho de amostra.
2. **"AI Right" retroativo** — carimba na lista os picks que acertaram. É a mesma ideia do
   nosso Track Record, mas exposta como selo no card.
3. **Odd média ao lado da probabilidade** — já temos isso com a odd de mercado; a diferença
   é publicar a média histórica do mercado para o mesmo pick.
4. **Ladder de Over/Under 0.5 → 6.5** com prob + odd por linha: nós só publicamos 2.5
   (e cartões/escanteios). Nossa `caudaPoisson` já calcula qualquer linha — é barato expor.
5. **Power Chart** ("team balance / goal timing / power" nos últimos 10) — é irmão do
   MomentumChart que acabamos de fazer, mas na janela de 10 jogos, não 15 minutos.
6. **Filtro por odd e probabilidade** como feature paga: nosso motor já filtra por
   `prob ≥ 65%` e odd 1.45–2.50; transformar isso em controle do usuário é pequeno.

## 8. Lacunas

Conteúdo real das abas Power/Success Rate/Lineups/Stats/Player Ratings (client-side),
telas de login/conta/favoritos, fluxo de compra no app, e o APK (não extraído — não foi
pedido como análise estática). Nada aqui foi inventado: o que não é observado está marcado.
