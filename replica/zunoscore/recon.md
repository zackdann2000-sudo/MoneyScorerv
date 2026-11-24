# Recon — zunoscore.com (aba Futebol)

> Clean-room recon do **Zunoscore** (https://zunoscore.com), produto de placar ao vivo
> + estatística + IA. Escopo: **somente futebol**. Objetivo: inventário de telas,
> APIs e **métodos de análise**, e o diff contra o nosso projeto (greenscore.app).
> **Nada em `src/` foi alterado por este recon.**

## 0. Método e limitações (honestidade do dado)

| fonte | resultado |
| --- | --- |
| `robots.txt` | bloqueia `/v1/account/`, `/v1/push/`, `/v1/admin/`; `Allow: /` no resto |
| `/sitemaps/*.xml` | índice com 585 sitemaps; `paginas.xml` = 14 rotas; `jogos-futebol.xml` = **1.472 URLs de jogos**; 1 sitemap por idioma (15 locales) × esporte |
| HTML do site | SPA **Vue 3 + Vite** (não Next). Shell de 8 KB; tudo vem de `/assets/index-K-XIttgc.js` (1,03 MB) |
| bundle + 41 chunks | baixados e desmontados: `index`, `MatchView`, `LeagueView`, `TeamView`, `PlayerView`, `HomeView`, `LiveView`, `FavoritesView`, `AlertCenterView`, `ZunoView`, `AskZuno`, 14 locales |
| página de jogo (SSR) | HTML pré-renderizado com `<meta>` + **JSON-LD `SportsEvent`** (SEO programático) |
| `/v1/*` (API) | **bloqueada**: `401 {"error":1}` para `curl`, para o leitor r.jina.ai e para qualquer combinação de headers (`X-ZS-View`, `X-ZS-Country`, `X-ZS-Prefetch`, referer, sec-fetch-*, UA mobile). Só `/v1/health` e `/config.json` são públicos |
| `/v1/s` | endpoint cifrado (AES-GCM, chave `zs/v1`, envelope `{__zs,kid,iv,d}`) usado para request assinado — é o que barra acesso fora do browser |
| método usado então | **análise estática do client**: as funções normalizadoras do bundle expõem os campos e as métricas; os textos de UI explicam cada métrica |

**Consequência:** os contratos de API abaixo são **inferidos do client** (nomes de rota
+ campos que o normalizador consome), não validados contra JSON real. Marcado como
`confiança: alta/média`.

## 1. O que o produto é (nas palavras deles)

Dos Termos de uso (texto literal no bundle):

- "O Zunoscore é um **placar ao vivo gratuito** de futebol, basquete, tênis, hóquei,
  e-sports, críquete, futsal, futebol americano, beisebol e vôlei, com **estatísticas,
  escalações, tabelas, notícias, alertas e o Zuno IA**."
- "O **Zuno IA, os Stories, o minuto a minuto e alguns resumos são gerados por
  inteligência artificial a partir dos dados dos jogos**."
- "O Zunoscore **não é uma casa de apostas**: não aceitamos apostas, não guardamos
  dinheiro… As odds exibidas servem só para informar."
- "Para continuar gratuito, o Zunoscore **mostra anúncios**, inclusive de terceiros
  (Google Ad Manager); anúncios de apostas só de operadores licenciados, 18+."

Ou seja: **não existe modelo preditivo, não existe palpite, não existe track record.**
A "análise" deles é (a) métricas derivadas do jogo (xG, APPM, domínio, pressão,
sequências), (b) comparação pré-jogo entre os dois times e (c) **narração por IA** do
que os dados mostram. Monetização = anúncio, não assinatura.

Evidência de ausência: `palpite` = 0 ocorrências, `probabilidade` = 0, `confiança` = 0,
`track record` = 0 no bundle inteiro e nos chunks.

## 2. Inventário de telas (router do bundle)

| rota | tela | futebol? |
| --- | --- | --- |
| `/` | Home: **"Jogos de futebol ao vivo e do dia"**, chips de esporte, filtro país/estado, ordem das ligas arrastável, Stories row | sim |
| `/ao-vivo` | Ao vivo (todos os esportes, chips) | sim |
| `/jogo/:id/:slug` | **Match center** (abas + painéis) | sim |
| `/popup/jogo/:id/:slug` | Jogo em janela popup (multitela) | sim |
| `/meus-jogos` | Jogos marcados pelo usuário | sim |
| `/favoritos` | Times/ligas/jogadores seguidos + jogos deles (ao vivo / próximos / terminados) | sim |
| `/acontecendo` (`/contexto`) | **Feed "Acontecendo"**: timeline do que está rolando entre os seguidos | sim |
| `/stories` | **Stories** por time/liga/jogador (momentos gerados por IA) | sim |
| `/noticias` | Central de notícias por região | — |
| `/alertas` | **Central de alertas** (push por tipo, por aparelho) | sim |
| `/zuno` | **Zuno IA** (chat com cota) | sim |
| `/liga/:id/:slug` | Liga: próximos, últimos, rodadas, classificação, estatísticas de jogadores, **transferências** | sim |
| `/time/:id/:slug` | Time: forma recente, destaques, gols por período, médias, elenco+stats, **transferências**, próximos/últimos | sim |
| `/jogador/:id/:slug` | Jogador: atributos, por temporada, últimos jogos, posição em campo | sim |
| `/basquete/*`, `/tenis/*`, `/sports/*` | outros esportes (fora do escopo) | não |
| `/conta`, `/conta/redefinir` | conta opcional (favoritos sincronizados) | — |
| `/privacidade`, `/termos`, `/cookies`, `/rgpd`, `/contato` | legal | — |

## 3. Match center (aba futebol) — o núcleo

### 3.1 Header (`MatchHeader`)
Escudos + nomes, placar, relógio/minuto com acréscimos, cartões vermelhos, pênaltis,
agregado de confronto de ida/volta, estado (pré/ao vivo/intervalo/prorrogação/pênaltis/
encerrado/adiado/cancelado), compartilhar, **fixar na multitela (até 4 jogos)**,
abrir em popup.

### 3.2 Painéis/blocos (`vt` = ordem editável, salva em `zs:livepanel:v2`)

| chave | label | conteúdo |
| --- | --- | --- |
| `oddsLive` | Resultado final | odds ao vivo do 1X2 |
| `now` | Acontecendo | feed do que está acontecendo no jogo agora |
| `data` | Números do jogo | estatísticas comparadas (posse, chutes, no gol, escanteios, faltas, cartões, impedimentos) |
| `chart` | **Domínio territorial** | onde a bola esteve em cada minuto (posição média); barra pra cima = pressão do mandante. Tooltip explica o método |
| `replays` | Replays | clipes (direitos de terceiros) |
| `feed` | **Lance a lance** | narração minuto a minuto, modo **detalhado** ou **simples**, por período |
| `motm` | Jogador da Partida | melhor nota ao vivo |
| `rated` | Jogadores melhor avaliados | **notas ao vivo por jogador** |
| `table` | Classificação | tabela da competição |
| `referee` | Árbitro | **médias do árbitro** (cartões/jogo, "últimos jogos como árbitro principal") |
| `markets` | Odds pré-jogo | mercados 1X2 + outros |
| `weather` | Clima | condição, temperatura, sensação, vento, nuvens/umidade |
| `venue` | Estádio | nome, mapa |
| `tv` | Canais de TV | onde passa, por país |

Extras vistos no chunk: `LiveBlocks` (blocos ao vivo reorganizáveis, "BLOCOS DESTA ABA",
"soltar no topo/na largura toda/coluna da esquerda…"), `AttacksCarousel`,
`DominioChart`, `GoalParty` (animação de gol), `ReplayStrip`, `SidelinedCard`,
`FeaturedPlayers`, `LiveRatings`, `TvChannels`, `PregamePanel`, `LineupsPanel`,
`StatsPanel`, `OddsMarkets`, `OddsCard`, `LiveOddsCard`, `RefereeCard`, `VenueCard`,
`ContextCard`.

### 3.3 Métricas ao vivo próprias (o diferencial de método)

Textos de ajuda no bundle (literais):

- **APPM** — "ataques perigosos por minuto nos últimos 1, 3, 5 e 10 minutos e no jogo
  todo. **Verde a partir de 2, laranja acima de 3 e vermelho acima de 3,9**."
- **Domínio territorial** — "mostra onde a bola esteve em cada minuto (posição média).
  Barra para cima: bola no campo do {away}, {home} pressiona; para baixo: …"
- **Barra de Pressão** e **Ataques** (toggles: "Mostrar Ataques", "Mostrar Ataques
  perigosos por minuto", "Mostrar Barra de Pressão").
- **Conversão de xG** — "**% de jogos em que o time marcou quando teve xG acima de 1**".
- **Notas ao vivo** por jogador + **Jogador da Partida**.
- `tracker/{matchId}/{tipo}` — série temporal de métrica ao vivo (uma chamada por série).

### 3.4 Painel pré-jogo (`PregamePanel`) — comparação dos dois times

Blocos (ordem editável, "Ordem do pré-jogo" / "Ordem do H2H"):

- **Atributos comparados**: 5 eixos 0–100 — **Ataque, Técnica, Tática, Defesa, Criatividade**.
- **Médias por jogo**: gols marcados **ou** sofridos (toggle "Marca / Sofre"), média
  por jogo em todas as competições, "por jogo" no período selecionado.
- **Sequências** (aba **Geral** e aba **Confronto**): invicto, sem vencer, sem marcar,
  sem sofrer gol, marca primeiro, sofre primeiro, empates, vitórias/derrotas.
- **Confronto direto (H2H)**: barra vitórias/empates/vitórias + total de gols + lista
  de confrontos ("Os times ainda não se enfrentaram").
- **Desfalques** (`SidelinedCard`): lesão, suspenso, doente, motivo pessoal,
  convocação/seleção ("international duty").
- **Escalação provável** + banco, com aviso: "Escalação provável, ainda não confirmada
  pelos clubes. Pode mudar até o início do jogo".
- **Classificação dos dois times** + legenda de cores das posições.
- **Jogadores em destaque** / **Jogadores melhor avaliados** (com trilhas por jogador).
- **Árbitro** (médias), **Clima no local**, **Estádio**.

### 3.5 Jogador

- **Atributos 0–100**: Ataque, Técnica, Tática, Defesa, Criatividade + `leads`
  ("melhor em nota/gols/assistências") + `tiles`.
- Posição em campo, histórico por temporada, últimos jogos, stats do jogo,
  rating + tier.

## 4. Contrato de API `/v1` (inferido do client, `confiança: alta` nos caminhos)

```
GET /v1/health                       → {ok, feed, redis, mongo, m4, ws}
GET /v1/geo                          → país/estado do visitante
GET /v1/matches?date=YYYY-MM-DD      → jogos do dia (header X-ZS-Country)
GET /v1/live                         → jogos ao vivo
GET /v1/odds?date=YYYY-MM-DD         → odds de todos os jogos do dia
GET /v1/matches/{id}                 → detail (placar, eventos, stats, clock)
GET /v1/matches/{id}/info            → estádio, clima, árbitro, TV
GET /v1/matches/{id}/lineups         → escalações (provável/confirmada)
GET /v1/matches/{id}/pregame         → painel pré-jogo (atributos, médias, sequências)
GET /v1/matches/{id}/prejogo         → variante do pré-jogo (legado/segmentado)
GET /v1/matches/{id}/odds            → mercados pré-jogo
GET /v1/matches/{id}/live-odds       → mercados ao vivo
GET /v1/matches/{id}/featured        → jogadores em destaque
GET /v1/matches/{id}/h2h             → confrontos diretos
GET /v1/tracker/{id}/{tipo}          → série de métrica ao vivo (APPM, pressão…)
GET /v1/leagues/{id}                 → liga (rodadas, próximos, últimos)
GET /v1/leagues/{id}/standings?home=&away=  → tabela (opcional 2 times)
GET /v1/leagues/{id}/player-stats    → stats de jogadores da liga
GET /v1/leagues/{id}/transfers       → transferências da liga
GET /v1/teams/{id}                   → time (forma, médias, elenco, gols por período)
GET /v1/teams/{id}/transfers         → transferências do time
GET /v1/players/{id} | /more         → jogador
GET /v1/search?q=&ai=1  | /search/games?q= | /search/top
GET /v1/nav/countries | /nav/countries/{cc}/leagues | /nav/pinned
GET /v1/news?sport=&scope=&limit=    → notícias
GET /v1/stories/feed | /stories/interests
GET /v1/context/feed?scope=mine|all&layout=timeline&limit=
POST /v1/context/seen | /context/prefs | /context/mark-all-seen
GET /v1/push/center | POST /v1/push/center | /center/off | /center/test
     (Web Push: {subscription, prefs, follows, region, lang})
POST /v1/ai/zuno/ask                 → Zuno IA (cota por período)
POST /v1/account/*                   → login, register, logout, password/forgot|reset
GET/POST /v1/s                       → envelope cifrado p/ request assinado
```

Padrões de engenharia interessantes: **`202 pending`** (server responde "ainda
carregando" e o client re-tenta com backoff 2s→30s), **stale-while-revalidate** em
memória por chave, **prefetch do dia seguinte** (`X-ZS-Prefetch: 1`), **`X-ZS-Version`/
`X-ZS-Country`** por região, WebSocket para o ao vivo, service worker **só de push**
(sem cache).

## 5. Alertas (push) — taxonomia deles

| tipo | texto (literal) | cap |
| --- | --- | --- |
| Destaques | "Os grandes lances do momento" | 1 a cada 30 min |
| Notícias dos seus times | fontes da região de Notícias | 1 a cada 2 h |
| Jogos dos times seguidos | "Início, intervalos, fim e os pontos, como a estrela do jogo" | — |
| Resultados das ligas seguidas | gols da liga | resumo do dia vem `quiet` (silencioso) |
| Gols e assistências | "Também gol contra e pênalti perdido" | — |
| Cartões | amarelo e vermelho | — |
| Substituições | "quando entra e quando sai de campo" | — |
| Transferências | "quando o clube confirma uma transferência ou um empréstimo" | — |
| Stories do jogador | gol, lesão, convocação, renovação | — |
| Outros esportes | lances | — |

Dedupe por `id`+`tag` no service worker (o mesmo alerta reentregue **substitui** sem
tocar), `quiet` para resumo noturno de liga.

## 6. Estratégia de aquisição/SEO deles

- **15 locales** (`/pt` default + pt-PT, en, es, fr, de, it, ru, tr, ar, hi, ja, zh, ur, bn).
- **Página de jogo pré-renderizada** com `<title>`/`description` em pt-BR, `og:*` e
  **JSON-LD `SportsEvent` + `BreadcrumbList`** → 1.472 URLs de jogos de futebol no
  sitemap (mais ligas/time/jogador).
- Sitemap-índice com 585 sitemaps (1 por idioma × esporte), `lastmod` real.
- Personalização regional: detecta timezone/`geolocation`/`language` → país + **estado
  do BR** (tabela lat/lon → UF, 900 km de raio), e usa isso para ordenar ligas e
  escolher fontes de notícia (`zs_region`).
- **Prefetch** do dia seguinte e do jogo aberto (sensação de instantâneo).
- Ads: Google Ad Manager + Meta Pixel; slot "Publicidade" dentro do jogo.

## 7. O que NÃO dá para copiar

- **Transmissão ao vivo** e **replays** (direitos de imagem de terceiros).
- **Notícias** de terceiros (aparecem com crédito; são do veículo).
- **Marca, logo, textos próprios, base de dados** (eles próprios proíbem extração
  sistemática nos Termos — referência de postura, não de licença para nós).
- O acervo histórico de dados licenciados (SportMonks + provedores próprios).

## 8. Diff contra o nosso projeto (greenscore.app)

Legenda: `temos` / `parcial` / `novo`.

| # | Feature do Zunoscore (futebol) | nós | evidência nossa / onde falta |
| --- | --- | --- | --- |
| 1 | Lista de jogos do dia + ao vivo | temos | `/hub`, `/ao-vivo`, `/api/matches` |
| 2 | Painel do jogo com stats comparadas | temos | `InfoTabs.tsx`, `/api/matches/[id]/stats` |
| 3 | xG / chutes / posse | temos | `xgOfficial.ts`, `InfoTabs` (`xgEst`) |
| 4 | Momentum / pressão (sinal + gráfico) | temos | `lib/momentum.ts`, `WinProbChart.tsx` |
| 5 | Win probability ao vivo | temos (eles não têm) | `lib/winProb.ts` |
| 6 | Odds (1X2, O/U, BTTS, props) | temos (mais profundo) | `mercadosPoisson`, `OddsCards`, `playerPropsEngine` |
| 7 | Probabilidade modelo, EV, veredito IA, track record, rankings, combos | **só nós** | `engine.ts`, `valueBet.ts`, `vereditoEngine.ts`, `trackRecord.ts`, `comboBuilder.ts` |
| 8 | H2H no detalhe | temos | `H2HTab.tsx`, `h2hEngine.ts` |
| 9 | Classificação | temos | `/hub/classificacao`, `hub/standings.ts` |
| 10 | Escalações | temos | `Lineup.tsx`, `/api/matches/[id]` |
| 11 | Forma recente / últimas 10 | temos | `formaRecente.ts`, `Last10.tsx` |
| 12 | Gols por período | temos | `golsLadder.ts`, `LadderGols.tsx` |
| 13 | Árbitro (médias) | parcial | só no `apitou` (`AnaliseTab` mostra amarelos/jogo) |
| 14 | Estádio | parcial | `venue` aparece no header; sem bloco próprio |
| 15 | **Clima no local** | novo | nenhum bloco de clima |
| 16 | **Canais de TV** | novo | nada |
| 17 | **Transmissão + replays** | novo (não copiar) | — |
| 18 | **Notas ao vivo por jogador + Jogador da Partida** | novo | não temos rating por jogador |
| 19 | **APPM (ataques perigosos/min, janelas 1/3/5/10)** | novo | `momentum.ts` tem pressão agregada, não APPM |
| 20 | **Domínio territorial (posição média da bola por minuto)** | novo | — |
| 21 | **Atributos 0–100 (Ataque/Técnica/Tática/Defesa/Criatividade)** | novo | — |
| 22 | **Sequências** (invicto, sem vencer, sem marcar, marca 1º, sofre 1º) | parcial | `padroes.ts`/`amostra.ts` cobrem parte; sem UI de sequências Geral/Confronto |
| 23 | **Desfalques** (lesão/suspenso/doente/pessoal/seleção) | parcial | `SidelinedCard`-equivalente não existe; `/api/matches/[id]` traz pouco |
| 24 | **Escalação provável + nota "não confirmada"** | parcial | `Lineup.tsx` só quando há escalação |
| 25 | **Conversão de xG (% de jogos que marcou com xG>1)** | novo | métrica derivada que não calculamos |
| 26 | **Lance a lance narrativo (detalhado/simples) por período** | parcial | temos eventos; sem narração por IA nem modo simples/detalhado |
| 27 | **Multitela (até 4 jogos) + jogo em popup** | novo | — |
| 28 | **Organizar painel** (ordem de blocos/abas salva no aparelho) | novo | — |
| 29 | **Stories** por time/liga/jogador | novo | — |
| 30 | **Acontecendo** (timeline cross-entidade dos seguidos) | novo | `/favoritos` é estático |
| 31 | **Seguir time/liga/jogador** com cookie+conta | parcial | `favorites`/`preferences` existem por jogo/time |
| 32 | **Zuno IA (chat com cota, sugestões, contexto do jogo)** | novo | nosso `IaTab` é análise do jogo, não chat |
| 33 | **Busca com IA** (`/search?ai=1`) | novo | temos busca? não |
| 34 | **Transferências** (liga e time) | novo | — |
| 35 | **Stats de jogadores da liga / por temporada** | parcial | `/api/players`, `/rankings` cobrem parte |
| 36 | **Página de liga com seletor de rodada e temporada** | parcial | `/hub/liga/[id]` sem seletor de rodada/temporada |
| 37 | **Central de alertas com tipos + cap por tipo + quiet** | parcial | `alert_prefs` já tem 12 chaves; falta UI de central, caps e quiet hours |
| 38 | **Push por aparelho (Web Push VAPID) sem login** | parcial | temos VAPID + FCM |
| 39 | **15 idiomas + hreflang** | novo | site só pt-BR |
| 40 | **Página de jogo indexável com JSON-LD SportsEvent** | novo (decisão) | nosso `sitemap.ts` **exclui** jogos de propósito |
| 41 | **Personalização por região/UF** (ordenar ligas, fontes) | novo | — |
| 42 | **Anúncios (Ad Manager) como receita** | novo (modelo) | nosso modelo é assinatura Stripe |
| 43 | **PWA instalável** | temos | `public/manifest.json`, `InstallApp.tsx` |
| 44 | **Conta opcional para sincronizar favoritos** | temos | `/api/auth/*`, `/api/favorites` |
| 45 | 11 esportes | fora do escopo | foco futebol |

### 8.1 O que eles têm e nós não temos (o "novo" de verdade)

1. **Métricas ao vivo proprietárias**: APPM, Domínio territorial, Barra de pressão por
   janela (1/3/5/10 min), com **limiares de cor** publicados (2 / 3 / 3,9).
2. **Avaliação ao vivo de jogador** (nota, tier, MOTM, "melhor avaliados").
3. **Atributos de jogador 0–100** em 5 eixos + "melhor em X" (leads).
4. **Conversão de xG** como métrica de time (e não só xG do jogo).
5. **Painel pré-jogo comparativo** completo: atributos, médias marca/sofre, sequências
   (Geral/Confronto), desfalques por motivo, escalação provável com disclaimer,
   classificação dos dois times, árbitro, clima, estádio, TV.
6. **Consumo multijogo**: multitela de 4 jogos + popup + organização de blocos por
   aparelho.
7. **Camada social/IA**: Stories por entidade, feed "Acontecendo", Zuno IA com cota e
   sugestões, busca com IA, narração por IA do minuto a minuto.
8. **Central de alertas** com 10 tipos, cap por tipo (30 min / 2 h) e resumo silencioso.
9. **Transferências** (time e liga) e **stats de jogador por temporada** na liga.
10. **i18n 15 locales + SEO programático de jogo (JSON-LD) + personalização por UF**.
11. **Engenharia de percepção**: `202 pending` com retry, prefetch do dia seguinte,
    stale-while-revalidate, WS no ao vivo.

### 8.2 O que nós temos e eles não têm (nossa vantagem — não abandonar)

- **Motor preditivo** (Poisson/Dixon-Coles), **probabilidade 1X2/O-U/BTTS/placar exato**,
  **win-prob ao vivo**, **EV e valor esperado**, **props de jogador com λ**,
  **veredito IA**, **track record liquidado**, **rankings**, **combo builder**,
  **detector de desajustes**, **Moneytips/NerdyTips/SuperTips**, **hubs multi-fonte**
  (ESPN, SportMonks, Football-Data, Bzzoiro), **Stripe/quotas/trial**.
- Ou seja: eles **informam**; nós **opinamos com número e auditamos o acerto**.

## 9. Se for para adicionar (ordem sugerida, sem implementar agora)

**P0 — barato e alto impacto (dado que já temos no payload)**
1. `APPM` + `Barra de pressão` por janela (1/3/5/10) a partir de `lib/momentum.ts` +
   `tracker` equivalente (`/api/matches/[id]/momentum` já entrega lances).
2. `Sequências` (Geral/Confronto) reusando `padroes.ts` + `amostra.ts`.
3. `Desfalques` + `Escalação provável` com disclaimer.
4. Bloco `Clima` + `Estádio` + `Árbitro` (médias) no painel do jogo.
5. `Conversão de xG` no card do time (derivada do histórico que já liquidamos).

**P1 — diferencia de produto**
6. `Notas ao vivo por jogador` + `MOTM` (score por evento; independe de fornecedor).
7. `Atributos 0–100` (Ataque/Técnica/Tática/Defesa/Criatividade) — derivável de
   gols/assist/finalizações/desarmes/passes que já normalizamos.
8. `Multitela` (2–4 jogos) + `Organizar painel` persistido por aparelho.
9. `Central de alertas` na UI com caps por tipo + quiet hours (motor já existe).
10. `Transferências` e `stats de jogador por temporada` na liga.

**P2 — produto novo, custo maior**
11. `Zuno`-like: chat sobre os dados com cota (nosso diferencial seria responder com
    probabilidade + EV, não só narrar).
12. `Stories` por time/jogador + feed `Acontecendo`.
13. `SEO de jogo` com JSON-LD (reavaliar a decisão atual do `sitemap.ts`).
14. `i18n` (começar por en/es).

**Não fazer:** transmissão, replays, notícias de terceiros, copiar copy/marca.

## 10. Limitações deste recon

- API bloqueada: campos exatos, formatos e a fórmula real do APPM/atributos **não**
  foram vistos em JSON; o que está aqui vem do client e dos textos de ajuda.
- Não foi possível confirmar quantas ligas/temporadas cobrem (sitemap de ligas não
  foi enumerado por completo).
- Métricas deles podem ter ajustes no servidor que o client não revela.
