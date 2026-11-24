# Checklist de Produção — GreenScore

> **Estado atual: vendas PAUSADAS.** O produto é cadastro por e-mail → 24h de
> acesso completo → 1 análise grátis por dia. Nenhuma tela oferece assinatura e
> `/planos` é uma página informativa (`noindex`). O Stripe fica em **standby**: o
> código continua no repositório e testado, mas as seções **2 e 2.3** deste
> documento só valem no dia em que a venda voltar.

Ordem de execução. Para lançar sem vendas, vá de 0 → 1 → 3 (só as envs
não-Stripe) → 4 → 5 → 6.

---

## 0. Antes de tocar em produção

- [ ] `main` verde: `npx tsc --noEmit` **e** `./scripts/unit-tests.sh` (hoje: 37 suítes).
- [ ] `vercel.json` **sem** cron de 1 minuto (o Hobby recusa e o deploy falha). O
      watcher de gol roda por agendador externo — ver `docs/SETUP_ALERTAS_CRON.md`.
- [ ] `vercel.json` com **no máximo 2 crons** (limite do Hobby): apitou 03h e
      track-record 13h UTC. Hub, rankings e sonda vão no cron-job.org (§5.1).
- [ ] Nenhuma chave de teste commitada: `git grep -n "sk_test"` não deve achar nada.
- [ ] O repositório é público: nenhum segredo em código, só em env.

## 1. Banco de dados (Neon / Postgres)

- [ ] Criar o banco de produção (região mais próxima dos usuários; `sa-east-1` para BR).
- [ ] `DATABASE_URL` de produção usa `sslmode=require` e o usuário da aplicação
      (não o `postgres` superuser).
- [ ] Aplicar o schema: `npx drizzle-kit push` (ou `generate` + `migrate`) apontando
      para o banco de produção **com a `DATABASE_URL` de produção exportada**.
- [ ] Conferir as tabelas: `users`, `alert_prefs`, `alert_state`, `push_subs`,
      `fcm_tokens`, `hub_bookmaker_odd`, `predictions`, `payment_events`.
- [ ] Habilitar backup/PITR no provedor (Neon: *Restore window* ≥ 7 dias).

## 2. Stripe — ⏸️ STANDBY (pular enquanto a venda estiver pausada)

Nada aqui é necessário para lançar. Com `VENDAS_ATIVAS = false`, a UI não expõe
checkout, `/api/stripe/checkout` responde 503 se alguém chamar direto e o trial de
24h é concedido pelo cadastro, sem passar por pagamento.

Para reativar a venda, nesta ordem:

- [ ] Trocar `VENDAS_ATIVAS` para `true` em `src/lib/vendas.ts` (é o único switch:
      devolve os botões em `/planos`, `/config`, `PaywallCard`, landing e CTAs).
- [ ] Restaurar a entrada `/planos` no `src/app/sitemap.ts` e remover o `robots:
      noindex` de `src/app/planos/page.tsx`.
- [ ] Seguir as subseções 2.1 → 2.3 abaixo.

### 2.1 Stripe CLI no ambiente local

```bash
# macOS (Homebrew), Linux (script oficial) ou Scoop no Windows.
brew install stripe/stripe-cli/stripe
stripe login                                  # abre o navegador, autoriza a conta
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

O `stripe listen` imprime um `whsec_...` de desenvolvimento. Coloque esse valor em
`STRIPE_WEBHOOK_SECRET` no `.env` local e reinicie o `npm run dev`. Esse segredo é
**diferente** do de produção — não reaproveite.

Em outro terminal, dispare cada evento e confira o log da rota:

```bash
# 1. pagamento aprovado → concede VIP
stripe trigger checkout.session.completed
# 2. renovação → estende VIP
stripe trigger invoice.paid
# 3. cartão recusado → ACESSO MANTIDO (a regra inegociável)
stripe trigger invoice.payment_failed
# 4. cancelamento → revoga
stripe trigger customer.subscription.deleted
# 5. reembolso → revoga
stripe trigger charge.refunded
```

- [ ] `invoice.payment_failed` responde `200` e o log diz **"Acesso mantido"**
      (nenhuma linha `acesso revogado` aparece).
- [ ] `customer.subscription.deleted` responde `200` e loga `acesso revogado`.
- [ ] Reenviar o MESMO evento duas vezes
      (`stripe events resend evt_...`) → a segunda resposta traz `duplicado:true`
      e os dias **não** somam de novo.
- [ ] Nenhuma assinatura válida do Stripe foi recusada (erro 400 no log = segredo
      errado).

### 2.2 Webhook em produção

- [ ] Dashboard → **Developers → Webhooks → Add endpoint**.
- [ ] URL: `https://SEU_DOMINIO/api/webhooks/stripe`.
- [ ] Eventos **exatamente estes cinco** (a rota ignora o resto de propósito):
      `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
      `customer.subscription.deleted`, `charge.refunded`.
- [ ] Copiar o **Signing secret** (`whsec_...`) → env `STRIPE_WEBHOOK_SECRET` na Vercel (Production).
- [ ] Enviar um evento de teste pelo painel (**Send test event**) e confirmar `200`.

### 2.3 Chaves live

- [ ] Ativar a conta Stripe (dados da empresa, conta bancária, documento).
- [ ] Criar os dois **produtos/preços** em modo live (mensal e anual, recorrentes).
- [ ] `STRIPE_SECRET_KEY` = `sk_live_...` (Vercel → Production **apenas**).
- [ ] `STRIPE_PRICE_MENSAL` e `STRIPE_PRICE_ANUAL` = os `price_...` **live**
      (os IDs de teste não funcionam em live e vice-versa).
- [ ] `pk_live_...` só é necessária se o front usar Stripe.js/Elements; hoje o
      checkout é redirect server-side, então não há chave pública no código.
- [ ] Portal do cliente: **Settings → Billing → Customer portal** ativo, com
      cancelamento e troca de cartão liberados.
- [ ] Testar um pagamento real de valor baixo (cupom de 100% ou preço de R$ 1) e
      **reembolsar** em seguida — confirma que concede e revoga de ponta a ponta.

## 3. Envs na Vercel (Production)

Obrigatórias:

| Variável | Nota |
|---|---|
| `DATABASE_URL` | Postgres de produção |
| `NEXT_PUBLIC_SITE_URL` | `https://SEU_DOMINIO` (canonical/OG e URL dos pushes) |
| `APP_URL` | mesma URL (redirects do Stripe) |
| `STRIPE_SECRET_KEY` | `sk_live_...` — **só com vendas ativas** |
| `STRIPE_PRICE_MENSAL`, `STRIPE_PRICE_ANUAL` | `price_...` live — **só com vendas ativas** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` do endpoint de produção — **só com vendas ativas** |
| `CRON_SECRET` | segredo dos crons diários |
| `LIVE_CRON_SECRET` | segredo do watcher de gol (ver `docs/SETUP_ALERTAS_CRON.md`) |
| `OWNER_EMAILS` | e-mails com acesso vitalício, separados por vírgula |
| `SPORTMONKS_TOKEN`, `FOOTBALL_DATA_TOKEN`, `API_FOOTBALL_KEY`, `BZZOIRO_TOKEN` | fontes de dados |
| `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | push Android |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | push web (`mailto:` no subject). O push só liga com o **par vindo da env** — a pública tem fallback no código e misturar as duas invalida a assinatura. |
| `ONESIGNAL_REST_API_KEY` | se usar o canal OneSignal |
| `NEXT_PUBLIC_GA_ID` | GA4 (`G-...`). Vazio = nenhum script de terceiro carregado. |

- [ ] Nada de env de teste em Production; use *Preview* para experimentos.
- [ ] `FCM_PRIVATE_KEY` com `\n` literais (a lib troca por quebra de linha real).
- [ ] Depois de qualquer mudança de env: **Redeploy** (env não entra em build já feito).

## 4. Domínio, TLS e SEO

- [ ] Domínio apontado na Vercel (`A`/`CNAME` conforme o painel) e certificado emitido.
- [ ] `NEXT_PUBLIC_SITE_URL` sem barra no final.
- [ ] `https://SEU_DOMINIO/robots.txt` e `/sitemap.xml` respondendo 200.
- [ ] `https://SEU_DOMINIO` com OG correto (testar em opengraph.xyz).
- [ ] Redirecionar `www` para o apex (ou o contrário) — um só domínio canônico.
- [ ] `/termos` e `/privacidade` no ar (exigência de gateway e de anúncios).

## 5. Pós-deploy — smoke test (5 minutos)

- [ ] `/` renderiza a landing; `/cadastro` cria conta e cai em `/jogos`.
- [ ] Cadastro novo ganha 24h de VIP e o banner do trial mostra o contador.
- [ ] `/planos` mostra a página informativa (sem botão de assinatura) e não é indexada.
- [ ] `/config` não exibe “Assinar VIP” nem portal do Stripe.
- [ ] Webhook: `Developers → Webhooks → attempts` com `200` nas últimas entregas.
- [ ] `curl "https://SEU_DOMINIO/api/cron/live?secret=$LIVE_CRON_SECRET&debug=1"` → `ok:true`.
- [ ] Cron diário rodou (`/api/cron/diario?acao=apitou` com `Authorization: Bearer $CRON_SECRET`).
- [ ] Hub nas 3 fases (na mão, ou esperar o cron-job.org): `?acao=hub&fase=fixtures`,
      `&fase=context`, `&fase=analyze` → cada uma `200` em menos de 45s. A fase é
      idempotente: rodar de novo não duplica nada.
- [ ] **Sonda de dados**: `curl -H "Authorization: Bearer $CRON_SECRET"
      "https://SEU_DOMINIO/api/cron/diario?acao=pipeline&ping=1"` → `cobertura: "ok"`
      e `ping.jogos > 0`. Se vier `vazia`, o `/jogos` vai abrir sem partidas —
      verifique `fontes` e a saúde da ESPN antes de divulgar o link.
- [ ] `/jogos` com a base recém-criada mostra “Buscando jogos do dia…”, não tela branca.
- [ ] **Fim do trial**: esperar as 24h (ou ajustar `expiresAt` no banco) e conferir o
      modal “Seu período de teste de 24h acabou”, com o limite de 1 análise/dia.
- [ ] Cadastro no MESMO device → deve cair na tela “teste de 24h já usado”, com a
      conta em `free` (sem VIP).
- [ ] PWA instalável no Android (manifest + service worker `sw.js`).

## 5.1 Agendador externo (cron-job.org) — grátis e sem limite de jobs

A Vercel fica com **2 crons** (o Hobby limita o projeto): `?acao=apitou` às 03:00 UTC
e `/api/track-record/run` às 13:00 UTC. Todo o resto — Hub em 3 fases, rankings,
sonda de dados e o watcher ao vivo de 1 minuto — roda no **cron-job.org** (conta
gratuita, execução a cada minuto, várias dezenas de jobs).

Nada aqui é exclusivo da Vercel: cada job é um `GET` na mesma rota, autenticado com
o `CRON_SECRET`. Ordem entre os jobs é irrelevante para a integridade (tudo é
idempotente), mas `fixtures` precisa vir **antes** de `context`, e `context` antes
de `analyze` — é o que dá conteúdo à análise.

| # | Job | URL (query) | Quando (UTC) | O que prova que rodou |
|---|---|---|---|---|
| 1 | Hub fixtures | `/api/cron/diario?acao=hub&fase=fixtures` | 04:00 diário | `hub.fixtures.byDate` com `fixtures > 0` |
| 2 | Rankings | `/api/cron/diario?acao=rankings` | 05:00 diário | `rankings.falhas: 0` |
| 3 | Hub contexto | `/api/cron/diario?acao=hub&fase=context` | 06:00 diário | `hub.context.fixtures > 0` |
| 4 | Hub análise | `/api/cron/diario?acao=hub&fase=analyze` | 07:00 diário | `hub.analysis.ok` e `hub.settle` |
| 5 | Sonda | `/api/cron/diario?acao=pipeline` | 09:00 diário | `pipeline.cobertura: "ok"` |
| 6 | Watcher ao vivo | `/api/cron/live?secret=SEU_LIVE_CRON_SECRET` | a cada 1 min | `ok:true` (ver `docs/SETUP_ALERTAS_CRON.md`) |

### Passo a passo (repita para cada job)

1. <https://cron-job.org> → **Create cronjob**.
2. **Title**: `GreenScore · hub fixtures` (um nome por job, para o e-mail de falha
   dizer qual quebrou).
3. **URL**: `https://SEU_DOMINIO/api/cron/diario?acao=hub&fase=fixtures`.
4. **Schedule**: *Every day at* `04:00`, fuso **UTC** (a rota pensa em UTC; o
   horário de Brasília muda com o horário de verão de outros países).
5. **Advanced → Headers**: `Authorization: Bearer SEU_CRON_SECRET`
   (a rota também aceita `?secret=SEU_CRON_SECRET` na URL — use o header, que não
   fica em log de proxy).
6. **Advanced → Timeout**: suba para **60 s**. O orçamento de cada fase é 45 s; com
   o timeout padrão o job pode ser cortado no meio e a resposta não dizer nada.
   Se o seu plano não deixar passar de 30 s, chame com `&hubBudget=25` — a fase
   para sozinha antes do corte e continua na próxima execução.
7. Marque **Save responses** (histórico) e **Notify on failure** (2 falhas
   seguidas). Sem isso, uma fase falhando é invisível — foi exatamente o que já
   aconteceu com o Hub.
8. **Test run** antes de salvar: precisa voltar **HTTP 200**.

### Testar cada job na mão (uma vez, sem laço)

```bash
BASE="https://SEU_DOMINIO/api/cron/diario"
AUTH="Authorization: Bearer SEU_CRON_SECRET"

curl -sS -H "$AUTH" "$BASE?acao=hub&fase=fixtures" | head -c 400
curl -sS -H "$AUTH" "$BASE?acao=hub&fase=context"  | head -c 400
curl -sS -H "$AUTH" "$BASE?acao=hub&fase=analyze"  | head -c 400
curl -sS -H "$AUTH" "$BASE?acao=rankings"          | head -c 400
curl -sS -H "$AUTH" "$BASE?acao=pipeline&ping=1"   | head -c 400
```

- `401` → header/segredo errado. `503` → nenhum segredo configurado na Vercel
  (falha fechada de propósito).
- `hub.skipped` com `reason: "orçamento de tempo esgotado"` → a fase fez mais
  trabalho do que cabia em 45 s; rode de novo (é idempotente) ou aumente o
  `hubBudget`.
- `pipeline.cobertura: "vazia"` → **não divulgue o link**: o `/jogos` vai abrir
  sem partidas. `pipeline.fontes` mostra qual chave falta (a ESPN é pública).

### Alternativas ao cron-job.org

EasyCron, Upstash QStash (schedule), GitHub Actions (`schedule:` atrasa em picos) ou
`crontab` em qualquer VPS:

```cron
0 4 * * * curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" "$BASE?acao=hub&fase=fixtures" >/dev/null
0 5 * * * curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" "$BASE?acao=rankings" >/dev/null
0 6 * * * curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" "$BASE?acao=hub&fase=context" >/dev/null
0 7 * * * curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" "$BASE?acao=hub&fase=analyze" >/dev/null
0 9 * * * curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" "$BASE?acao=pipeline" >/dev/null
```

## 6. Monitoramento e rollback

- [ ] Alertas de falha do cron-job.org ligados (2 falhas seguidas → e-mail).
- [ ] Vercel → *Logs* filtrados por `[stripe]` e `[stripe/webhook]` na primeira semana.
- [ ] Rollback: Vercel → Deployments → *Promote* no deploy anterior (instantâneo).
      Se o problema for o Stripe, basta desativar o endpoint — o acesso dos VIPs
      atuais continua válido até `expiresAt`.
- [ ] Se precisar pausar vendas sem derrubar o app: remover `STRIPE_SECRET_KEY`
      de Production faz `/api/stripe/checkout` responder 503 com mensagem amigável.
