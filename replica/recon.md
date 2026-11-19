# Recon — golsinyali.com (Gol Sinyali)

> Clean-room recon do app de palpites de futebol por IA **Gol Sinyali**
> (https://www.golsinyali.com). Fontes: páginas públicas, `robots.txt`,
> `sitemap-*.xml`, homepage e uma página de partida pública. Nenhum bundle JS,
> nenhuma API privada, nenhum scraper em loop. Viés: análise funcional/UX.

## 1. Escopo

- **App:** Gol Sinyali — palpites de futebol com IA (1X2, Over/Under, BTTS, etc.).
- **Plataforma:** Web (Next.js/Vercel) + PWA "app" para instalar no celular.
- **Fatia do MVP:** o core loop que as pessoas usam — **ver os palpites do dia,
  o cupom do dia e a taxa de acerto**, e abrir a análise de um jogo.
- **Para quem:** versão própria (MoneyScorer) — validar se o formato "palpite
  diário + cupom + track record" engaja antes de investir.

Idiomas publicados: tr, en, es, fr, it, de, pt (`sitemap-<locale>.xml`).
Domínio é a Turquia; conteúdo PT/BR já existe (Brasileirão etc.).

## 2. Fontes usadas

| fonte | o que deu |
| --- | --- |
| `robots.txt` | rotas privadas, API pública `GET /api/match/*/h2h`, crawl-delay 1 |
| `sitemap-pt.xml` / `-en.xml` | inventário de rotas (366 PT / 689 EN URLs) |
| homepage `/` | hero, tipos de palpite, cupom do dia, track record, ligas |
| `/pt/match/<id>/<slug>` | meta/detalhe: 1X2 %, Over 2.5 %, odds + H2H |

Privado/fora de escopo: `/admin`, `/api/`, `/*/profile/`, `/*/subscription/success/`.

## 3. Inventário de telas

| ID | tela | rota | propósito | componentes-chave | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Home / Palpites de hoje | `/` | hero + jogos em destaque + cupom + taxa de acerto | hero, cards de jogo, cupom, strip de acerto, grid de ligas | cheio, sem jogos |
| S02 | Análises (lista) | `/match` | todos os jogos do dia, filtráveis | lista/tabela de jogos, filtro liga | cheio, vazio |
| S03 | Detalhe da partida | `/match/<id>/<slug>` | análise IA do jogo | header do jogo, resumo IA, barras 1X2, O/U 2.5, odds, H2H, stats, top placares | pré, ao vivo, encerrado |
| S04 | Ao vivo | `/live` | placares/ sinais em tempo real | lista ao vivo, placar, minuto | ao vivo, sem jogos |
| S05 | Palpites por data | `/predictions` e `/predictions/<yyyy-mm-dd>` | palpites por dia | seletor de data, cards | cheio, dia sem jogos |
| S06 | Cupom do dia | `/gunun-kuponu` | seleção de múltiplas do dia | lista numerada de picks, "ver análise" | cheio |
| S07 | Track record | `/live-track-record` | histórico de acerto (transparência) | tabela/kpi de acerto por período | cheio |
| S08 | Preços | `/pricing` | planos/VIP | cards de plano, CTA | mensal/anual |
| S09 | App | `/app` | instalar PWA | QR/botões de loja | — |
| S10 | Institucional | `/about` `/faq` `/contact` `/privacy` `/terms` `/references` `/account-deletion` | confiança/legal/SEO | texto | — |
| S11 | Blog/SEO | `/blog`, `/blog/<slug>` | aquisição orgânica | lista/grid de posts | — |

Telas de SEO 1-página: `/palpites-do-dia`, `/palpites-certeiros`,
`/palpites-futebol-ia`, `/melhor-site-de-palpites`,
`/sites-de-palpites-de-futebol` (landing, reaproveitam o loop).

## 4. Fluxos do usuário

```
F01  Visitante vê os palpites de hoje
     S01 home -> (S03 detalhe de um jogo) -> S08 pricing [CTA VIP]
     edge: sem jogos no dia, jogo já ao vivo/encerrado

F02  Visitante monta o cupom do dia
     S01 (card cupom) -> S06 cupom -> S03 análise de um pick
     edge: cupom sem picks suficientes

F03  Visitante confere se "funciona"
     S01 (strip de acerto) -> S07 track record
     edge: período sem jogos liquidados

F04  Assinante acompanha ao vivo
     S04 live -> S03 detalhe ao vivo
```

## 5. Componentes

- **MatchCard** — logos, liga·rodada, horário/estado, barra 1X2 % (casa/empate/fora),
  chips de mercados (Over 2.5, BTTS, "time marca"), selo de confiança.
- **CouponCard / Cupom do dia** — lista numerada de picks + odd/prob + CTA.
- **HitRateStrip / Track record** — KPI de % de acerto por janela + link "ver tudo".
- **PredictionTypeChips** — MS (1X2), Alt/Üst (O/U), İY 0.5 Üst (HT), KG Var (BTTS).
- **ConfidenceBadge** — alta/média/baixa.
- **ProbBar** — barra segmentada casa/empate/fora.
- **LeagueGrid** — 6 ligas populares + contagem de jogos.
- **DatePicker** — navegação `/predictions/<data>`.
- **LanguageSwitcher** — 7 locales via path `/pt`, `/en`...

## 6. Modelo de dados inferido

```
Match      id, league, leagueName, country, round, kickoff,
           home {id,name,logo}, away {id,name,logo}, state (pre|live|post),
           score {home,away}            evidence: matchCard + /match/<id>
           confidence: high
Prediction match_id, market (1X2|OU2.5|BTTS|HT0.5|team-scores),
           probs {home,draw,away}, lambda {home,away}, confidence,
           top_scores[]                 evidence: meta da página + home
           confidence: high
Coupon     date, picks[] (match_id + market)          evidence: S06
           confidence: medium
TrackRecord window, hits, total, hit_rate, by_league[]  evidence: S01/S07
           confidence: medium
League     slug, name, country, match_count           evidence: S01 grid
           confidence: high
User/Plan  plan (free|vip), active_until              evidence: /pricing, /subscription
           confidence: medium
```

## 7. Matriz de features

Ver `replica/features.csv`. Decomposição dos "tipos de palpite":

- **MS (1X2)** — resultado (casa/empate/fora).
- **Alt/Üst** — mais/menos gols (linha 2.5).
- **İY 0.5 Üst** — mais de 0.5 gol no 1º tempo.
- **KG Var** — ambas marcam (BTTS).

## 8. O que não dá para clonar

- **skip** — conteúdo de blog/SEO (direitos autorais do texto; reescrever do zero).
- **skip** — rede de parcerias de odds e "dados reais" licenciados do original.
- **skip** — histórico de acerto do original (track record deles é deles).
- **skip** — marca, logo e copy (ver /replica-brand).

## 9. Dimensionamento

Screens: 11 · Flows: 4 · Entidades: 6.
Partes difíceis: dados de jogos/estatística em tempo real (já temos via ESPN),
cálculo de probabilidade (já temos: `runModel` Poisson/Dixon-Coles), histórico de
acerto confiável (precisa liquidar previsões no tempo).

**Tamanho: S/M** — porque o MoneyScorer já tem o motor (`runModel`), o data layer
(`getAllMatches`/`getTeamHistory`) e o track record. O MVP reusa tudo e só
monta o loop "home → cupom → análise".

Próximo passo: `/replica-architect` se quiser desenhar o schema completo; o MVP
já entregue em `src/app/palpites-ia/page.tsx`.
