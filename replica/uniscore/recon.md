# Recon map: Uniscore (web/PWA, https://uniscore.com/amp/pt-BR)

Scope: **fatia central** — placar ao vivo por liga, detalhe da partida (6 abas) e o
que ele abre (escalações, CD/H2H, dados, classificação, previsão IA, odds).
For: versão própria (produto novo, marca nova), reaproveitando os mesmos padrões de UX.
Date: 2026-02-19

> Recon clean-room: funcionalidade e fluxo, nada do que o app possui. Nenhum bundle
> JS lido, nenhuma API privada, nenhuma conta acessada, nenhum crawler. Páginas
> públicas lidas em ritmo humano (4 páginas + `robots.txt`).

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | `robots.txt` | `/robots.txt` | Disallow para crawler genérico: `/standings/`, `/draw/`, `/match/`, `/newsfeed/`, `/news`, `/tips`, `/demos/`, `/dev/`. Googlebot liberado. |
| 2 | Home AMP (PT-BR) | `/amp/pt-BR` | lista do dia ("Futebol hoje"), "Ligas populares", "Times", 20+ partidas linkadas, footer completo, texto SEO que descreve o produto |
| 3 | Detalhe da partida AMP | `/amp/pt-BR/football/match/atalanta-inter/hesv5yldtko5whu` | abas: **Detalhes · Escalações · Previsão IA · CD · Dados · Classificações**; cabeçalho com times, hora, liga, rodada |
| 4 | Resultados (SEO) | `/amp/pt-BR/football/results` | descreve recursos: placar final, posse, escanteios/arremessos, artilheiros/assistências, cartões, vídeos de destaque, comentários pós-jogo |
| 5 | Calendário (SEO) | `/amp/pt-BR/football/fixtures` | calendário com antecedência, escalação esperada, estádio, árbitro, grade de TV (VTV/K+/FPT...) |
| 6 | Texto SEO da home | — | "notificação sonora sempre que ocorre um gol", tabela de odds **asiática, europeia, Over/Under**, atualização automática sem F5 |
| 7 | Repo `morluto/rea` (REA) | `github.com/morluto/rea` | kit MCP de engenharia reversa (binários, desktop, AgentEnv de web app). Usado como **método** aqui (rotear alvo → evidência → resumo primeiro); não instalamos o MCP neste Termux. |

Rotas descobertas (padrão): `/amp/<locale>/<sport>/{results,fixtures,match/<timeA>-<timeB>/<id>,competitor/<slug>/<id>,competition/<slug>/<id>}`
· esportes: `football`, `tennis`, `basketball`, `badminton` · estáticas: `about`, `contact`,
`recruitment/354`, `privacy-policy/344`, `terms-of-service/261`.

**Limite honesto desta etapa:** as páginas AMP entregam a casca (abas, cabeçalho, listas);
o conteúdo de cada aba é montado por JS/AMP dinâmico no cliente. Então o inventário de
recursos abaixo vem de 3 evidências cruzadas: rótulos de aba visíveis, texto público do
produto e o app instalado no seu celular. Onde não havia evidência, escrevi "guess".

## Core loop

Abrir o app → ver os placares de hoje agrupados por liga → tocar num jogo → ler o detalhe
(placar, dados, escalações, H2H, previsão e odds) sem sair da mesma tela de abas.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Home — jogos de hoje | `/amp/pt-BR` | placares do dia por liga | seletor de data, grupo de liga (título + seta), linha de partida (hora/placar, escudos, time, badge de minuto), "Ligas populares", "Times" | cheio, sem jogos hoje, ao vivo |
| S02 | Resultados | `/football/results` | jogos encerrados | mesma lista, filtro "encerrados", blocos SEO por competição | cheio, vazio |
| S03 | Calendário / fixtures | `/football/fixtures` | próximos jogos (hoje+amanhã) | lista por data, hora, competição, indicação de TV | cheio, vazio |
| S04 | Detalhe da partida | `/football/match/<a>-<b>/<id>` | tudo do jogo em abas | header (escudos, placar/hora, liga+rodada, estado), **tab bar de 6**, painel por aba, CTA "detalhes" | pré-jogo, ao vivo, intervalo, encerrado, prorrogação |
| S05 | Aba Detalhes | S04 → aba 1 | linha do tempo e resumo | timeline (gol, cartão, substituição, VAR), placar por tempo, estatísticas resumidas | sem eventos, com eventos |
| S06 | Aba Escalações | S04 → aba 2 | XI das duas equipes | campo/lista, formação, número, nome, banco, desfalques | confirmada, provável, indisponível |
| S07 | Aba Previsão IA | S04 → aba 3 | prognóstico do modelo | barras de probabilidade 1X2 / Over-Under / BTTS, texto do modelo, selo de confiança | com previsão, sem base |
| S08 | Aba CD (confrontos diretos) | S04 → aba 4 | H2H | lista de confrontos anteriores (data, competição, placar), agregado vitórias/empates | com histórico, sem histórico |
| S09 | Aba Dados | S04 → aba 5 | estatísticas completas | barras comparativas (posse, finalizações, no alvo, escanteios, arremessos, faltas, cartões), xG quando existe | pré-jogo, ao vivo, encerrado, sem dados |
| S10 | Aba Classificações | S04 → aba 6 | tabela da competição no contexto do jogo | tabela (pos, time, J, V, E, D, GP, GC, SG, P), destaque dos dois times | cheio, competição sem tabela (copa) |
| S11 | Competição | `/football/competition/<slug>/<id>` | jogos + tabela + artilharia de uma liga | header da liga, abas/seções, tabela, lista de jogos | em temporada, fora de temporada |
| S12 | Time (competitor) | `/football/competitor/<slug>/<id>` | ficha do time | header (escudo, nome), próximos jogos, últimos resultados, elenco, posição | com dados, time sem dados |
| S13 | Outros esportes | `/tennis`, `/basketball`, `/badminton` | mesmo padrão de lista | lista por competição, detalhe com abas equivalentes | cheio, vazio |
| S14 | Institucional | `/about`, `/contact`, `/recruitment`, `/privacy-policy`, `/terms-of-service`, `/cookie-policy` | legal e institucional | texto, contato | — |
| S15 | Odds do jogo | dentro de S04/S05 (tabela de odds) | comparação de mercados | tabela asiática/europeia/Over-Under, odd de abertura vs atual (guess: variação) | com odds, sem odds |
| S16 | Destaques / vídeos | S02/S04 pós-jogo | melhores momentos | player/card de vídeo | com vídeo, sem vídeo |
| S17 | Onde assistir | S03/S04 | grade de TV por país | lista de canais | com grade, sem grade |
| S18 | Alertas (gol / som) | configuração no app | avisar gol com som | toggle de notificação, permissão do navegador | ativo, negado |

## Flows

```
F01 Ver placar de hoje e abrir um jogo
    S01 -> S04
    happy path clicks: 1
    edge: nenhum jogo hoje · jogo ao vivo mudando de minuto · liga sem jogos · internet caindo no meio

F02 Ler o detalhe completo de uma partida
    S04 -> S05 -> S09 -> S08 -> S06 -> S10
    happy path clicks: 5 (uma por aba)
    edge: jogo sem eventos ainda · escalação não publicada · competição sem tabela (mata-mata) · sem H2H

F03 Consultar a previsão do modelo
    S04 -> S07
    edge: jogo sem base histórica (mostrar "sem dados" em vez de número)

F04 Ver odds de um jogo
    S04 -> S15
    edge: casa não cotou · odds congeladas antes do jogo · mercado asiático sem linha

F05 Ver o calendário de amanhã
    S01 -> S03
    edge: fuso do usuário · jogo adiado · horário ainda não confirmado

F06 Acompanhar um time
    S01 -> S12 -> S04
    edge: time sem jogos futuros · página de time com nome duplicado

F07 Ver a classificação de uma liga
    S01 -> S11 -> S10
    edge: liga em pré-temporada · empate em pontos (critério de desempate)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| MatchRow | compacta (lista), com placar, com hora, ao vivo | normal, ao vivo (minuto piscando), encerrado, adiado, selecionado | S01 S02 S03 S11 S12 |
| ScoreBadge | hora, placar, "INT", "ADI" | aguardando, ao vivo, intervalo, encerrado | todas as listas |
| LeagueGroup | aberto, colapsado, com contagem | default, vazio | S01 S02 S03 |
| DateSelector | hoje/amanhã, faixa de dias, calendário | selecionado, sem jogos | S01 S02 S03 |
| SportsTabs | futebol, tênis, basquete, badminton | ativo, com badge ao vivo | S01 S02 S03 S13 |
| MatchHeader | pré-jogo, ao vivo, encerrado | placar, minuto, prorrogação, pênaltis | S04 |
| TabBar (6 abas) | fixa, rolável | ativa, desabilitada (sem dados) | S04 |
| TimelineEvent | gol, pênalti, contra, amarelo, vermelho, substituição, VAR | com placar parcial, com assistência | S05 |
| StatCompareBar | 2 lados, valor absoluto, percentual | normal, "sem dados", ao vivo | S09 |
| LineupPitch / LineupList | campo, lista, banco | confirmada, provável, ausente | S06 |
| StandingsTable | completa, resumida (5 ao redor do time) | normal, destaque do time, copa sem tabela | S10 S11 |
| H2HList | agregado + lista | com histórico, sem histórico | S08 |
| PredictionCard | barras + texto | com base, sem base | S07 |
| OddsTable | asiática, europeia, O/U | com odds, sem odds, linha fechada | S15 |
| Crest | 16/24/40px | carregando, fallback (iniciais) | todas |
| LiveTicker | minuto + pulsação | ao vivo, intervalo | S01 S04 |
| GoalAlertToggle | on/off + permissão | ativo, negado, não suportado | S18 |

## Inferred data model

```
Sport          id, slug, name
               evidence: rotas /tennis, /basketball, /badminton e footer "Esporte"
               confidence: high

Competition    id, slug, name, country, season, is_cup, logo
               evidence: /competition/premier-league/mfiws1aoh0uztg4 (slug + id na URL)
               confidence: high

Team           id, slug, name, short_name, crest_url
               evidence: /competitor/villarreal-cf/nkb1x23odwzse70, escudos na lista
               confidence: high

Fixture        id, slug (timeA-timeB), kickoff_utc, status (NS|1H|HT|2H|ET|PEN|FT|POSTP),
               minute, home_score, away_score, competition_id, round, venue, referee
               evidence: header do detalhe (hora, "Rodada 12", "Itália - Serie A"), estados "2D/3D" no card
               confidence: high

MatchEvent     fixture_id, minute, period, side, type (goal|pen|own|yellow|red|sub|var),
               player_id, assist_player_id, score_after
               evidence: aba Detalhes, texto público "artilheiros, assistências, cartões"
               confidence: high

MatchStat      fixture_id, side, possession, shots, shots_on_target, corners, throw_ins,
               fouls, yellow, red, offsides, xg
               evidence: aba Dados, texto público "posse, escanteios, arremessos, cartões"
               confidence: high

Lineup         fixture_id, team_id, formation, player_id, role (xi|bench), shirt_number, position
               evidence: aba Escalações; texto "escalação inicial esperada"
               confidence: high

Player         id, name, team_id, position, shirt_number, photo
               evidence: escalações, artilheiros/assistências
               confidence: medium-high

StandingRow    competition_id, team_id, position, played, wins, draws, losses, gf, ga, points, form
               evidence: aba Classificações, tabela de competição
               confidence: high

Prediction     fixture_id, model, p_home, p_draw, p_away, p_over25, p_btts, confidence, text
               evidence: aba "Previsão IA"
               confidence: medium (não vi o conteúdo renderizado)

Odds           fixture_id, market (asian|european|ou), line, selection, price, bookmaker, updated_at
               evidence: texto público "probabilidades asiática, europeia, Over/Abaixo"
               confidence: medium

Video          fixture_id, provider, url, duration, published_at
               evidence: texto público "vídeo de destaque pós-jogo"
               confidence: medium

Preview        fixture_id, author, body, published_at
               evidence: "comentários de especialistas após a partida"
               confidence: medium

TvBroadcast    fixture_id, channel, country
               evidence: "grade de TV: VTV3, K+, FPT Play"
               confidence: medium

User           id, locale, favorite_team_ids, goal_sound_enabled
               evidence: "Times" no footer + "notificação sonora de gol"
               confidence: guess
```

Relationships: `Sport 1-n Competition 1-n Fixture`; `Fixture n-n Team` (home/away);
`Fixture 1-n MatchEvent / MatchStat(2) / Lineup(2) / Odds / Prediction / Video / Preview / TvBroadcast`;
`Team 1-n Player`; `Competition 1-n StandingRow`.

## Feature matrix

See `features.csv`. 36 linhas — Must: 17, should: 9, could: 5, skip: 5.

## Out of scope (cannot or should not be cloned)

- **Feed de dados em tempo real licenciado** — é o produto deles; precisa de fornecedor próprio (API-Football, Sportmonks, ESPN...).
- **Vídeos de destaque** — direitos de transmissão/mídia; só com embed oficial e autorização.
- **Tabela de odds de várias casas** — depende de contrato/afiliação; sem licença não se exibe odd.
- **Grade de TV por país** — curadoria proprietária e muda toda semana.
- **Marca**: nome "Uniscore", logo, cores exatas e o texto SEO institucional (o texto é deles; o nosso tem que ser escrito do zero).
- **Base de usuários e histórico agregado** deles.

## Size

Screens 18 (11 de produto + 3 de esporte/estáticos + 4 de estado dentro do detalhe),
flows 7, entities 13. Partes difíceis: **feed ao vivo sem piscar** (polling/SSE + cache por
minuto), **tabela de classificação por competição com critérios de desempate**, **odds,
vídeo e grade de TV (licenciamento)**, **multi-esporte com o mesmo shell**.
Size: **L** (um trimestre) para tudo; a fatia central sozinha é **M** (algumas semanas).

## Próximo passo

`/replica-architect` para virar schema + rotas + ordem de build, começando pela fatia:
S01 → S04 (abas Detalhes/Dados) → S10. Antes disso, se quiser fechar o recon: tire
screenshots das 6 abas no celular em `replica/uniscore/screens/` (referência, nunca
entra no build) — é o único buraco de evidência que ficou.
