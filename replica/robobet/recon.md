# ROBÔBET — recon map (clean-room, fontes públicas)

Alvo: https://www.robobet.app (pt-BR, en, es, tr) · app Android `com.robobet.app` · PWA instalável.
Recon em 20/11/2026.

## 0. Limites deste mapa (o que NÃO foi pego)

- O produto logado é **SPA Vue**: o HTML público é só o shell (~10 KB). O conteúdo de
  `/novidades`, `/plans` e das leis **não** vem no HTML.
- **Não** li bundles JS, **não** chamei API interna, **não** usei conta de ninguém.
- Fontes usadas: `robots.txt`, `sitemap.xml`, manifest PWA, **páginas de jogo (SSR)**, slugs do
  changelog, e o texto público dessas páginas **como indexado publicamente** (Google/Play Store).
- `robots.txt` declara `Content-Signal: search=yes,ai-train=no,use=reference` e bloqueia
  crawlers de IA (`GPTBot`, `ClaudeBot`, `anthropic-ai`, `CCBot`…). Uso aqui = **reference**
  (spec para implementação própria), sem treinar modelo, sem copiar código/texto/logo/arte.
- Cada item marcado `não observado` é lacuna — precisa de screenshot do app logado.

## 1. Stack observada

| sinal | leitura |
| --- | --- |
| `<meta name="csrf-token">` + `/build/assets/app-*.js` | backend **Laravel** (PHP) + Vite |
| `vendor-vue`, `vendor-apexcharts`, `vendor-i18n` | front **Vue 3** + **ApexCharts** + i18n |
| `vendor-firebase` | **Firebase / FCM** (push) |
| `site.webmanifest` → `standalone`, `start_url: /`, `theme_color #0b0f19` | **PWA** (é o "app" instalado) |
| `/en`, `/es`, `/tr` + `hreflang` | 4 idiomas: pt-BR, en, es, tr |
| `sitemap.xml`: **14.652** URLs de jogo | catálogo gigante (base, feminino, reservas, 3ª/4ª divisão) |
| Play Store: 4,7★, atualizado 05/11/2026, "Contains ads", "No data collected" | distribuição Android |

## 2. Estrutura do app (abas inferidas do produto)

`Home` (lista de jogos do dia) · `Favoritos` (+ `Radar`) · `Bots` (+ `Loja`) · `Tickets` (múltiplas)
· `Jogo` (abas: **Ao vivo**, **Gráficos**, **Forma**, **H2H**, **Odds**, **Alertas**) · `Betto` (chat/voz).

## 3. Inventário de telas

### Observadas (HTML público / Play Store / changelog)

| ID | tela | rota / como chega | propósito | componentes-chave | estados vistos |
| --- | --- | --- | --- | --- | --- |
| S01 | Landing / entrada | `/` | vender, entrar, cadastrar | hero + login (SPA) | shell |
| S02 | Jogo **pré-jogo** | `/jogo/<a>-x-<b>-<YYYY-MM-DD>-<id>` | análise pré-jogo pública | header, "Forma recente" | "Ainda não começou" |
| S03 | Jogo **ao vivo** | mesma rota | acompanhar | placar, 7 métricas, forma, H2H | em andamento |
| S04 | Jogo **encerrado** | mesma rota | resultado | placar + "No intervalo estava X x Y" | "Encerrado" |
| S05 | Novidades | `/novidades` (+`/<slug>`) | roadmap e how-to | 15 cards | lista |
| S06 | Planos | `/plans` | preços/limites | 4 planos + comparação | tabela (texto público) |
| S07 | Privacidade | `/privacy-policy` | legal | shell | — |
| S08 | Termos | `/terms-of-use` | legal | shell | — |
| S09 | Ranking de ligas | `/leagues/ranking` | competição | não observado | — |
| S10 | **Radar de favoritos** | Favoritos → Radar | vários jogos ao vivo lado a lado | placar+minuto, **chance de gol e de escanteio nos próximos 10 min** por time, eventos escolhíveis | ao vivo |
| S11 | **Alertas deste jogo** | sino no jogo | seguir 1 jogo só | gol, escanteio, vermelho, início, intervalo, fim | on/off |
| S12 | Notificações push | app inteiro | avisar só o que importa | "vermelho que muda o jogo", "favorito grande perdendo", anti-repetição | — |
| S13 | **Loja de bots** | Bots → Loja | comprar bot pronto | histórico (entradas/acertos/período), descrição, compra in-app, aviso de nova versão | lista/detalhe |
| S14 | **Betto cria bots** | Betto | NL → bot | propõe condições a partir dos dados; usuário revisa e liga | chat |
| S15 | **Betto comenta** | gráfico do jogo | narração contextual | comentário no gráfico com "o que costuma acontecer em jogos parecidos" | ao vivo |
| S16 | **Betto voz** | Betto | ditar pergunta | microfone → texto no campo → revisão → enviar | — |
| S17 | **Betto gráficos** | jogo → Gráficos → Betto | explicar gráfico | "Explique este gráfico"; nas odds: "O que o mercado diz?" | — |
| S18 | **Criar múltipla** | Tickets | combinar | até **4 jogos**, **2–3 seleções do mesmo jogo**, chance estimada do conjunto | — |
| S19 | **Odds ao vivo** | gráficos | ler o mercado minuto a minuto | odd, probabilidade implícita, o que já "bateu" | ao vivo |
| S20 | **Escanteios: régua e projeção** | gráficos | projetar escanteios | linhas de **45% e 50%**; projeção full-time por time; "córners merecidos" vs tirados | — |
| S21 | **Etapas e pênaltis** | jogo | prorrogação/disputa | estágio da competição + disputa cobrança por cobrança | ao vivo |
| S22 | **Por onde atacam** | jogo → Ao vivo | mapa de ataque | card + heat map no campo: quem pressiona e de onde vem o ataque | ao vivo |
| S23 | **Perfis time/competição/jogador** | toque em time/liga/jogador | perfil completo | leitura rápida + comparação com a competição | — |
| S24 | Avalie o Robobet | app | NPS/estrelas | deep link Play Store | — |

### Sinais e métricas citados pelo próprio produto

- **Sinais ao vivo por time: FIRE, BALL, COMBO** (pressão / perto de marcar / os dois).
- **Chance de gol e de escanteio nos próximos 10 minutos (%)** — Radar e gráficos.
- **Momentum** com linha de média; **gols**, **córners**, **odds** como séries.
- Aviso quando uma condição de bot "dificilmente dispara" (validação de bot).

## 4. Conteúdo exato da tela de jogo (SSR, 3 variantes)

**Cabeçalho**: liga · mandante · placar/vs · visitante · status · data por extenso · linha-resumo em texto.

**"Estatísticas da partida"** (ao vivo/encerrado): posse %, finalizações, finalizações no alvo,
ataques perigosos, escanteios, cartões amarelos, cartões vermelhos.

**"Forma recente"** (até 10 jogos; mandante como mandante, visitante como visitante):

| linha | formato |
| --- | --- |
| Vitórias / empates / derrotas | `60% / 10% / 30%` |
| Gols marcados por jogo | `1,8` (vírgula pt-BR) |
| Gols sofridos por jogo | `1,4` |
| Jogos com mais de 2,5 gols | `70%` |
| Jogos em que os dois marcaram | `60%` |
| Escanteios por jogo (total) | `9,6` |
| Cartões por jogo (total) | `3,3` |

**"Confronto direto"**: "nos últimos **6** confrontos: X vitórias do A, Y empates, Z vitórias do B" +
"média de 3,3 gols e 9,3 escanteios por jogo".

**Rodapé legal**: "Estatísticas para análise esportiva. Não são garantia de resultado."

## 5. Planos (texto público)

| plano | bots | Betto (créditos/dia) | preço | cobrança |
| --- | --- | --- | --- | --- |
| VIP | 10 | 20 | $6,99/mês | mensal |
| **Premium** (mais popular) | 15 | 40 | $6,33/mês | $18,99 / 3 meses |
| Pro | 20 | 80 | $5,67/mês | $33,99 / 6 meses |
| Pro Plus | 40 | 100 | $8,00/mês | $47,99 / 6 meses |

Premium inclui: **alertas direto no grupo do Telegram**, **imagem do jogo no alerta (momentum ou
heat map)**, **avaliação automática de liga**, "tudo do VIP". Promessas: ativação instantânea,
cancelar quando quiser, pagamento seguro. Moeda: USD.

## 6. Fluxos de usuário

| ID | fluxo | passos | observado? |
| --- | --- | --- | --- |
| F01 | Ver jogo sem conta | busca → `/jogo/...` → forma → H2H | sim |
| F02 | Criar conta / entrar | `/` → cadastro/login | não |
| F03 | Achar jogo do dia | Home → lista → toque → jogo | não |
| F04 | Favoritar e radariar | Home → ★ → Favoritos → Radar | não |
| F05 | Criar bot | Bots → novo → condições → ligar | não |
| F06 | Comprar bot | Bots → Loja → detalhe → pagar → Meus bots | não |
| F07 | Bot via Betto | Betto → pedido → proposta → revisar → ativar | não |
| F08 | Alerta deste jogo | jogo → sino → eventos | não |
| F09 | Múltipla | Tickets → 4 jogos × 2–3 seleções → chance | não |
| F10 | Assinar | `/plans` → checkout | não |
| F11 | Perguntar ao Betto | Betto → voz/chat → explicação do gráfico | não |

## 7. Modelo de dados inferido

```
users(id, name, email, password, locale, plan_id, credits_left, telegram_chat_id, is_admin)
plans(id, slug, bots_limit, betto_credits_day, price_cents, period_months)
subscriptions(user_id, plan_id, status, provider, provider_ref, period_end)
leagues(id, country, name, tier, season, auto_evaluation_json)
teams(id, league_id, name, slug, logo) · players(id, team_id, name, position)
matches(id, league_id, home_team_id, away_team_id, kickoff_at, status, stage,
        home_score, away_score, ht_home, ht_away, slug)
match_stats(match_id, possession_h/a, shots_h/a, sot_h/a, dangerous_h/a, corners_h/a, yellow_h/a, red_h/a)
match_events(match_id, minute, type(goal|corner|card|sub|penalty), side, player_id)
momentum(match_id, minute, home_value, away_value, avg_line, signals_json)   # FIRE/BALL/COMBO por time
chance_next10(match_id, minute, goal_h, goal_a, corner_h, corner_a)          # % próximos 10 min
heatmap(match_id, zone, side, intensity)                                     # "por onde atacam"
team_form(team_id, window=10, venue, win/draw/loss_pct, gf_avg, ga_avg, over25_pct, btts_pct,
          corners_avg, cards_avg)
h2h(match_id, n=6, wins_home, draws, wins_away, goals_avg, corners_avg)
odds(match_id, market, selection, line, price, implied_prob, captured_at)    # odds ao vivo
bots(id, user_id, name, scope_json, conditions_json, status, origin(user|betto|store),
     last_run_at, fire_count, warn_rare)
bot_runs(bot_id, started_at, matches_scanned, picks_json, result)
bot_store_items(id, bot_id, seller_id, title, description, price, installs, rating, version, changelog)
alerts(id, user_id, match_id, events_json, channels(push|telegram), image_kind(momentum|heat))
alert_deliveries(alert_id, channel, device_or_chat, status, sent_at)
tickets(id, user_id, type(single|multiple), stake, selections_json, combined_odds, chance, status)
favorites(user_id, match_id) · devices(user_id, fcm_token, platform)
conversations(id, user_id) · messages(id, conversation_id, role, content, chart_context)
```

Regras visíveis: janela de forma = **10 jogos por venue**; H2H = **6 confrontos**; percentuais com
1 decimal e vírgula; múltipla = **até 4 jogos, 2–3 seleções do mesmo jogo**; sinais ao vivo por
time; chance sempre em janela de **10 minutos**.

## 8. Não clonável / fora do pacote

- Provedor de dados (odds, stats, eventos): não é público.
- Lógica interna dos bots e do modelo de "chance nos próximos 10 min": não é pública.
- Nenhum código, bundle, endpoint privado, texto, logo ou arte foi copiado.

## 9. Lacunas (precisam de captura no app logado)

S01 login/cadastro · S09 ranking · S10 Radar (estado real) · S13 Loja (detalhe + histórico) ·
S14-S17 Betto (4 modos) · S18 Tickets · S19-S20 gráficos (odds escanteios) · S21 prorrogação/pênaltis ·
S22 heat map · S23 perfis · S24 NPS · telas de Bots (criar/editar/lista).

Ordem de utilidade das capturas: **1)** Home, 2) Jogo (abas Ao vivo/Gráficos/Forma/H2H/Odds),
3) Radar, 4) Bots + Loja, 5) Tickets, 6) Betto, 7) `/plans` e telas de conta.
