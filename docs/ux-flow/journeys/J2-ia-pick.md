# J2 — Aba IA → pick

**Evidência:** código. Rotas: `src/app/supertips/palpites/page.tsx:44-51,80,104,141`,
`src/app/supertips/jogo/[id]/page.tsx:12-20,28,66-72`, `src/components/Shell.tsx` (aba IA).

## Friction Scorecard

| Métrica | Valor | Evidência |
|---|---|---|
| Passos até o Aha | **1 clique** | aba IA cai direto em `/supertips/palpites`, que já mostra pick, odd e TRUST no card (`palpites/page.tsx:101`) |
| Passos até o detalhe | **2 cliques** | +1 no link do confronto dentro do bloco (`palpites/page.tsx:80`) |
| Ideal | 1–2 | o Aha já está na lista — bom |
| Decisões | 2 | alternar Futebol/NBA e MERCADOS/MÚLTIPLAS antes de ler o pick |
| Re-entry | 0 | — |
| Dead end | 0 | — |
| Hesitação | **alta** | o link para o detalhe é o **nome do confronto** dentro de um card que não parece clicável; os botões "+" parecem ser a ação principal |

**Medido:** contagem de cliques e posição dos links.
**Suspected:** affordance do link de detalhe (precisa de tela para confirmar).

## Take-away Pass

- **Lista (`/supertips/palpites`)** — por elemento:
  - toggle Futebol/NBA: mantém (muda o conteúdo).
  - MERCADOS/MÚLTIPLAS: mantém, mas com 0 itens no bilhete o rótulo "MÚLTIPLAS (0)" ocupa metade da barra.
  - **botão "+" em cada mercado** e **"ADICIONAR AO BILHETE"** fazem a mesma coisa em dois níveis de zoom → redundância interna.
  - "TRUST" aparece como nota de confiança (0–10) sem link para a metodologia nessa tela; a explicação fica em `/forebet` e `/ev`.
- **Detalhe (`/supertips/jogo/[id]`)** — 6 abas; a default "Comparar" **não contém o pick**, só forma e V·E·D. Quem clicou no pick cai numa tela sem o pick.

## The Simpler Version

1. Abrir aba IA.
2. Ler o pick no card (odd, TRUST, EV) — **Aha na 1ª tela**, sem clique.
3. Se quiser contexto, tocar no card inteiro (não só no nome) para abrir o jogo já na aba do pick, não em "Comparar".

Mudanças concretas: transformar o bloco do confronto em link único; abrir
`/supertips/jogo/[id]` na aba que corresponde ao pick de origem (query `?tab=`),
como já é feito em `MatchClient`; e remover o "+" duplicado quando o bloco inteiro
já leva ao detalhe.

## Clarity Issues

- **Cinco nomes para "IA"**: "IA" (aba), "SuperTips IA" (menu), "Palpites IA" (rota `/palpites-ia`), "IA Analista" (aba do jogo), "Money Tips"/"Nerdytips". O usuário não sabe se são o mesmo motor.
- "TRUST" não é traduzido nem explicado no lugar onde aparece pela primeira vez.
- "MÚLTIPLAS" e "Desapitos" são termos internos expostos como navegação.

Verdict: **acceptable** (Aha em 1 clique; o custo está na affordance do detalhe e no detalhe abrir na aba errada).
