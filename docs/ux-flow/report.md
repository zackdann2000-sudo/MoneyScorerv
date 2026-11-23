# UX Flow Critique — GreenScore (mobile)

## Run Summary

| Métrica | Valor |
|---|---|
| Jornadas criticadas | 3 |
| Fonte de evidência | **código** (sem `ux-paths`/`ux-walker`, sem browser no Termux) |
| Veredictos | 0 minimal · 2 acceptable · 1 convoluted |
| Aha (Veredito/Oportunidade/Props) | 1 clique na jornada mais usada |

> Limite deste relatório: nenhuma tela foi vista. Contagens de cliques, gates e
> textos vêm do código; itens de affordance estão marcados "suspected" nos arquivos
> das jornadas.

## Friction Scorecard

| Jornada | Passos (real/ideal) | Decisões desnecessárias | Re-entry | Dead ends | Veredicto |
|---|---|---|---|---|---|
| J1 Jogos → jogo → Props | 2 / 2 (Props); 1 até o Aha | 1 (12 abas/chips no jogo) | 0 | 1 (gate 402/403) | acceptable |
| J2 IA → pick | 1 até o Aha; 2 até o detalhe | 1 (detalhe abre em "Comparar", sem o pick) | 0 | 0 | acceptable |
| J3 Conta → assinatura | 4 no app + 3 campos / 3 | 1 (escolha de plano poderia ser default) | 0 | 1 (retorno do Stripe) | convoluted |

## Redundancy Map (condensado)

1. **3 rotas de "IA"** (`/supertips/palpites`, `/palpites-ia`, `/edge`) → eleger uma canônica.
2. **4 espelhos de terceiros** (`/forebet`, `/apitou`, `/kingstats`, `/nerdytips`) → manter recolhidos, não promover; reavaliar com analytics.
3. **2 caminhos para props** (aba do jogo × `/gameread`) → manter, renomear a global.
4. **4 verbos para assinar** → "Assinar VIP" em todas as superfícies.
5. **`TipsGate` ainda promete "sem assinatura"** → contradiz o Stripe (é bug de copy, não de fluxo).

## Simplification Proposals (ranked)

### 1. Paywall com próxima ação (J1 + J3)
- **Now**: `PropsTab` exibe a string do servidor numa caixa vermelha, sem CTA (`PropsTab.tsx:78`); `TipsGate` oferece "Ver acesso VIP" mas com texto de "não há assinatura" (`TipsGate.tsx:21,25`).
- **Proposed**: um componente de gate único (`PaywallCard`) com **um** botão "Liberar acesso" → `/planos?next=<rota atual>`, e copy alinhada ao Stripe.
- **Saves**: elimina 1 beco sem saída e 2 textos contraditórios; melhora J1 e J3.
- **Effort**: S.
- **Evidence**: J1 scorecard, J3 clarity, `TipsGate.tsx:21,25`.

### 2. Retorno do Stripe para o conteúdo de origem + refresh automático (J3)
- **Now**: sucesso cai em `/planos?status=sucesso`, sem ação além de "Voltar"; `AppContext` só lê `/api/auth/me` no mount, e a tela pede para recarregar.
- **Proposed**: `next` no metadata da sessão; no retorno, `refreshUser()` + redirect para `next` (fallback `/jogos`) com toast "VIP ativo".
- **Saves**: 1–2 passos e a hesitação "será que pagou?".
- **Effort**: M.
- **Evidence**: J3 scorecard (dead end + stale state), `planos/page.tsx:90-100`, `AppContext.tsx:56-64`.

### 3. Ordem das abas do jogo: Props em 2º (J1)
- **Now**: 8 abas + 4 chips; PROPS é a 7ª (`MatchClient.tsx:14-20`).
- **Proposed**: PROPS em 2º; os 4 chips secundários atrás de "Mais"; H2H REAL e JOGADORES para o fim.
- **Saves**: 0 cliques, mas reduz a varredura de 12 para ~9 alvos e coloca o diferencial na dobra.
- **Effort**: S.
- **Evidence**: J1 scorecard (decisões), take-away pass.

### 4. Detalhe do pick abrir na aba certa (J2)
- **Now**: `/supertips/jogo/[id]` sempre abre em "Comparar", sem o pick de origem.
- **Proposed**: `?tab=` no link do bloco e bloco inteiro clicável.
- **Saves**: 1 clique por consulta de pick; corrige a sensação de "cliquei no pick e não achei o pick".
- **Effort**: S.
- **Evidence**: J2 take-away pass.

## Already Minimal

- Entrada no app: a home logada (`/jogos`) já é o board, e a oportunidade do jogo é a **aba default** — o Aha está a 1 clique. Não mexer.
- `/config` bloco de planos: um texto, um status, dois botões. Passou o take-away test.
- Navegação global nova: nenhuma rota duplicada em `navigation.ts`; nada importante a 3+ níveis.
