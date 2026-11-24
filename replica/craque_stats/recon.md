# Recon — craquestats.com.br (Craque Stats)

> Recon clean-room do terminal de estatísticas de futebol **Craque Stats**.
> Fontes: bundle SPA (`/assets/index-*.js` + chunks lazy), `robots.txt`,
> `sitemap.xml`, `manifest.webmanifest`, `/locales/pt.json` (625 strings),
> API pública `api.craquestats.com.br` e as amostras públicas
> `/not_premium_endpoints/*.json`. Nenhum login, nenhum dado de usuário.
> Viés: análise funcional/UX + modelo de dados inferido.

## 1. Escopo

- **App:** Craque Stats — terminal de estatística de futebol (100+ ligas).
- **Plataforma:** SPA React/Vite + PWA instalável; backend Flask próprio
  servindo `/api/*` com controle de premium.
- **Fatia analisada:** **somente futebol** (o app também tem basquete/vôlei).
- **O que ele NÃO é:** não há modelo preditivo. Zero probabilidade 1X2, zero
  "IA", zero palpite. O produto é **screener de tendência + ficha de dados**.
  A "estratégia de aposta" vendida é o filtro histórico (taxa de acerto),
  não um modelo.

## 2. Fontes usadas

| fonte | o que deu |
| --- | --- |
| `index-DqOu9fbY.js` (1,8 MB) + 10 chunks | 29 endpoints `/api/*`, 40+ rotas, fluxo por tela |
| `/locales/pt.json` | inventário real de features: 63 estatísticas, filtros, textos, checkout |
| `GET /api/fixture_info_by_id` (público) | estrutura completa da partida (15 KB) |
| `GET /not_premium_endpoints/*.json` | `finder_result`, `player_info`, `player_stats`, `league_stats`, `season_by_team_id` |
| `sitemap.xml` | `/schedule`, `/super-odds` + milhares de `/game/:id` |

**Fornecedor de dados:** IDs de fixture (`686982391`), `state_id`,
`formation_field`, `aggregate_id`, `has_premium_odds` e as URLs
`cdn.sportmonks.com` no `player_stats.json` identificam a **SportMonks v3**
como origem. O backend é um proxy Flask com cache + gate de premium.

## 3. Inventário de telas

| ID | tela | rota | propósito | componentes-chave | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Agenda | `/schedule` | todos os jogos do dia, por liga | lista por data, busca, chips Ao vivo/Agendado/Finalizado, favoritar, promo Telegram | cheio, vazio, busca sem resultado |
| S02 | Partida | `/game/:id` | ficha do jogo | abas Geral/Ataque/Defesa/Disciplina, últimos confrontos, escalação em campo, split Jogo/1ºT/2ºT, odds premium | pré, ao vivo, encerrado, sem escalação |
| S03 | Super Odds | `/super-odds` | odds turbinadas de casas | card com odd, casa, timer de expiração, tiers Boa→Incrível, filtro por casa e faixa, link compartilhável | ativa, expirada, não encontrada |
| S04 | Jogadores | `/players` | busca e ranking de jogadores | busca, tabela por parâmetro, ranking com casa/fora/total | cheio, vazio |
| S05 | Jogador | `/player/:id` | ficha do jogador | stats por temporada, média/P90, últimos jogos, posição, próximo jogo | com/sem histórico |
| S06 | Times | `/teams` | busca de times | tabela, filtro de liga | cheio, vazio |
| S07 | Time | `/team/:id` | ficha do time | Estatísticas, Eventos, Ranking, Melhor/Pior, próximos jogos, próximo confronto | cheio, vazio |
| S08 | Ligas | `/leagues` | lista de competições | tabela por país/temporada | cheio |
| S09 | Liga | `/league/:id` | ficha da liga | Estatísticas, Classificação (POS/TIME/J/V/E/D/PTS/GRUPO), Jogos, Ranking, Melhor/Pior, próximos jogos | cheio, sem tabela |
| S10 | Árbitros | `/referees` | tabela de árbitros | média por parâmetro, ordenável, "apenas com próximo jogo", Hoje/Amanhã/dias | cheio, vazio |
| S11 | Árbitro | `/referee/:id` | ficha do árbitro | médias de cartões/faltas/pênaltis, histórico, próximo jogo | com/sem dados |
| S12 | Busca avançada — jogador | `/finder-player` | **screener** de props | data, liga, estatística, "pelo menos", "nos últimos 3/5/10", taxa de acerto mínima | resultado, nenhum resultado |
| S13 | Busca avançada — time | (aba da mesma tela) | screener de time | mesmas entradas + chutes/chutes ao gol/escanteios/cartões/faltas/impedimentos/posse + 1ºT | idem |
| S14 | Robô Telegram | `/telegram-bot` | alertas por filtro salvo | conectar via `t.me/<bot>?start=<token>`, filtros de jogador/time, 1 filtro grátis | conectado, não conectado, não premium |
| S15 | Minha conta | `/my-account` | assinatura e pagamentos | status (teste/pago/atrasado/cancelado), PIX QR, cancelar assinatura | com/sem assinatura |
| S16 | Planos | `/plans` | preços | mensal/anual, "compre 1 ano leve 2", selo recomendado | — |
| S17 | Checkout | `/checkout` | pagamento BR | PIX + cartão 12x, cupom, dados do cliente, parcelas | aprovado, recusado, pendente |
| S18 | Afiliado | `/affiliate-registry` `/affiliate-dashboard` | programa de indicação | cadastro no provedor de pagamento, painel, comissão | cadastrado, não cadastrado |
| S19 | Auth | `/login` `/register` `/forgot-password` | conta | e-mail+senha, Google, celular, termos | erro, sucesso |
| S20 | Curso | `/tutorial-video` | onboarding em vídeo | player + CTA premium | logado, anônimo |
| S21 | Admin | `/admin_panel` | operação | assinaturas, permissões, afiliados | — |
| S22 | SEO | `/game/:id` no sitemap | aquisição orgânica | 1 página por jogo, `lastmod` diário | — |

## 4. Fluxos do usuário

```
F01  Chegar e achar o jogo do dia
     / -> S01 agenda -> S02 partida -> (premium guard) S16 planos
     edge: dia sem jogos, jogo ao vivo, jogo sem escalação

F02  Passar o filtro (o core loop do produto)
     S12/S13 -> escolhe liga + estatística + "pelo menos X" + últimos N + taxa
     -> tabela de resultados (total, média, P90, taxa, últimos jogos)
     -> S05/S07 para ver o histórico completo -> S16 planos

F03  Conferir disciplina de árbitro antes do mercado de cartões
     S10 -> S11 -> S02 do próximo jogo dele

F04  Caçar valor em odd turbinada
     S03 -> filtra casa/faixa -> card com timer -> link compartilhável

F05  Automatizar
     S14 conecta Telegram -> salva filtro -> recebe diariamente
     edge: não premium = 1 filtro; não logado = bloqueado

F06  Assinar
     S15/S16 -> S17 (PIX ou cartão 12x) -> /checkout/success -> premium
```

## 5. Modelo de dados inferido

```ts
fixture {
  id, name, home_id, away_id, league_id, league_name, league_country_id,
  league_season, season_id, stage_id, round_id, group_id, aggregate_id,
  starting_at, starting_at_timestamp, state_id, score, result_info,
  referee_id, venue_id, leg, length, placeholder,
  has_odds, has_premium_odds, lineups[]
}
lineup {
  id, fixture_id, player_id, player_name, team_id, jersey_number,
  position_id, formation, formation_field, formation_position, type_id,
  stats_info { enter_field_time, exit_field_time, replaced_by, replaced_player_id }
}
fixtureStat      { fixture_id, home{}, away{} }   // chaves em CAIXA ALTA: GOALS, CORNERS, BALL_POSSESSION, YELLOWCARDS, REDCARDS, ASSISTS, FOULS, OFFSIDES...
playerStat       { player_id, fixture_id, team_id, jersey, data{STAT: n}, image_path }
propsFinderRow   { player_id, player_name, team_id, team_name, position_id, league_id,
                   average, average_p90, total, hit_rate, form[], next_fixture_id, next_fixture_date }
referee          { nome, jogos, amarelos, vermelhos, faltas, penaltis }  // agregados do árbitro
superOdd         { id, casa, odd, mercado, jogo, expira_em, tier, link_codificado }
premiumUser      { assinatura(status, expira_em), pagamentos[], afiliado{comissao} }
```

**Catálogo de estatísticas (63):** gols, assistências, minutos, nota, toques,
aparições, finalizações (total/no gol/para fora/bloqueadas), chutes bloqueados,
chances claras perdidas/criadas, bola na trave, passes (total/certos/%/decisivos),
lançamentos (total/certos), passes em profundidade (total/certos), cruzamentos
(total/certos), escanteios, disputas (bola vencidas/perdidas, aéreas
vencidas/perdidas), dribles (tentados/certos/driblado/desarmado), desarmes,
interceptações, rebatidas, salvadas na linha, faltas (cometidas/sofridas),
cartões (amarelo/vermelho/segundo amarelo), defesas (total/dentro da área),
gols sofridos (goleiro/time), socos na bola, posse de bola %, pênaltis
(convertidos/perdidos/cometidos/sofridos/defendidos), capitão, impedimentos,
gols contra, erros para gol, tiros de meta, ataques perigosos, clean sheet.

## 6. Endpoints observados

| método | rota | uso | auth |
| --- | --- | --- | --- |
| GET | `/api/fixture_info_by_date?start_ts&end_ts` | agenda | público |
| GET | `/api/fixture_info_by_id?id=` | ficha da partida (com escalação) | público |
| GET | `/api/leagues_by_dates?dates[]` | ligas com jogo na data | público |
| GET | `/api/fixture_statistics?fixture_ids&current_half=full-game\|1st-half\|2nd-half` | stats do jogo por tempo | login |
| GET | `/api/last_fixtures_head_to_head?id=` | últimos confrontos | login |
| POST | `/api/props_finder` `{dates, leagues_ids, stat, min_value, game_count, hit_rate, tz_offset, type:team}` | **screener** | login |
| GET | `/api/league_by_seasons_ids`, `/api/season_by_team_id` | seletor de temporada | login |
| GET | `/api/fixture_info_by_player_id`, `/api/player_by_id`, `/api/season_by_player_id` | jogador | login |
| GET | `/api/fixture_info_by_referee`, `/api/referee_by_id`, `/api/season_by_referee_id` | **árbitro** | login |
| GET/POST | `/api/bot_filters` | filtros salvos do bot | login |
| POST | `/api/telegram/connect` -> `{token}` | deep link `t.me/<bot>?start=<token>` | login |
| GET | `/api/att_favorite_target`, `/api/get_favorite_target` | favoritos | login |
| GET | `/api/affiliate_dashboard`, `/api/rbt_pay_affiliate_info` | afiliado | login |
| — | `/api/consent`, `/api/product_tours/`, `/api/surveys/`, `/api/web_experiments/`, `/api/early_access_features/` | PostHog (consentimento, tours, survey, flags) | público |

Samples públicos usados como contrato: `/not_premium_endpoints/finder_result.json`
(linha do screener), `player_info.json` (fixture+elenco), `player_stats.json`
(stat por fixture), `league_stats.json` (stats casa/fora por fixture),
`season_by_team_id.json`.

## 7. Como eles analisam (a "estratégia", em 7 mecanismos)

1. **Taxa de acerto (hit rate)** — o coração do produto. "Nos últimos N jogos,
   em que % das vezes o jogador/time passou do piso X?" Ordena por frequência,
   não por probabilidade futura.
2. **Split por tempo** — toda estatística em Jogo completo / 1º tempo / 2º tempo
   (`current_half`). Base dos mercados de 1º tempo.
3. **Sequência (%Seq)** — por jogo: total, média, média P90 e "% de jogos acima
   do mínimo". Distingue média alta de série em andamento.
4. **Normalização P90** — média por 90 min para comparar quem joga 60' e 90'.
5. **Árbitro** — média de cartões/faltas/pênaltis por jogo + próximo jogo dele.
6. **Super Odds** — feed de odds turbinadas com expiração e selo de qualidade;
   é a camada de "valor" deles (não há EV calculado).
7. **Automação no Telegram** — o screener roda de novo todo dia e entrega os
   nomes que continuam batendo o filtro.

## 8. Componentes

- **MatchRow** — liga·horário·estado, times, escudos, placar, selo ao vivo, estrela.
- **StatsTable (janela)** — linhas por jogo, colunas Total/Média/P90/%Seq, toggles
  (1T/2T, soma substituições, algum dos últimos 5 jogos, jogadores ativos,
  ocultar vazios, destacar, casa/fora, temporada, nº de jogos, ligas, ocultar
  soma/colunas).
- **FinderForm** — data, competição, estatística, "pelo menos", "nos últimos",
  taxa de acerto mínima, CTA Buscar.
- **FinderResultTable** — jogador, próximo jogo, total, média, média P90, taxa,
  últimos jogos (form), ligas.
- **RankingTable** — temporada, parâmetro, Casa/Fora/Total, posição, foto, média
  90', total, marcado/sofrido, filtro de times.
- **StandingsTable** — POS/TIME/J/V/E/D/PTS, GRUPO, temporada.
- **RefereeTable** — ordenar por parâmetro, "(Média)", só com próximo jogo,
  Hoje/Amanhã/N dias.
- **BetterWorse** — time/jogador + parâmetro + Qtd. + Mais/Menos.
- **FormationPitch** — `formation_field`/`formation_position`, titulares vs quem
  finalizou.
- **SuperOddCard** — casa, mercado, odd, timer, tier, copiar link.
- **PremiumGuard** — bloqueio com CTA de plano.
- **PlanCard** — mensal/anual/recomendado/economize.
- **CheckoutForm** — PIX/cartão, CPF, CEP, parcelas, cupom.

## 9. Monetização e aquisição

- Freemium: "Times gratuitos do dia" + premium para o resto do catálogo.
- Planos: 1 mês / 1 ano / "1 ano leve 2" (promo) / Black Friday; cupom só na
  primeira cobrança.
- Pagamento BR: PIX (QR copiável) e cartão em até 12x, via Pagar.me.
- Afiliados com comissão, cadastro no provedor de pagamento.
- Aquisição: sitemap com milhares de `/game/:id` + bot Telegram gratuito como
  isca + PWA instalável + vídeo-curso.

## 10. Fora de escopo / privado

`/admin_panel` (assinaturas, permissões, afiliados), `/api/affiliate_dashboard`
(dados de terceiros), tokens de afiliado, e qualquer endpoint que exija login.
Não copiar: escudos/fotos/logos, nome, marca, textos e o vídeo do curso.

## 11. O que isso significa para o MoneyScorer

O Craque Stats é **terminal de dados**; o MoneyScorer é **motor preditivo**
(Poisson/Dixon-Coles, Veredito, +EV, track record auditável). Copiar o terminal
não substitui o modelo — soma profundidade ao que já existe:

| gap | esforço | insumo |
| --- | --- | --- |
| Split 1T/2T em toda estatística | baixo | `current_half` (SportMonks) |
| %Seq + P90 na UI | baixo | cálculo puro sobre histórico local |
| Módulo Árbitros | médio | `referee` na fixture + agregados |
| Screener (jogador/time, piso + N + taxa) | médio | histórico já cacheado |

Itens que **não** valem copiar agora: Super Odds (exige feed de odds
turbinadas), afiliados e PIX (dependem de outro provedor de pagamento).
