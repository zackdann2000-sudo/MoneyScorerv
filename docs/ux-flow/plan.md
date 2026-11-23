# ux-flow — plano da execução (2026-06-XX)

## Preflight

| Item | Estado |
|---|---|
| `docs/ux-paths/catalog.md` | **ausente** — o catálogo do `ux-paths` nunca foi gerado neste projeto |
| Artefatos do `ux-walker` | ausentes (`docs/ux-walker/` não existe) |
| Browser (`agent-browser` / Chromium) | **indisponível** no Termux (sem binário, sem servidor local) |

**Consequência:** não houve passagem visual. As jornadas abaixo foram medidas
**no código** (rotas, links, gates, contagem de cliques), com arquivo e linha como
evidência. Itens marcados "suspected" precisam de conferência visual.

## Jornadas escolhidas (foco: caminho até o "Aha moment")

| ID | Jornada | Aha esperado |
|---|---|---|
| J1 | Jogos → jogo → props | Oportunidades/Props com probabilidade e amostra |
| J2 | IA → pick | Pick com odd, TRUST e EV |
| J3 | Conta → assinatura | Pagamento concluído e acesso ativo |

## Redundancy Candidates (hipóteses a checar)

- 5 superfícies de "IA": `/supertips/palpites`, `/palpites-ia`, `/edge`, `/forebet`, `/nerdytips`.
- 4 telas espelho de terceiros: `/apitou`, `/kingstats`, `/nerdytips`, `/forebet`.
- "Props" aparece em 2 lugares: aba PROPS do jogo (`/jogos/[id]`) e `/gameread`.
- "Classificação" em 2 lugares: `/hub/classificacao` e aba CLASSIFICAÇÃO dentro do jogo.
- Gate VIP repetido em 6 pontos (`TipsGate` + `VipLock`).
