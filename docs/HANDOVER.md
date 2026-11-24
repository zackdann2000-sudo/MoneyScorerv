# GreenScore — manual de bordo

Documento de handover. Explica **o que é**, **como está montado**, **quais regras
não podem ser quebradas** e **onde ainda falta obra**. Se você é a próxima pessoa
a mexer neste repositório, leia isto antes do primeiro commit.

Última atualização: véspera do lançamento (GTM), após a entrega de win-prob ao
vivo, Combo IA, alertas de gol, GA4 e checklist de produção.

---

## 1. O produto em cinco linhas

Plataforma de **análise esportiva quantitativa** (futebol) em Next.js. Em vez de
"palpite", entrega probabilidade calculada com modelo próprio, mostrando a
amostra que gerou o número e a odd do mercado ao lado. Tem Track Record público
(gravado antes do jogo, liquidado automaticamente), combinada com EV em odd da
Pinnacle e alertas de gol/kickoff por push. **Modelo de acesso atual: cadastro →
24h de acesso completo → 1 análise grátis por dia** (sem cobrança; ver §2.4).
**Não opera apostas** — é conteúdo analítico, 18+, sem promessa de lucro.

## 2. Arquitetura em camadas

```
fontes externas        ESPN (placar, eventos, stats) · Hub de odds (Pinnacle)
  ↓                    Sportmonks · Football-Data · API-Football · Bzzoiro …
  src/lib/hub/*        cascata de fornecedores + persistência (Drizzle/Postgres)
  ↓
engines (puras)        model, winProb, mercadosPoisson, playerPropsEngine,
  ↓                    blocoAnalises, h2hPalpite, comboBuilder, alertDiff,
                       veredito, duelosEngine, stripePolicy, trialPolicy…
  ↓
src/app/api/* (77)     rotas finas: cache + rate limit + validação + engine
  ↓
UI (46 páginas)        App Router, Tailwind, componentes por aba de jogo
```

**Regra de camada:** engine não importa banco nem `fetch`. Toda lógica de decisão
existe em `src/lib` com teste em `src/lib/*.test.cjs` — é o que permite rodar a
suíte inteira (37 arquivos) sem rede, sem banco e sem build.

### 2.1 APIs em cascata (por que o app não "quebra")

`src/lib/hub/cascade.ts` tenta fornecedores em ordem de qualidade e registra o
resultado de cada tentativa (`Attempt[]`): fixtures, odds, escalações e contexto
têm cada um sua cascata. Quando um provedor inteiro está fora, o app
**degrada para "sem dados"** naquele bloco — nunca preenche com número inventado.
A UI tem `sem dados` explícito para: xG, props, odds de mercado e EV.

### 2.2 Pinnacle é a âncora do EV — e nada mais

`src/lib/oddsPinnacle.ts` lê `hub_bookmaker_odd` e aceita **somente**
`bookmaker_slug === "pinnacle"`. Sem essa linha: a perna entra no bilhete com a
odd disponível, mas **sem EV** (`oddPinnacle: null`). Não existe fallback para
casa menor — odd de casa pequena infla EV artificialmente. Cobertura atual da
Pinnacle no hub: **1X2, BTTS e Over/Under**. Consequência honesta: player props
aparecem sem EV até existir um feed de props da Pinnacle.

### 2.3 Onde cada coisa vive

| Assunto | Arquivo |
|---|---|
| Modelo 1X2 / bloco de análises | `src/lib/model.ts`, `blocoAnalises.ts` |
| Win-prob ao vivo | `src/lib/winProb.ts` + `components/match/WinProbChart.tsx` |
| Combinada IA | `comboBuilder.ts`, `oddsPinnacle.ts`, `api/combos/build` |
| Alertas ao vivo | `alertDiff.ts` (puro) + `api/cron/live` + `alertScan.ts` (legado) |
| Track Record | `credibility.ts`, `trackRecord.ts`, `api/track-record(/run)` |
| Acesso/trial | `auth.ts`, `trialPolicy.ts`, `quota.ts` |
| Pagamentos | `stripe.ts`, `stripePolicy.ts`, `api/stripe/*`, `api/webhooks/stripe` |
| Analytics | `lib/analytics.ts` + `components/AnalyticsPageview.tsx` |

### 2.4 Monetização em standby (leia antes de “consertar” o Stripe)

**Não há vendas.** O acesso é: cadastro por e-mail → 24h completas → 1 análise
grátis por dia (`quota.ts`, contador zera à meia-noite de Brasília).

- O interruptor é `VENDAS_ATIVAS` em **`src/lib/vendas.ts`**. Com `false`, a UI
  não renderiza botão de assinatura em nenhum lugar (landing, `/config`,
  `PaywallCard`, `/ev`, `/edge`, `/palpites`, `BetSlipDock`), `CtaTrial` assume o
  papel de CTA e `/planos` vira página informativa com `robots: noindex`.
- O código do Stripe **continua no repositório e testado** (`api/stripe/*`,
  `api/webhooks/stripe`, `stripe.ts`, `stripePolicy.ts`). Se alguém chamar
  `/api/stripe/checkout` direto, responde 503 sem `STRIPE_SECRET_KEY`.
- Reativar = `VENDAS_ATIVAS = true` + envs do Stripe + restaurar `/planos` no
  sitemap e remover o noindex. Passo a passo em `docs/DEPLOY_CHECKLIST.md` §2.
- O evento GA4 `purchase` vivia dentro de `/planos` (quando ela era o retorno do
  checkout). Ao reativar, restaurar o `trackOnce("purchase", ...)` na tela de
  sucesso — senão o funil para em `begin_checkout` para sempre.

### 2.5 Pipeline de dados: por que o app pode abrir sem jogos

Duas coisas separadas, e é importante não confundir:

| Tela | De onde vem | Se falhar |
|---|---|---|
| `/jogos`, `/ao-vivo` | **ESPN ao vivo** (`api/matches` → `lib/espn.ts`), sem banco no meio | fonte fora ⇒ lista vazia; a rota devolve `error`/`degradado` e a tela mostra “Buscando jogos do dia…” com retry e polling de 30s |
| Hub (`/ev`, `/edge`, `/hub`, análise) | **Neon**, preenchido pelo cron diário | cron não rodou ⇒ tabelas vazias ⇒ páginas com empty state |

O Hub roda em **3 fases** (orçamento 45s cada): `fase=fixtures` (04h UTC) →
`fase=context` (06h) → `fase=analyze` (07h). Foi dividido porque a função pode ser
morta no meio de uma escrita quando o Hub inteiro roda numa invocação — e o
sintoma é exatamente “abriu vazio”.

Quem agenda é um **agendador externo** (cron-job.org, grátis), não a Vercel: o
plano Hobby aceita poucos cron jobs por projeto, então `vercel.json` mantém apenas
`?acao=apitou` (03h) e `/api/track-record/run` (13h). As fases, os rankings, a
sonda e o watcher de gol rodam de fora — a rota não depende de quem a chama.
Configuração: `docs/DEPLOY_CHECKLIST.md` §5.1.

Sonda, sem escrever nada: `GET /api/cron/diario?acao=pipeline` (com
`Authorization: Bearer $CRON_SECRET`). Devolve `cobertura` (`ok` / `magra` /
`vazia`), fixtures por dia, `comOdd`, `ultimaEscrita` e quais chaves de fonte
existem. `&ping=1` faz **uma** chamada à ESPN para provar que a fonte responde.
Se `cobertura: "vazia"`, o `/jogos` vai abrir sem partidas — esse é o alarme.

## 3. Regras de negócio inegociáveis

| Regra | Onde está travada |
|---|---|
| **EV só com odd da Pinnacle.** Sem âncora, o EV é escondido, nunca estimado. | `oddsPinnacle.ts` (filtro por slug) + `comboBuilder.ts` |
| **Perna correlacionada não tem EV.** BTTS + over no mesmo jogo é dependente; multiplicar probabilidades infla o número. Mostra aviso e esconde o EV. | `comboBuilder.motivoCorrelacao` + teste |
| **Dado ausente aparece como "sem dados".** Nada de preencher lacuna com média inventada. | todas as engines + UI |
| **Track Record não é editável.** Pick gravado antes do jogo, liquidado por cron; red fica na lista; ROI só conta pick com odd publicada. | `credibility.ts` |
| **Falha de pagamento NÃO revoga acesso.** Só cancelamento (`subscription.deleted`) e reembolso (`charge.refunded`). | `stripePolicy.ts` + `stripePolicy.test.cjs` (10 tipos travados) |
| **Alertas só para opt-in explícito**, com dedupe por `matchId:gol:H-A` e poda de 7 dias. | `alertDiff.destinatarios` + teste |
| **Trial anti-fraude sem punir rede compartilhada:** device é bloqueio primário, IP é binário (1 trial/IP); a conta sempre é criada, só o bônus é negado — e o usuário é avisado. | `trialPolicy.ts` + toast em `/cadastro` |
| **Push só com par VAPID completo na env.** Pública de fallback + privada nova = assinatura inválida e falha silenciosa. | `push.ts` (`VAPID_ENABLED`) |
| **Webhook é idempotente** (`eventoJaProcessado`) e verifica assinatura no corpo cru. | `api/webhooks/stripe` |

## 4. Estado de maturidade

| Frente | Estado | Observação |
|---|---|---|
| Modelo 1X2 + bloco de análises | ✅ pronto | Poisson com peso por recência e xG no λ |
| Mercados (Poisson) + Radar de oportunidades | ✅ pronto | EV filtrado por Pinnacle |
| Player props (6 mercados) | ✅ pronto, sem EV | falta feed de props da Pinnacle |
| Win-prob ao vivo | ✅ pronto | reusa payload do momentum; exige lance real |
| Combo IA (backend + UI) | ✅ pronto | até 3 perfis; EV oculto em correlação |
| Alertas gol/kickoff | ✅ código pronto | **agendamento depende de cron-job.org** (Hobby não aceita 1/min) |
| Track Record | ✅ pronto | KPIs no topo, empty state, aviso de amostra pequena |
| Pagamentos | ⏸️ standby | código pronto e testado; `VENDAS_ATIVAS = false`, UI sem checkout |
| Analytics de funil | ✅ pronto | depende da env `NEXT_PUBLIC_GA_ID` |
| PWA + push web | ✅ pronto | clique no push abre a partida (`data.gs`) |
| SEO (metadata/OG/sitemap) | ✅ pronto | posicionamento quantitativo + ao vivo |

### 4.1 Dívidas técnicas conhecidas (ordem sugerida)

1. **Props sem EV** — resolver com feed de odds de jogador (Pinnacle) ou assumir
   publicamente que props são modelo-only.
2. **Alertas fases 4–6** — quiet hours, cap diário por usuário, notificação de fim
   de jogo pelo watcher novo (hoje é o motor legado que faz).
3. **`scanLiveAlerts` legado** — faz `summary` por jogo; o watcher novo já faz tudo
   em lote. Quando o novo estiver validado em produção, aposentar o antigo e o
   `/api/alerts/feed` passa a ler só do cron novo.
4. **Recuperação de senha** — não há rota; é o item "must" mais visível do recon.
5. **Cron de 1 minuto** — migrar para Vercel Pro (uma linha em `vercel.json`) ou
   manter o agendador externo.
6. **Repositório público** — qualquer segredo novo deve entrar só por env; o
   `.env.example` é a fonte de verdade do que existe.

## 5. Rodar e validar

```bash
npm install
cp .env.example .env.local     # preencha DATABASE_URL e o que for testar
npx drizzle-kit push           # schema
npm run dev                    # http://localhost:3000

npx tsc --noEmit               # tipos (é o gate usado em toda entrega)
./scripts/unit-tests.sh        # 37 suítes puras, sem rede e sem banco
./scripts/unit-tests.sh alerta # filtra por nome
```

Convenções do projeto:

- Erro de rede/API nunca derruba a rota: devolve o campo vazio e a UI mostra
  "sem dados".
- Rota com I/O declara `dynamic = "force-dynamic"` e passa por `rateLimit`.
- Texto de UI em português, sem promessa de lucro, sempre 18+ nas telas de venda.

## 6. Runbooks

| Preciso… | Documento |
|---|---|
| Ligar o watcher de gol em 1 min | `docs/SETUP_ALERTAS_CRON.md` |
| Ir para produção / Stripe live | `docs/DEPLOY_CHECKLIST.md` |
| Lançar / responder cético no anúncio | `docs/GTM_PLAYBOOK.md` |
| Entender o plano original de features | `replica/plano_features.md`, `replica/matchanalyze/` |
| Ver o que o mercado faz e o que copiamos de conceito | `replica/*/recon.md` |

## 7. O que este projeto deliberadamente NÃO faz

- Não promete lucro, não publica "green do dia", não apaga red do histórico.
- Não opera, intermedeia ou recebe depósito de aposta.
- Não mostra EV quando não há odd de referência.
- Não inventa estatística para preencher buraco de provedor.
- Não notifica quem não pediu alerta.
- Não vende assinatura nesta fase (o Stripe está em standby, não “quebrado”).

Se uma mudança futura quebrar qualquer linha desta lista, ela quebra o produto —
não é preferência de estilo.
