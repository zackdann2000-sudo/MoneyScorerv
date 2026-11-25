# Recon — SportPicker (sportpicker.ai/en) · foco: aba FUTEBOL

Recon de **superfície pública**: HTML renderizado, `sitemap.xml`, `robots.txt`, todos os
bundles JS do App Router (client chunks), e **endpoints públicos não autenticados**.
Nenhum login, nenhum cadastro, nenhuma conta criada. Nada do projeto GreenScore foi
alterado — este documento é só diagnóstico.

- Feito em: 2026-11-24
- Alvo: `https://sportpicker.ai/en` (Next.js App Router + PWA + 6 locales)
- App Android instalado no aparelho do usuário = mesma API/superfície da web (PWA)
- Artefatos brutos do recon: `.recon/sp/` (HTML, chunks JS, `acc.json`, `sitemap.xml`)

---

## 1. Sumário executivo

**O que é.** Hub multi-esporte (12 esportes) de placar ao vivo + estatística + um modelo
chamado **AURA** que publica um pick por jogo com % de confiança, odd, texto de análise e
lista de fatores. Futebol é o esporte com produto completo (o resto é placar/estatística).
Posicionamento legal explícito em toda página: *informação, não conselho; sem links de
casa de aposta; sem promessa de acerto ou lucro.*

**Como ele analisa o jogo (o que dá para provar):**

1. Dados vêm de **API-Football (api-sports.io v3)** — o site expõe até um **proxy aberto**
   em `/api/football/*` (fixtures, statistics, lineups, events, standings, odds e
   `predictions`) que responde **sem autenticação**. Formato de resposta é literalmente o
   da API-Football: `{"get":"fixtures","parameters":…,"response":[…]}`.
2. As probabilidades do AURA são geradas no servidor (não há código de modelo no client).
   O que vaza no client: **metadados de versão do modelo**, **fórmula de ranking dos picks**,
   **protocolo de publicação**, **métricas de track record** e **matemática do bilhete sistema 8/10**.
3. O pick publicado não é "o mais provável", é **o de melhor score** por uma função que
   combina probabilidade do modelo, odd de mercado (EV implícito), prior por tipo de
   mercado e penalidades. Essa função está inteira no bundle (§5.3).
4. Publicação em **dois estágios**: análise `early` (preliminary) → `final` (confirmada),
   com política explícita (conf ≥ 70%, odd ≥ 1,20, snapshot 6h antes do jogo) e estados de
   suspensão/expiração/`no_bet`.
5. Transparência pesada: track record público **segmentado por faixa de odd**, com
   **CLV (closing line value)**, intervalo de Wilson 95%, Brier score, ROI e unidades —
   e **proveniência auditável** (coorte histórica + ledger de publicações ao vivo).

**Achado mais importante para nós:** o diferencial do SportPicker não é o modelo em si
(nosso Poisson com xG é equivalente ou melhor), é a **camada de honestidade mensurável**
(CLV, faixas de odd, coorte de baseline, `no_bet`, separação preliminary/confirmed) e a
**matemática de bilhete sistema 8/10**. É isso que o usuário cético compra.

---

## 2. Stack e superfície técnica

| Item | Evidência |
|---|---|
| Next.js (App Router, RSC) + React Server Components | `self.__next_f.push`, `_next/static/chunks/app/[locale]/…` |
| Tailwind + shadcn/ui (`data-slot`, `cn()`) | classes no bundle |
| Estado: Zustand com `persist` (`sportpicker-predictions`, version 2) | store de predições com `partialize`/`migrate` |
| Data fetching: TanStack Query (`queryKey`, `staleTime`) | `["sports-v1","catalog"]` `staleTime:18e5`, fixtures `staleTime:36e5`, ligas `864e5` |
| PWA | `/manifest.webmanifest`, `icons/icon-192/512.png`, `apple-touch-icon` |
| Analytics | Umami self-host (`/api/analytics/umami-config`, `/api/analytics/presence`), + `/api/track`, Meta conversion API, GA-like `Measurement` |
| Auth | Google, Apple, e-mail+senha (`/api/auth/google`, `/api/auth/apple`, `/api/auth/me`, `/api/auth/logout`) |
| i18n | 6 locales: `en, it, es, es-419, de, fr` (`/[locale]/…`) |
| Erros/limites | retry com backoff em 429/503 usando `Retry-After` (máx. 10s), header `X-SportPicker-Timezone` |
| Schema versionado de API | header `X-SportPicker-Schema: sports-v1`; se não bater → 502 |
| Anti-scrape | `robots.txt` bloqueia `/api/` e `/admin/` |

### 2.1 Endpoints descobertos (client bundles)

Públicos:

| Endpoint | O que devolve |
|---|---|
| `POST /api/predictions` | `{fixtureId, locale, matchDate}` → predição AURA (**401 sem login**) |
| `GET /api/predictions/live` | predição ao vivo (**401**) |
| `GET /api/predictions/featured` | pick grátis do dia → `{featured, isFreeDay, nextFreeDay}` |
| `GET /api/predictions/accuracy` | **track record público completo** (aberto, sem login) |
| `GET /api/predictions/slates/winners?includeVoids=1` | **bilhetes vencedores** (aberto) |
| `GET /api/football/{recurso}` | **proxy API-Football v3 aberto** (ver §2.2) |
| `GET /api/sports/v1`, `/api/sports/v1/{sport}/competitions[/{id}]` | catálogo multi-esporte versionado |
| `GET /api/news?locale=` | feed de notícias |
| `GET /api/chat/support` / `POST` | chat (suporte) |
| `POST /api/track` | eventos |
| `/api/auth/*`, `/api/votes`, `/api/votes/username`, `/api/notifications`, `/api/notifications/content-preferences` | conta, votos, push/preferências |

Autenticados/premium: `/api/predictions`, `/api/predictions/live`, `/api/predictions/recommended`,
`/api/predictions/slates`.

### 2.2 O proxy aberto de API-Football (achado operacional)

```
GET https://sportpicker.ai/api/football/fixtures?next=5
GET https://sportpicker.ai/api/football/fixtures/statistics?fixture=1635731
GET https://sportpicker.ai/api/football/fixtures/lineups?fixture=1635731
GET https://sportpicker.ai/api/football/fixtures/events?fixture=1635731
GET https://sportpicker.ai/api/football/standings?league=39&season=2025
GET https://sportpicker.ai/api/football/odds?fixture=1635731
GET https://sportpicker.ai/api/football/predictions?fixture=1635731   ← modelo do próprio API-Football
```

Todos respondem **200 sem chave**. O `predictions` é o modelo estatístico do API-Football
(`percent: {home, draw, away}`, `advice`, `winner.comment`, `win_or_draw`, `under_over`,
`goals.home/away`, `comparison`), **diferente** do pick do AURA no mesmo jogo (ex.: fixture
1635731 — API-Football: *"Double chance: draw or Betis"*; AURA: *Under 3.5 @1.95, conf 52,3%*).

> Leitura prática: (a) confirma a fonte de dados; (b) serviria de **baseline de comparação**
> (o "mercado/modelo burro") para o nosso Track Record; (c) **não** deve virar dependência
> nossa — é proxy de terceiro, some sem aviso e viola ToS da api-sports se usado em produção.

---

## 3. Inventário de telas (futebol)

| ID | tela | rota | o que tem |
|----|------|------|-----------|
| S01 | Home | `/en` | jogos do dia agrupados por competição (grandes ligas primeiro), date navigator, placar ao vivo, próximos, resultados, **pick grátis do dia (featured)** |
| S02 | Ao vivo | `/en/live` | todos os jogos in-play, auto-refresh + estado de conexão declarado ("real-time ativo" / "fallback por polling"), placar, minuto, eventos |
| S03 | Ligas | `/en/leagues` | catálogo 200+ competições, filtro por país, badge de cobertura |
| S04 | Liga | `/en/league/{id}` | jogos da competição, classificação, contexto |
| S05 | Jogo | `/en/match/{id}` | placar/tempo, **estatísticas**, **escalações + formação + banco + técnico**, **timeline de eventos** (gol, assistência, cartão, substituição, pênalti perdido/confirmado, gol cancelado/confirmado = VAR), **H2H**, **forma recente**, e o bloco AURA |
| S06 | Time | `/en/team/{id}` | jogos, resultados, próximo jogo, contexto |
| S07 | Jogador | `/en/player/{id}` | dados do jogador |
| S08 | Predictions (metodologia) | `/en/predictions` | como ler confiança, pick, odd e fatores; diferença entre "Predictions" e "Recommended picks" |
| S09 | AI Track Record | `/en/ai-accuracy` | acerto por **faixa de odd** (baixa/média/alta), Wilson 95%, ROI, unidades, Brier, **bilhetes vencedores** |
| S10 | Odds (educação) | `/en/odds` | odd decimal → prob. implícita, **overround/margem e prob. justa**, comparação com AURA, mercados cobertos |
| S11 | Recommended picks | `/en/recommended` | só o que passa no filtro de qualidade (login) |
| S12 | AURA Chat | `/en/chat` | conversa sobre o jogo/mercados (Ultra) |
| S13 | Vote leaderboard | `/en/vote-leaderboard` | ranking público de quem mais acerta votando "quem vence?" |
| S14 | Premium | `/en/premium` | Free / Pro / Ultra, cobertura por ligas |
| S15 | News | `/en/news` | feed editorial |
| S16 | Favorites | `/en/favorites` | times/ligas salvos (conta) |
| S17 | Search | `/en/search` | busca global (time, jogador, competição) |
| S18 | Sports | `/en/sports` + `/en/sport/{sport}[/live|/competitions]` | 12 esportes |
| S19 | Guides / FAQ / About / legal | `/en/guides/*`, `/faq`, `/about`, `/terms`, `/privacy`, `/cookies`, `/delete-account` | conteúdo SEO + conformidade (exclusão de conta!) |
| S20 | Admin | `/admin` (bloqueado no robots) | backoffice |

**12 esportes:** AFL, Baseball, Basketball, Formula 1, Football, Handball, Hockey, MMA, NBA,
NFL, Rugby, Volleyball.

**Mercados exibidos no futebol** (página `/en/odds` + payload): `1X2`, `Over/Under`
(2.5 e outras linhas), `BTTS`, `Double Chance` (`1X`, `X2`, `12`), `Draw No Bet`,
`Clean Sheet`, e o tipo interno `Multigol`/`Total Goals`.

**Estatísticas de jogo** (nomes vistos no bundle, = API-Football):
Ball Possession, Total/Shots on/off Goal, Blocked Shots, Shots insidebox/outsidebox,
Corner Kicks, Free Kicks, Fouls, Offsides, Yellow/Red Cards, Goalkeeper Saves,
Passes accurate, Passes %.

**Eventos** (timeline): Normal Goal, Own Goal, Penalty, Missed Penalty, Yellow Card,
Red Card, Second Yellow, Goal cancelled / Goal confirmed, Penalty cancelled / Penalty
confirmed, Substitution (`Startelf`/banco).

---

## 4. Modelo de dados inferido (contratos que o client valida)

### 4.1 Predição (`/api/predictions`)

```ts
type Prediction = {
  runId: string                 // uuid por execução
  phase: "early" | "final"      // análise inicial vs refresh final
  status: "no_bet" | ...        // abstenção explícita
  guidanceStatus:
    | "optimal" | "risky"
    | "recommended_preliminary" | "recommended_confirmed"
  displayPick:   { type/marketType, pick, confidence(0-100), odds } | null
  recommendedBets: { type, pick, confidence, odds }[]     // candidatos
  oddsBandPicks:   { ... }[]                              // 1 pick por faixa de odd
  analysis: string                                        // texto do "Match insight"
  factors:  string[]                                      // "What to watch" (máx. 4)
  modelMeta: {
    presentationVersion: "coherent-bands-v1"
    narrativeVersion:    "match-context-v2"
  }
  isPremium: boolean
}
// resposta também traz: runId, trackedBet, warning, isPremium, errorCode
// errorCode conhecido: PREDICTION_DATA_INSUFFICIENT, PREDICTION_NOT_READY
```

**Copy oficial dos estados** (i18n en):
- `recommended_preliminary` → *"Preliminary Recommended pick"* / *"It is currently in
  Recommended picks, but this is an early analysis and it may change with the final refresh."*
- `recommended_confirmed` → pick recomendado confirmado após refresh final.
- `risky` → *"Risky prediction"* / *"Higher-risk prediction"*.
- suspensão → *"Prediction suspended: the match situation has changed."* / *"Odds are
  temporarily suspended."*
- expiração → *"This analysis has expired. Update it for a new prediction."* + *"Next update in"*.
- dado insuficiente → *"Insufficient data for prediction"*.

### 4.2 Predição ao vivo (`/api/predictions/live`)

```ts
type LiveResponse = {
  status: "idle" | "ready" | "pending" | "unavailable" | "superseded"
  retryAt?: number
  prediction?: {
    pick: { selection: string, odds: number }     // odds > 1
    generatedAt, refreshAt (> generatedAt), oddsAt, snapshotAt: number
    minute, score: { home, away }
    stateKey: string        // chave do estado do jogo → dedupe (não repete pick igual)
    explanation: Record<locale, string>
    assessment: { status: "checked" | "risky", reasons: string[] }
  }
}
```
Regras duras no client: `refreshAt > generatedAt`; `assessment.checked` **não pode** ter
`reasons`; `superseded` = o estado do jogo mudou e o pick anterior foi aposentado.

### 4.3 Bilhete / "winning slips"

```ts
type Slip = {
  id: string
  difficulty: "easy" | "medium" | "system"
  generatedAt, settledAt, firstKickoff: string
  policyVersion: string
  successProbability: number (0-1)
  bookmakerId, bookmakerName          // visto: "Pinnacle", "Bet365"
  totalOdds: number
  legs: Leg[]
  systemSelection?: SystemSelection   // só no "system"
}
type Leg = {
  fixtureId, leagueId, homeTeamId, awayTeamId: number
  runId, homeTeam, awayTeam, marketType, pick: string
  kickoff, generatedAt: string
  odds: number (1.01–20)
  probability: number (0–1)
  expectedValue: number (-1..20)
  bookmakerId, bookmakerName
  outcome?: "pending" | "won" | "lost" | "void"
  score?: string
}
```

### 4.4 Track record (contrato de proveniência)

```
scope:            "published_recommended_picks"
provenance.mode:  "historical_eligible_baseline_plus_live_publications"
outcomeBlindBaseline: true
baseline.cohortId:    "recommended-v23-top-leagues-baseline-2026-08-23"
baseline.policyVersion:"v1-latest-final-refresh-rounded-min70-odds120-six-hours-60-days"
   → última versão final, odd arredondada, confiança mín. 70%, odd mín. 1.20,
     snapshot 6h antes do kickoff, janela de 60 dias
baseline.total: 32   (coorte histórica congelada)
live.total:    683   (ledger de publicações ao vivo)
summary: { settled, won, lost, void, hitRate }
revisionPolicy: "latest_recommended_run_per_fixture"
oddsBandTrackRecord.engineVersion: "v2.4-ev-odds-bands"
oddsBandTrackRecord.scope: "latest_official_pick_per_fixture_and_band"
stakeConvention: "one_unit_flat_stake"
```
Números reais capturados (24/11, janela 60 dias, 713 liquidados, 14 ligas, hit 49,4%):

| faixa | jogos | acerto | Wilson 95% | ROI | unidades | EV médio | **CLV médio** | **CLV+ %** | Brier |
|---|---|---|---|---|---|---|---|---|---|
| 1.05–1.46 | 1017 | 76,6% | 73,9–79,1% | +2,0% | +20,52 | −0,20% | 0,72% | 13,7% | 0,177 |
| 1.46–1.90 | 2054 | 57,1% | 54,9–59,2% | −3,1% | −64,19 | +1,48% | 0,71% | 13,7% | 0,243 |
| 1.90+ | 4618 | 36,4% | 35,0–37,8% | −4,1% | −189,03 | +3,41% | 0,59% | 12,3% | 0,226 |

Bônus de honestidade: o endpoint expõe um bloco `coverage` dizendo que **não** dá para
calcular taxa de abstenção: *"The public publication ledger does not contain the full
candidate cohort."* Ou seja: ele publica o que **não** consegue provar.

---

## 5. O motor AURA — tudo o que conseguimos extrair

### 5.1 Versões do modelo (metadados no bundle)

| Chave | Valor | O que indica |
|---|---|---|
| `matchday-probability-v2` | constante exportada | modelo de probabilidade por rodada |
| `modelMeta.presentationVersion` | `coherent-bands-v1` | as probabilidades são exibidas em **bandas coerentes** (faixas que não se contradizem entre mercados) |
| `narrativeVersion` | `match-context-v2` | texto de análise gerado a partir de contexto do jogo |
| `engineVersion` | `v2.4-ev-odds-bands` | engine de recomendação é **EV + faixas de odd** |
| `cohortId` | `recommended-v23-…` | 23ª iteração do motor de recomendação |
| `policyVersion` | `…-min70-odds120-six-hours-60-days` | filtro: conf ≥ 70, odd ≥ 1.20, snapshot 6h, janela 60 dias |
| cache de predição | `9e5` ms = 15 min | TTL do pick |
| `openai-*` | presente no bundle | há uso de LLM para narrativa/chat |

Não existe código de modelo no client: **toda a probabilidade vem do servidor**. Não
conseguimos (e não é possível sem login) ver o cálculo. O que dá para afirmar com prova é o
**pós-processamento**: ranking, bandas, estados e publicação.

### 5.2 Faixas de odd (oddsBandPicks)

O bloco de jogo mostra **um pick por faixa** — baixa/média/alta — cada um com sua própria
confiança e odd, e o track record é publicado separado por essas faixas. É a resposta ao
problema "pick de 1.20 com 90% não é a mesma coisa que pick de 3.5 com 40%".

### 5.3 Função de ranking do pick (código exato, `eP`)

Este é o coração da escolha "qual dos candidatos é o pick principal":

```js
function rankPick(b) {
  const p = b.confidence / 100;
  const o = b.odds ?? 0;
  if (!(o > 1)) return p;

  // penalidade de diversificação: evitar sempre o mesmo over/under curto
  const divPenalty =
    b.type.toLowerCase().includes("over/under") &&
    /over\s*1\.5|under\s*3\.5|under\s*4\.5/i.test(b.pick)
      ? (o < 1.32 ? 0.065 : o < 1.45 ? 0.045 : 0.025)
      : 0;

  const t = b.type.toLowerCase();

  return p
    + 0.75 * clamp(p - 1 / o, -0.10, 0.16)      // EV vs prob. implícita  (peso maior)
    + 0.30 * clamp(p * o - 1, -0.12, 0.28)      // EV bruto (edge × odd)
    + (t.includes("double chance")            ? 0.045
     : t.includes("multi") || t.includes("total goals") ? 0.035
     : t.includes("btts") || t.includes("both teams score") ? 0.03
     : 0)                                        // prior por tipo de mercado
    - (o < 1.38 ? (1.38 - o) * 0.55 : 0)         // castigo a odd muito curta
    - divPenalty;
}
```

E a seleção do principal entre os candidatos:

```js
const cands = bets.filter(b => b.confidence >= 70);
const pool  = cands.length ? cands : bets;      // se ninguém passa de 70, usa todos
const primary = [...pool].sort((a, b) => rankPick(b) - rankPick(a))[0];
const others  = bets.filter(b => b !== primary);
// se guidanceStatus === "risky" → primary = displayPick e others = []
```

Ou seja: **não escolhe o de maior confiança**, escolhe o de maior score
(probabilidade + EV + prior de mercado − penalidades). Um `Under 1.5 @1.20` com 90% perde
para um `BTTS Yes @1.90` com 62%.

### 5.4 Bilhetes: easy / medium / system 8/10 (`module 44691` + `67562` + `76715`)

```js
const SLIP_PARAMS = {
  easy:   { legs: 4,  minOdds: 3.5, maxOdds: 5  },   // odd total 3.5–5.0
  medium: { legs: 6,  minOdds: 8,   maxOdds: 12 },   // odd total 8–12
  system: { legs: 10, minOdds: null, maxOdds: null } // sistema 8 de 10
};
const SLIP_TTL = 9e5;                    // 15 min
const SLIP_LEAGUES = [
  { id: 135, name: "Serie A" }, { id: 136, name: "Serie B" },
  { id: 140, name: "LaLiga" }, { id: 61,  name: "Ligue 1" },
  { id: 39,  name: "Premier League" }, { id: 78, name: "Bundesliga" },
  { id: 88,  name: "Eredivisie" }
];

// sistema 8/10: orçamento fixo de 10 € e meta de 40 € brutos
const SYSTEM = { budgetCents: 1000, targetGrossCents: 4000 };

// validação do resultado do sistema:
function systemOk(r) {
  return r.budgetCents === 1000
      && r.lineCount === 45                                  // C(10,8) = 45 linhas
      && r.scenarios[0].minGrossCents >= 4000                 // pior cenário ainda ≥ 40 €
      && r.scenarios[2].minNetCents    >= -10                 // cenário de estresse ≥ −0,10 €
      && r.lines.filter(l => l.grossCents <= r.totalStakedCents).length <= 5; // ≤5 linhas abaixo do custo
}
```

Matemática do sistema (pura, extraída):

- `lines = C(10, 8) = 45` combinações de 8 entre as 10 pernas.
- `perLineCents = floor(budget / 45)`, `totalStaked = perLine * 45`, `unallocated = resto`.
- `probabilityOfReturn` = `P(X ≥ 8)` com `X ~ Binomial(n=10, p_i)` via convolução
  (distribuição de Poisson-binomial — probabilidades heterogêneas por perna).
- `probabilityOfProfit` = `min(1, Σ p_i)` das combinações cujo retorno > stake total.
- `expectedNetCents` = `Σ gross(linha) × Π p_i(linha) − totalStaked`.
- `scenarios` = 3 cenários de estresse (`[0,1,2]` pernas erradas), cada um com
  `min/maxGrossCents` e `min/maxNetCents`, calculados removendo as linhas que contêm
  as pernas erradas.
- Regra de escolha de estratégia: `strategy ∈ {"adaptive-weekend-v1",
  "minimum-return-weekend-v1"}` + `searchLimited`, `evaluatedCombinations`,
  `stressReduction`, `targetMet`.

Bilhete vencedor real capturado (`easy`, 4 pernas, odd total 3,68, bookmaker **Bet365**):

| jogo | mercado | pick | odd | resultado |
|---|---|---|---|---|
| Racing Santander × Real Sociedad | Over/Under | Over 2.5 | 1.44 | won (3-2) |
| Osasuna × Malaga | Over/Under | Under 3.5 | 1.33 | won (1-0) |
| Getafe × Atlético Madrid | Double Chance | 12 | 1.28 | won (0-3) |
| Levante × Elche | Over/Under | Under 3.5 | 1.50 | won (1-1) |

Note a **diversificação por mercado** dentro do bilhete e o uso de `Under 3.5` (não 2.5)
para manter a odd na faixa alvo sem perder probabilidade.

### 5.5 Copy de confiança (as três faixas)

| faixa | texto oficial (en) | intenção |
|---|---|---|
| alta | *"Stronger picks, more likely to become recommended."* | vai para Recommended |
| média | *"Good signals, but with more variance or less decisive data."* | informativo |
| baixa | *"Treat carefully: it is often better to wait or not follow the pick."* | desencoraja |

E o que o "Match insight" mostra: pick + `confidence` + `odds` + `factors` (≤ 4) +
`analysis`. Os fatores são: *"Recent form, home/away context, head-to-heads,
attacking/defensive trends and match situation."*

### 5.6 Planos

| plano | o que dá |
|---|---|
| **Free** | conta gratuita, **1 predição completa a cada 3 dias**, dados ao vivo, favoritos |
| **Pro** | predições sem limite + análise profunda, **cobertura por quantidade de ligas** ("Choose the plan that matches the coverage you need") + bilhetes completos |
| **Ultra** | tudo do Pro + **AURA Live** (predição in-play) + **AURA Chat** (análise dedicada às suas perguntas); exige e-mail verificado |

O `featured` (pick grátis do dia) é um pick curado publicado mesmo sem conta:
`{featured, isFreeDay, nextFreeDay}` — cadência "every 3 days" com contador
(*"Next free prediction in 3 days"*).

---

## 6. Matriz de paridade — SportPicker (futebol) × GreenScore

Legenda: ✅ temos equivalente · 🟡 temos parcial / lógica diferente · ❌ não temos.

### 6.1 O que já temos (não precisa copiar)

| Função do SportPicker | Status | Onde está no nosso projeto |
|---|---|---|
| Placar ao vivo, jogos do dia, trilha de datas, próximos/resultados | ✅ | `/jogos`, `/ao-vivo`, `DateStrip`, `DateStrip7`, `src/lib/espn.ts` |
| Lista de ligas + classificação | ✅ | `/ligas`, `/hub/classificacao`, `api/standings` |
| Página de jogo com estatística + escalação + H2H + forma | ✅ | `/jogos/[id]`, `components/Lineup.tsx`, `H2HPalpiteCard`, `Last10` |
| Times e jogadores | ✅ | `/times/[id]`, `/jogadores`, `api/teams`, `api/players` |
| Modelo próprio de probabilidade 1X2 (Poisson, xG no λ, peso de recência) | ✅ | `src/lib/model.ts`, `engine.ts`, `winProb.ts` |
| Mercados derivados do modelo | ✅ | `mercadosPoisson.ts` (1X2, O/U, BTTS, escanteios, cartões, clean sheet) |
| EV e odd justa com remoção de overround | ✅ | `valueBet.ts` (`margemMercado`, odd justa) — **âncora Pinnacle** |
| Ranking/score de oportunidades com filtros | ✅ | `oportunidadeFiltros.ts` (chips elite / alto EV / favoritos / bombas), `/detector` |
| Track record público imutável, green/red, ROI, unidades | ✅ | `/desempenho`, `credibility.ts`, `trackRecord.ts`, `trackStats.ts`, `api/track-record` |
| Intervalo de Wilson + Brier no histórico | ✅ | `credibility.ts` (`wilson`), `engine.ts` (brier + baseline 0,667) |
| Combinada com EV por perna + guarda de correlação | ✅ | `comboBuilder.ts` (3 perfis, `motivoCorrelacao`), `api/combos` |
| Probabilidade ao vivo com série/minuto | ✅ | `winProb.ts` + `serieWinProb` + `WinProbChart` |
| Alertas de gol/kickoff por push | ✅ | `alertDiff.ts`, `api/cron/live`, `push.ts` |
| Trial/quota/assinatura | ✅ | `trialPolicy.ts`, `quota.ts`, `stripe*` |
| PWA + push web | ✅ | `InstallApp.tsx`, `app/manifest`, `api/push/*` |
| Favoritos | ✅ | `/favoritos`, `api/favorites` |
| Notícias | ✅ | `/noticias`, `api/news` |
| Metodologia e jogo responsável | ✅ | `/metodologia`, `/jogo-responsavel` |
| Cascata de provedores com degradação honesta | ✅ | `src/lib/hub/cascade.ts` |
| **Player props (6 mercados)** | ✅ **só nós** | `playerPropsEngine.ts`, `api/gameread/props-radar` — **SportPicker não tem** |
| **Árbitros, duelos, momentum, bloco de análises** | ✅ **só nós** | `/arbitros`, `duelosEngine.ts`, `blocoAnalises.ts` |

### 6.2 Parcial / mesma ideia com lógica diferente

| Tema | SportPicker | GreenScore | Comentário |
|---|---|---|---|
| Acesso grátis | 1 predição completa **a cada 3 dias** + pick curado do dia + Pro/Ultra | trial 24h + **1 análise/dia** + Stripe em standby | Cadências diferentes; eles usam o grátis como funil de retenção |
| Bilhete | `easy` 4 pernas (odd total 3,5–5), `medium` 6 pernas (8–12), `system` 10 pernas | `Seguro`, `Equilibrado`, `Ousado` por perfil | Nossa lógica é por risco, a deles por **faixa de odd total** — mais fácil de prometer retorno |
| Track record | por **faixa de odd** + CLV + coorte de proveniência | global, por mercado, com Wilson e Brier | Eles respondem "em qual faixa eu ganho"; nós ainda não |
| Mercado de odds | só 1 casa por bilhete (Bet365/Pinnacle), EV contra essa odd | **só Pinnacle** como âncora, EV oculto sem ela | Nossa regra é mais rígida e mais honesta |
| Estatística de jogo | API-Football (passes %, big chances) | ESPN (posse, chutes, escanteios, cartões) | Granularidade levemente maior neles |
| Multi-esporte | 12 esportes com rotas próprias + schema `sports-v1` | futebol completo + NBA/tênis parcial em `/supertips` | — |
| SEO | hub educacional em 6 idiomas (`/odds`, `/predictions`, `/guides`, `/faq`, `/ai-accuracy`, `/about`, `/league/*`, `/sport/*`) | `/metodologia` + páginas por liga, PT | Eles ranqueiam em 6 línguas; nós num idioma |
| Notificações | opt-in por **tipo de conteúdo** (`content-preferences`) | opt-in por alerta de gol/kickoff | — |
| Sitemap | 1.719 URLs por locale (inclui `/sport/*` e `/league/*`) | sitemap com jogos/ligas/times | Eles apostam em páginas de esporte/competição |

### 6.3 O que **NÃO** temos — o que é realmente novo

Em ordem de valor percebido pelo usuário cético (o que ele mostra como prova):

1. **CLV (closing line value)** — *"a odd fechou melhor ou pior do que a que publicamos?"*
   Eles calculam por pick e por faixa (`averageClvPct`, `positiveClvRate`, `clvSamples`).
   É a única métrica que prova habilidade antes do resultado. **Não temos nada disso.**
2. **Track record por faixa de odd (3 bandas)** com acerto + Wilson + ROI + unidades +
   Brier + EV médio **por faixa**. Hoje mostramos o agregado; `supertips.ts:544`
   até declara que omitimos "vitória por faixa de odd" por falta de histórico de cotação —
   mas o hub **já grava `hub_bookmaker_odd`**, então o dado para fazer existe.
3. **`oddsBandPicks` na página do jogo** — um pick por faixa (baixa/média/alta), cada um
   com confiança e odd. Transforma 1 resposta em 3 e resolve "quero odd 1.30" vs
   "quero odd 2.50" sem o usuário pedir em outra tela.
4. **Live prediction com protocolo** — `stateKey` (dedupe por estado do jogo),
   `refreshAt`, `superseded` (pick anterior aposentado quando o jogo muda),
   `assessment {checked|risky, reasons}` e `explanation` por locale. Nosso `winProb` dá
   probabilidade, não um pick com ciclo de vida.
5. **Ciclo de vida do pick publicado** — `early` → `final` (refresh) →
   `recommended_preliminary` → `recommended_confirmed` → `suspended` (odd suspensa /
   situação mudou) → `expired` (TTL) → `no_bet`. Com copy pronta e TTL de 15 min.
   **Nós não temos `no_bet` em lugar nenhum.**
6. **Política de publicação como contrato versionado** — `min70-odds120-six-hours-60-days`
   + `cohortId` + `outcomeBlindBaseline: true` + ledger de publicações. É a defesa contra
   "você escolheu a dedo os acertos". Nossa imutabilidade é boa, mas não declaramos coorte
   nem política.
7. **Bilhete sistema 8/10 com matemática completa** — C(10,8)=45 linhas, orçamento €10,
   meta €40 brutos, `probabilityOfProfit` por Poisson-binomial, 3 cenários de estresse
   (pior caso ≥ meta, estresse ≥ −€0,10, ≤5 linhas abaixo do custo), `expectedNetCents`.
   É um produto inteiro que não temos.
8. **Winning slips público** (`/api/predictions/slates/winners`) — lista de bilhetes
   liquidados com pernas, odds, bookmaker e placar. Prova social auditável.
9. **AURA Chat por jogo** — conversa contextual (Ultra). Não temos chat nenhum.
10. **Featured pick do dia + `isFreeDay`/`nextFreeDay`** — o grátis é um ativo de
    aquisição com contador, não um limite. Bom para SEO e para converter sem paywall.
11. **Votação "quem vence?" + leaderboard público** (`/api/votes`) — engajamento e
    retorno diário, com username. Zero custo de modelo. Não temos.
12. **Função de ranking por score** (EV + prior de mercado + castigo a odd curta +
    penalidade de repetição de over/under). É uma alternativa direta ao nosso
    `calcularScoreFinal` — vale comparar A/B.
13. **Faixas de confiança com copy de desencorajamento** ("treat carefully: it is often
    better to wait or not follow the pick") + `optimal`/`risky` na UI.
14. **Página de educação de odds** — decimal → prob. implícita → overround → prob. justa
    → comparação com o modelo. Nós temos a matemática em `valueBet.ts`, mas não a página.
15. **i18n com 6 locales + hreflang** — nós somos PT-BR only.
16. **Busca global** (time, jogador, competição) — não temos.
17. **Contrato de API versionado** com header (`X-SportPicker-Schema: sports-v1`) e 502 em
    schema inesperado; store de predições versionado (`version: 2` + `migrate`).
18. **Catálogo multi-esporte unificado** (`/api/sports/v1`) com 12 esportes.
19. **`/delete-account`** — exclusão de conta em página própria (conformidade).
20. **Baseline externo de graça** — o proxy `/api/football/predictions` dá o modelo do
    API-Football para qualquer jogo. Serve como **benchmark** do nosso modelo (comparar
    Brier nosso vs deles) sem custo.

---

## 7. O que **eles não têm** (nossa vantagem atual)

Vale registrar para não "copiar para trás":

- **Player props** por jogador (6 mercados) — nós temos engine própria.
- **Árbitros** com histórico e perfil de cartões — nós temos `/arbitros`.
- **Duelos / momentum / bloco de análises** por jogo — nós temos engines dedicadas.
- **Regra dura de EV só com Pinnacle** — eles publicam EV contra Bet365 também, o que
  infla EV. Nossa regra é melhor e é diferencial de credibilidade.
- **Guarda de correlação no bilhete** — eles só diversificam por mercado; nós bloqueamos
  perna correlacionada (BTTS + Over no mesmo jogo).
- **Track record com stake Half-Kelly em % de banca** — a nossa unidade é mais sofisticada
  que o `one_unit_flat_stake` deles.
- **Cascata multi-provedor** — eles dependem de um provedor só (API-Football).

---

## 8. Ordem sugerida (se e quando formos implementar)

Somente depois de decidir; nada foi alterado.

1. **CLV** — precisa gravar a odd de fechamento por pick (snapshot antes do kickoff).
   Sem CLV não existe prova de habilidade. Primeiro item, e o mais barato dos grandes.
2. **Track record por faixa de odd** — só agregação em cima do que já liquidamos
   (`trackStats.ts` + `credibility.ts` + `hub_bookmaker_odd`).
3. **Ciclo de vida do pick + `no_bet`** — estados versionados no pick salvo, TTL,
   `suspended`, `expired`. Melhora honestidade e evita pick velho na tela.
4. **`oddsBandPicks`** — reaproveita `mercadosPoisson` + `valueBet`; uma linha de odd por
   banda.
5. **Sistema 8/10** — matemática pura, testável, encaixa em `comboBuilder` como 4º perfil.
6. **Winning slips público** — consequência direta de (5).
7. **Live pick com `stateKey`/`superseded`** — em cima de `winProb` + `alertDiff` (o
   `stateKey` já existe de fato no dedupe de alertas).
8. **Votação + leaderboard** — engajamento barato, sem tocar no modelo.
9. **Página de educação de odds** — reaproveita `valueBet.margemMercado`.
10. **AURA Chat** — por último: é o item mais caro e o menos verificável.

---

## 9. Limites deste recon (o que não foi provado)

- **O cálculo das probabilidades do AURA é server-side.** Não vimos modelo, features nem
  treino. Tudo em §5 é pós-processamento, política e matemática de bilhete — não o modelo.
- **`/api/predictions`, `/live`, `/recommended`, `/slates` exigem login** (401). Não criamos
  conta. O conteúdo do bloco de jogo foi reconstruído pelo bundle + i18n + validadores.
- **Não houve engenharia reversa de binário** (o app é PWA, não APK próprio); o
  repositório `morluto/rea` foi consultado como referência de método, nada mais.
- Copy citada é literal do i18n do site (en/it/es/de/fr).
- Uso do proxy `/api/football/*` em produção **não é recomendado**: é endpoint de terceiro,
  sem SLA e fora dos termos da api-sports.
