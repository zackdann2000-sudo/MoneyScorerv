# J3 — Aba Conta → assinatura

**Evidência:** código. `src/components/Shell.tsx` (aba Conta), `src/app/config/page.tsx:118-171`,
`src/app/planos/page.tsx:56-70,90-100`, `src/app/api/stripe/checkout/route.ts`,
`src/app/api/webhooks/stripe/route.ts`, `src/context/AppContext.tsx:56-64`.

## Friction Scorecard

| Métrica | Valor | Evidência |
|---|---|---|
| Passos no app | **4** | aba Conta → rolar até #planos → "Assinar VIP no cartão" → escolher plano/“Assinar VIP” |
| Passos no Stripe | **3 campos** | cartão, validade, CVC (+ e-mail já vem do `customer`) |
| Ideal | 3 | ver oferta → pagar → voltar ao conteúdo |
| Decisões | 1 desnecessária | **2 planos** com o anual pré-destacado; 90% escolhe o anual pelo selo "ECONOMIZE 30%" — poderia ser o default do botão |
| Re-entry | 0 | checkout usa `customer` já existente (correto) |
| Dead end | **1** | tela de retorno `/planos?status=sucesso` só tem "Voltar" no topo; não há "ir para o que eu queria ver" |
| Hesitação | **alta** | o estado VIP não atualiza sozinho após o pagamento (`AppContext` busca `/api/auth/me` apenas no mount) — a própria tela manda "recarregue em alguns segundos" |

**Medido:** passos, campos, estado do refresh, texto da tela de sucesso.
**Suspected:** latência do webhook (o usuário pode ver "sucesso" antes do banco atualizar).

## Take-away Pass

- **`/config` bloco planos** — já enxuto: um texto, um status, dois botões. Nada removível.
- **`/planos`** — o que não paga aluguel:
  - **card duplicado do plano anual** destacado + preço "por mês" + preço cheio no mesmo bloco: 3 números para a mesma compra; o `precoMes` é o que decide.
  - bloco "O que você recebe" repete benefícios que o funil já prometeu (landing e gate).
  - banner `status=sucesso` e banner "já é VIP" podem aparecer juntos.
- **Retorno do Stripe** — nenhuma ação primária. A única "ação" é um link cinza "Voltar".

## The Simpler Version

1. Aba Conta.
2. Bloco único com **um** botão primário: "Assinar VIP — R$ 20,83/mês no plano anual" (mensal como link secundário).
3. Stripe: 3 campos.
4. Retorno direto para **o conteúdo que a pessoa tentou abrir** (ou `/jogos`), já com `refreshUser()`, e um toast "VIP ativo".

Mudanças concretas: um CTA por tela; `?next=` no checkout (guardado na sessão) para
voltar ao jogo de origem; chamar `refreshUser()` na tela de sucesso; trocar
"recarregue em alguns segundos" por atualização automática.

## Clarity Issues

- O texto de retorno admite falha de sincronização ("Se ainda aparecer bloqueado, recarregue") — linguagem de bug na tela de dinheiro.
- "Assinar VIP", "Seja VIP", "Ver acesso VIP" e "Liberar VIP": quatro verbos para a mesma ação.
- `TipsGate` promete "Não há assinatura" e "administrador libera o VIP" — o oposto do que a `/planos` vende agora.

Verdict: **convoluted** (faltam 1–2 passos no app, a tela de retorno é beco sem saída e o estado pós-pagamento não se atualiza sozinho — 3 heurísticas falhando: #1, #5, #7).
