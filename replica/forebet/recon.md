# Recon — forebet.com (Forebet)

> Clean-room recon do **Forebet**, app de previsões de futebol por estatística.
>
> **Nota de fonte:** o site está atrás do desafio Cloudflare ("Just a moment…")
> e não há navegador headless disponível neste ambiente, então **não** consegui
> buscar as páginas públicas diretamente. Este mapa é baseado no conhecimento
> público do produto (formato amplamente conhecido) e em como o app é usado.
> **Confirmar com 2–3 capturas de tela do celular do usuário** (home/tabela,
> página de partida, classificação) antes de tratar como definitivo.
>
> Regras: nada de bundle JS, nada de API privada, nada de scraper em loop.

## 1. Escopo

- **App:** Forebet — previsões de futebol e outros esportes com probabilidades.
- **Plataforma:** Web (desktop e mobile) + apps.
- **Fatia do MVP:** o core loop — **tabela de palpites do dia** com
  probabilidade 1X2, resultado/placar previsto, média de gols e Over 2.5.
- **Para quem:** versão própria no MoneyScorer, validar o formato "tabela densa".

## 2. Fontes (o que se sabe publicamente)

| fonte | o que dá |
| --- | --- |
| home (tabela) | formato das colunas, filtros por data/liga |
| página da partida | probabilidades detalhadas, placar exato, H2H, forma |
| classificações | contexto de tabela por liga |
| estatísticas / tendências | recortes de acerto e séries |
| blog / guias | aquisição orgânica |

## 3. Inventário de telas (a confirmar com screenshots)

| ID | tela | rota (aprox.) | propósito | componentes | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Palpites de hoje (tabela) | `/` | tabela densa de jogos com 1X2 %, placar previsto, média de gols, odd | tabela, filtro país/liga, abas de data | cheio, vazio |
| S02 | Detalhe da partida | `/…/match…` | probabilidades completas, placar exato, H2H, forma | barras de prob, matriz placar, H2H | pre/live/post |
| S03 | Classificações | `/standings` | tabelas por liga | tabela | — |
| S04 | Estatísticas / tendências | `/statistics` `/trends` | séries, acerto por mercado | gráficos/tabelas | — |
| S05 | Top predictions / VIP | `/top` | seleção de maior confiança | lista | free/VIP |
| S06 | Ao vivo | `/livescores` | placares em tempo real | lista ao vivo | live |
| S07 | Blog/guia | `/blog` | SEO | posts | — |
| S08 | Conta/preços | `/pricing` | plano VIP | cards | — |

## 4. Fluxos

```
F01  Ver previsões do dia
     S01 tabela -> (S02 detalhe de um jogo)
     edge: dia sem jogos; jogo ao vivo/encerrado

F02  Filtrar por liga/país
     S01 -> filtro -> S01 recarregada

F03  Conferir placar previsto e odd
     S01 -> S02 (matriz de placar, H2H, forma)

F04  Assinante vê "top predictions"/VIP
     S05 -> S08 pricing
```

## 5. Componentes

- **PredictionTable** — colunas: hora, liga, times, 1/X/2 %, placar previsto, média de gols, odd/coef.
- **ProbCell** — célula de probabilidade com o previsto destacado.
- **CorrectScoreCell** — placar exato mais provável.
- **DateTabs** — ontem/hoje/amanhã e por data.
- **LeagueFilter** — país/liga.
- **FormBadges** — forma recente (V/E/D).
- **ScoreMatrix** — distribuição de placares (na partida).
- **H2HTable** — últimos confrontos.
- **VIPBadge** — trava de plano.

## 6. Modelo de dados inferido

```
Match       id, league, country, kickoff, home, away, state, score
            confidence: high
Pronostico  match_id, p_home, p_draw, p_away, predicted_score (x-y),
            avg_goals (λ_home+λ_away), p_over25, form_home, form_away
            evidence: S01/S02      confidence: high
Standing    league, team, pos, pts, j, v, e, d, gp, gc   confidence: high
Histórico   team/league, última posição, forma            confidence: medium
```

## 7. Matriz de features

Ver `features.csv`.

## 8. O que não se clona

- **skip** — histórico proprietário e "acerto" do Forebet (é deles).
- **skip** — conteúdo de blog/guia (reescrever do zero).
- **skip** — marca, logo, copy (ver /replica-brand).
- **skip** — odds de casas parceiras licenciadas (usar nossa fonte/API).

## 9. Dimensionamento

Screens: 8 · Flows: 4 · Entidades: 3.
Difíceis: dados/odds em tempo real (já temos via ESPN/API-Football), placar
exato (Poisson já entrega `topScores`), classificações (já temos /standings).

**Tamanho: S** — o MoneyScorer já tem motor, data layer e standings.

## 10. MVP entregue

`src/app/forebet/page.tsx` — tabela de palpites (1X2 %, placar previsto, média
de gols, Over 2.5) por data, reusando `analisarOportunidades` (que devolve
`topScores`). Próximo: screenshots para refinar layout/colunas e depois
`/replica-architect` para standings/tendências.
