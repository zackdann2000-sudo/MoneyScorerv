# Recon — ClearEdge (clearedgeapp.com.br/futebol)

Clean-room recon: só páginas públicas (HTML renderizado), `robots.txt`, `sitemap.xml` e a
página de planos. Nenhum bundle JS, nenhuma chamada de API privada, nenhum login.
Recon feito em 2026-11-19. Alvo: web (Next.js na Vercel) + app Android já instalado no
aparelho do usuário (usado como referência visual, não como fonte de código).

## O que o produto é

Plataforma de **análise pré-jogo** (não é casa de aposta — o rodapé diz isso em todas as
páginas): cruza estatística histórica, odds do mercado e um modelo próprio para apontar
onde a linha está mal precificada. Mercado declarado: futebol (foco), NBA, WNBA,
Eurobasket, MLB, NHL, NFL, tênis, CS2, Valorant.

Posicionamento, nas palavras do site:
- "Clear Edge Futebol — análise pré-jogo"
- "O palpite de convicção do sistema, congelado antes do jogo e marcado green/red quando
  termina. Sem maquiar os erros."
- "As linhas exibidas são meramente informativas, para fins de análise e comparação."
- "A diferença aqui é vs uma referência bruta, não retorno garantido."

## Invariantes de UX observadas

- Barra superior fixa: busca global ("Buscar jogadores e times"), "Monte sua múltipla",
  seletor "Todos os esportes", estado de conta ("Plano: Gratuito" / "Acesse sua conta").
- Trilha de dias sempre visível nas telas de jogos (`NOV TER QUA HOJE SEX SÁB DOM SEG QUI`).
- Filtros de estado: `Todos | Ao vivo | Final`.
- Rodapé com 4 colunas (Recursos / Blog / Guias / Legal), aviso 18+, disclaimer de não
  afiliação com ligas e botão "Saiba mais" de jogo responsável.
- Copy honesta em toda tela de dado derivado: cada número tem "Como ler" ou "Como funciona".
- Toda tela tem estado de carregamento nomeado ("Carregando árbitros", "Buscando tendências…").

## Inventário de telas

| ID | tela | rota | propósito | componentes-chave | estados vistos |
|----|------|------|-----------|-------------------|----------------|
| S01 | Jogos do dia | `/futebol` | lista de partidas por dia/estado | DateStrip, filtros de estado, card de jogo | loading, lista, vazio, ao vivo |
| S02 | Torneios | `/futebol/torneios` | jogos agrupados por competição + coluna "Sinais" | abas Hoje/Ao vivo/Todos, tabela por liga, badge de sinal | loading, lista, vazio |
| S03 | Picks da IA | `/futebol/picks-da-ia` | palpites do dia escolhidos pelo modelo | filtro "Hoje", lista de picks com mercado e convicção | loading, lista, vazio |
| S04 | Palpites (histórico) | `/futebol/palpites` | pick congelado antes do jogo, marcado green/red depois | seletor Dia/Semana, trilha de datas, card green/red | loading, lista, dia sem pick |
| S05 | Radar de Divergências | `/futebol/radar-de-valor` | odds fora da referência (jogador/time/partida) | abas Jogadores/Times/Partidas, "Próximas 48h", ordenação "Maior diferença", "Agrupar por jogo" | loading, lista, vazio |
| S06 | Central de Linhas | `/futebol/central-de-linhas` | linha de mercado de jogador vs o que o modelo espera | abas Jogador/Time/Partida, filtros, "Agrupar por jogo" | loading, lista, vazio |
| S07 | Desajuste de Linha | `/futebol/desajuste-de-linha` | passes (linhas) mal precificados | toggle "Mais confiáveis / Mostrar todos", badge Experimental, "Como ler" | loading, lista, vazio |
| S08 | Duelos | `/futebol/duelos` | pares de jogadores que se enfrentam, por faltas/desarmes | abas Todos/Faltas/Desarmes/Duel score, filtros, agrupar | loading, lista, vazio |
| S09 | Confronto Direto (jogador × jogador) | `/futebol/confrontos` | calculadora que compara cada jogo de um contra cada jogo do outro | 2 campos de busca, 12 mercados, seletor "Recorte" (L20 · linha 0,5), card "Matchups para estudar" | vazio, preenchido, sem resultado |
| S10 | Análise (jogo) | detalhe do jogo | tese pré-jogo da partida: probabilidades por mercado e leitura | (renderizada no cliente; só o esqueleto é público) | loading, preenchido, bloqueado por plano |
| S11 | Árbitros | `/futebol/arbitros` | perfil de arbitragem por competição (cartões/faltas) | seletor de competição ("0 ligas"), lista de árbitros | loading, vazio |
| S12 | Tendências | `/futebol/trends` | séries e padrões (jogador/time/partida) | abas Todos/Jogadores/Times/Partidas, "Ordenar: Clear Edge" | loading, lista |
| S13 | Estatísticas | `/futebol/estatisticas` | radar de mercado ("Monte o mercado", Over 2.5 gols) + rankings + força + horário | abas Radar/Rankings/Força/Horário, lista "Próximos jogos" | loading, lista |
| S14 | Scout de Jogos | `/futebol/scout-de-jogos` | busca em linguagem de filtro sobre todas as ligas | "Monte sua busca", "Escopo da busca" (Todas as ligas), contador "Você tem 1 busca gratuita hoje" | quota disponível, quota esgotada, resultado vazio |
| S15 | Comparação de times | `/futebol/comparacao` | médias dos últimos 10 jogos de dois times, todas as competições | 2 seletores, aviso "0 times disponíveis em 0 competição", card de comparação | vazio, preenchido |
| S16 | Times | `/futebol/times` | índice de times | lista/grid + busca | loading |
| S17 | Monte sua múltipla | `/monte-sua-multipla` | escolhe casa e odd e monta o bilhete que mais bate (Pro) | builder de bilhete, seletor de casa | bloqueado por plano, preenchido |
| S18 | Super Odds / Boosts | `/boosts` | odds promocionais comparadas | lista de boosts | lista, vazio |
| S19 | Correlações | `/correlations` | correlações entre mercados (Premium) | matriz/lista de pares | bloqueado por plano, preenchido |
| S20 | Análise combinada | `/analise-combinada` | combina mercados do mesmo jogo | seletor de mercados, resultado combinado | vazio, preenchido |
| S21 | Ranking | `/ranking` | ranking de desempenho | tabela | loading |
| S22 | Planos | `/premium` | Free / Premium R$29,90 / Pro R$49,90 | 3 cards, toggle Mensal/Anual (−17%), lista "O que inclui" | mensal, anual |
| S23 | Ajuda | `/ajuda` | suporte via bot do Telegram com número de pedido | cards "Reportar um problema" / "Mandar uma sugestão", passo a passo, e-mail | — |
| S24 | Conta / Perfil | `/perfil`, `/login`, `/cadastro` | plano, gerenciar assinatura, aparência, idioma | card de plano, toggles | logado, deslogado |
| S25 | Jogo responsável / Legal | `/jogo-responsavel`, `/termos`, `/privacidade` | conformidade 18+ | texto | — |

## Fluxos

```
F01 Visitante avalia o dia e acha um pick
    S01 Jogos do dia -> S02 Torneios (por competição) -> S03 Picks da IA -> S10 Análise
    passos no caminho feliz: 3 cliques até o pick, 4 até a tese completa
    borda: dia sem jogos, plano Free em tela Premium -> S22

F02 Visitante procura valor contra a odd
    S05 Radar de Divergências -> aba Jogadores/Times/Partidas -> ordenar por "Maior diferença"
    -> "Agrupar por jogo" -> S06 Central de Linhas (a mesma linha com o número do modelo)
    borda: divergência negativa (odds melhores que a referência), janela < 48h

F03 Jogador vs jogador (a calculadora assinatura do produto)
    S09 Confronto Direto -> escolher Jogador 1 -> escolher Jogador 2 -> escolher mercado
    -> escolher recorte (L20 · linha 0,5) -> ler fair odds
    borda: jogador sem amostra suficiente, nomes homônimos, recorte sem jogos em comum

F04 Conferir se o método funciona
    S04 Palpites -> alternar Dia/Semana -> ler green/red e a frase "sem maquiar os erros"
    -> S03 Picks da IA (o pick de hoje)
    borda: dia sem pick, pick pendente (jogo não terminou)

F05 Time vs time sem confronto agendado
    S15 Comparação -> escolher time A -> escolher time B -> ler médias de 10 jogos

F06 Free bate no limite e vê o paywall
    S14 Scout de jogos ("1 busca gratuita hoje") -> busca esgotada -> S22 Planos
    -> checkout (Mercado Pago/Stripe) -> S24 Perfil com plano ativo

F07 Pedido de suporte
    S23 Ajuda -> "Reportar um problema" -> Telegram (@ClearEdgeAlertasBot, /bug) -> número do pedido
    -> aviso quando resolvido
    borda: 30 min para tocar em Enviar, até 8 prints e 2 vídeos de 20 MB
```

## Componentes recorrentes

- `DateStrip` — trilha de 9 dias, com HOJE destacado. Presente em S01, S02, S04, S05.
- `SegmentedTabs` — Todos/Ao vivo/Final, Jogadores/Times/Partidas, Dia/Semana.
- `GameCard` — casa × fora, hora, liga, badges de sinal, mini-odds.
- `SignalBadge` — "Sinais" na tabela de torneios.
- `DivergenceRow` — mercado, odd da casa, odd de referência, diferença % (cor por sinal).
- `LineRow` — jogador, linha, odd, probabilidade do modelo, edge.
- `DuelScoreBar` — faltas/desarmes por par, com score agregado.
- `MarketPicker` — 12 mercados na calculadora de confronto direto.
- `ComoLerDrawer` — explicação inline do número (presente em S05, S06, S07, S08).
- `QuotaChip` — "Você tem 1 busca gratuita hoje".
- `PlanGate` — bloqueio com CTA para `/premium`.
- `AccountChip` — "Plano: Gratuito" + "Gerenciar".

## Modelo de dados inferido

| entidade | campos | evidência | confiança |
|---|---|---|---|
| League | id, nome, país, esporte, prioridade | S01, S02 ("Competição") | alta |
| Team | id, nome, escudo, liga | S01, S15, S16 | alta |
| Player | id, nome, time, posição, foto | S06, S07, S08, S09 | alta |
| Match | id, liga, casa, fora, kickoff, estado (NS/live/final), placar | S01, S02 | alta |
| MarketLine | jogo, jogador/time, mercado (finalizações, chutes no gol, faltas, desarmes, gols, assistências, G+A, passes-chave, passes, amarelos, faltas sofridas, impedimentos, defesas), linha, odd, casa | S06, S07, S09, S17 | alta |
| ModelProbability | chave do mercado, prob modelo, prob implícita, edge, fair odds | S05, S06, S07, S09 | alta |
| Referee | id, nome, competição, média de cartões/faltas | S11 | média |
| Pick | jogo, mercado, linha, odd, convicção, congelado_em, status (pendente/green/red) | S03, S04 | alta |
| Trend | escopo (jogador/time/partida), métrica, janela, série | S12 | média |
| Subscription | user, plano (free/premium/pro), ciclo (mensal/anual), status, gateway (Mercado Pago/Stripe) | S22, S24 | alta |
| QuotaUsage | user, feature (scout), dia, usado | S14 | média |
| SupportTicket | user, tipo (bug/sugestão), texto, mídias, número, status | S23 | alta |

## Matriz de planos (do S22)

| | Grátis | Premium R$29,90/mês | Pro R$49,90/mês |
|---|---|---|---|
| Jogos do dia | ✅ | ✅ | ✅ |
| Stats básicos de jogadores | ✅ | ✅ | ✅ |
| Análise de 2 mercados | ✅ | ✅ | ✅ |
| Central de Linhas | limitada | completa | completa |
| Filtros avançados (+30) | ❌ | ✅ | ✅ |
| Correlações ilimitadas | ❌ | ✅ | ✅ |
| Buscador de Tendências | ❌ | ✅ | ✅ |
| Análise Defensiva + zonas | ❌ | ✅ | ✅ |
| Monte sua múltipla | ❌ | ❌ | ✅ |
| Análise de IA ilimitada por jogador | ❌ | ❌ | ✅ |
| Projeção + intervalo | ❌ | ❌ | ✅ |
| Over/under com confiança | ❌ | ❌ | ✅ |

Anual: −17%. Pagamento por Mercado Pago ou Stripe. Cancelamento em 7 dias (Art. 49 CDC).

## O que não dá para clonar

- `skip` — **odds proprietárias multi-casa**: eles têm contrato/acesso a feeds de odds por
  casa. Clonável só com um provedor pago (The Odds API, API-Football odds, Betfair).
- `skip` — **"referência bruta" da odd**: a odd de referência que eles calculam é o ativo
  deles. Nós vamos usar a nossa própria referência (média do mercado).
- `skip` — **base histórica de arbitragem**: exige feed de escalação de árbitro + histórico.
- `skip` — **app Android nativo**: o MVP é web responsivo.
- `skip` — marca, logo, copy literal e layout exato. Rebrand obrigatório.

## Tamanho

25 telas, 7 fluxos, 12 entidades. **L** (um trimestre) para paridade completa.
O núcleo que gera valor e assinatura (S03 picks, S05 radar, S06 linhas, S09 confronto,
S04 histórico) é **M** e é o que o MVP implementa.
