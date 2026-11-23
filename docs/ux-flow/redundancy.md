# Redundância e hierarquia — GreenScore

Evidência: código das jornadas J1–J3 + `src/lib/navigation.ts` + `docs/ux-flow/plan.md`.

## Duplicate Paths

| Objetivo | Rotas | Diagnóstico | Recomendação |
|---|---|---|---|
| Ver "IA/palpite" | `/supertips/palpites`, `/palpites-ia`, `/edge` | 3 entradas com o mesmo verbo e nomes diferentes | eleger `/supertips/palpites` como canônica; `/palpites-ia` e `/edge` viram sub-abas dela |
| Ver props | aba PROPS em `/jogos/[id]` e `/gameread` | páginas distintas, mesma promessa | manter as duas (contexto local vs exploração) e **renomear** a global para "Radar de props" |
| Ver classificação | `/hub/classificacao` e aba CLASSIFICAÇÃO no jogo | a aba do jogo já destaca o time; a global é a tabela completa | manter ambos; marcar a global como canônica |
| Assinar | `/config#planos` e `/planos` | o bloco do config é atalho, o `/planos` é a tela | manter; ambos levam ao mesmo checkout |

## Duplicate Information

| Fato | Onde aparece | Recomendação |
|---|---|---|
| Preço e economia | landing, `/config`, `/planos` (2 números por card) | manter 1 número por card (`precoMes`) e o cheio só no detalhe |
| Aviso legal 18+ | `LegalFooter`, landing, `/planos`, drawer, onboarding | manter no rodapé e na landing; remover do drawer (já está a um scroll) |
| "TRUST = nota de confiança" | `/ev`, `/forebet`, `/supertips/palpites`, tooltip | 1 definição canônica em `/metodologia`, com link curto onde aparece |
| Status VIP | header (avatar), `/config`, `/planos`, `TrialBanner` | 4 superfícies para o mesmo estado; manter `TrialBanner` + `/config` |

## Overlapping Features

1. **Quatro telas espelho de terceiros** — `/forebet`, `/apitou`, `/kingstats`, `/nerdytips`. Mesma função (tabela/pick de outro site) com marcas diferentes. Hoje estão recolhidas em "Mais ferramentas", o que é o meio-termo correto; a recomendação é **não promover** nenhuma delas a destaque e considerar remover as que tiverem pouco tráfego após 30 dias de analytics.
2. **`/palpites-ia` vs `/supertips/palpites` vs `/edge`** — três motores com nomes de IA. O usuário não distingue. Diferenciar por pergunta ("o modelo discorda do mercado?" = Edge; "o modelo projeta o jogo" = Palpites) ou fundir.
3. **Dois gates de paywall** — `TipsGate` (página inteira) e `VipLock` (bloco). São complementares, mas com textos diferentes para a mesma restrição ("bloqueadas", "é VIP", "Conteúdo VIP").

## Hierarchy & IA

- **Profundidade:** o Aha (oportunidade do jogo) está a 1 clique da home logada — **correto**. Props a 2.
- **Raro no topo:** a aba "Explorar" abre 15 destinos; 4 deles (Forebet, Apitou, King STATS, NerdyTips) são espelhos de baixa frequência e estão a 1 toque do mesmo jeito que "Centro de Jogos". O recolhimento em "Mais ferramentas" no drawer está certo, mas o sheet **não** reflete essa prioridade (mostra só 3 grupos, ok).
- **Uma coisa, um nome:** falha em "IA" (5 nomes), em VIP (4 verbos) e em "Desapitos"/"MÚLTIPLAS" (jargão interno exposto).
- **Uma coisa, um ícone:** `Trophy` serve Classificação, Ligas e Forebet; `Users` serve Times e Jogadores. Detalhe menor, mas some a pista visual.

## O que já está limpo

- A navegação nova (4 abas + sheet + drawer agrupado) eliminou a duplicação estrutural que existia antes: **nenhuma rota está em dois lugares** em `navigation.ts`.
- Nenhuma confirmação desnecessária nas três jornadas (o modal de alertas é opt-in, não bloqueia).
