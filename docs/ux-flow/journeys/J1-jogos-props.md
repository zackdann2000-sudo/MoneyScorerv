# J1 — Jogos → jogo → Props

**Evidência:** código (sem screenshots). Rotas: `src/app/jogos/page.tsx`,
`src/components/flash/GamesBoard.tsx:336`, `src/components/match/MatchClient.tsx:14-20,27-32,151-171`,
`src/components/match/PropsTab.tsx:78-80`, `src/app/api/matches/[id]/props/route.ts:32-38`.

## Friction Scorecard

| Métrica | Valor | Evidência |
|---|---|---|
| Passos até o Aha (conta ativa) | **1 clique** | aba Jogos já é a home logada (`/` → `/jogos`); 1 clique na linha do jogo; aba default é OPORTUNIDADES (`MatchClient.tsx:34`) |
| Passos até Props | **2 cliques** | linha do jogo + aba PROPS (`MatchClient.tsx:20`) |
| Ideal | 2 cliques | board → jogo → props |
| Decisões | 1 relevante | escolher entre **8 abas** + 4 chips secundários = 12 alvos no jogo |
| Re-entry | 0 | nada é redigitado |
| Dead end | **1 (conta expirada/anônima)** | `PropsTab.tsx:78` mostra a string do servidor em caixa vermelha, sem CTA |
| Hesitação | média | "PROPS" é a 7ª de 8 abas; nada indica que é o diferencial |

**Medido:** 1 e 2 cliques, 12 alvos, texto de erro sem CTA.
**Suspected:** tempo de carga do props (API paga, cache 24h) — pode passar de 3s e parecer travado.

## Take-away Pass

Por tela:

- **Board (`/jogos`)** — a linha tem 3 links com o mesmo destino (`GamesBoard.tsx:348-355`) e um botão de estrela. Nada removível sem quebrar uso; a estrela de 44px ao lado de um link de 48px compete para o polegar.
- **Jogo (`/jogos/[id]`)** — o que é removível ou postergável:
  - card "Melhor linha deste jogo" (boa informação) e o aviso "As odds podem mudar" (repete a mensagem do rodapé legal) → cabe atrás de disclosure.
  - **4 chips secundários** (IA ANALISTA, FORMAÇÕES, CLASSIFICAÇÃO, MONEY) repetem destinos que já existem no menu global — ruído em cima da dobra.
  - 8 abas primárias num scroll horizontal: a 8ª só é descoberta rolando.
- **Props** — um único conteúdo primário (cards por mercado). A caixa de erro de gate é o único ponto que falha o teste de "próxima ação óbvia".

## The Simpler Version

1. Abrir a aba Jogos.
2. Tocar no jogo.
3. Ver o card de oportunidade (Aha imediato, já é o default).
4. Tocar em PROPS — que passa a ser a **2ª aba**, não a 7ª.
5. Se não houver acesso: ver um paywall com **um** botão ("Liberar acesso") em vez de um erro cru.

Mudanças concretas: reordenar abas (PROPS antes de H2H REAL/JOGADORES), esconder os 4 chips
secundários atrás de "Mais", e trocar o erro 402/403 do `PropsTab` por um gate com CTA.

## Clarity Issues

- **"PROPS"** é jargão de mercado; o público entende "jogadores" e "cartões/finalizações". O card interno já explica ("Player props · últimos jogos"), o rótulo da aba não.
- O gate diz **"Conteúdo VIP. Entre com uma conta ativa"** (`props/route.ts:37`) para quem já está logado sem VIP — "entre" está errado para esse caso.
- O gate de `TipsGate` ainda diz **"Não há assinatura"** e **"até o administrador liberar o VIP"** (`TipsGate.tsx:21,25`) — contradiz o Stripe recém-implantado.

Verdict: **acceptable** (caminho feliz é mínimo; o gate e a ordem das abas custam 1–2 passos e um beco sem saída).
