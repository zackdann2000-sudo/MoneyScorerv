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
- [ ] **Fim do trial**: esperar as 24h (ou ajustar `expiresAt` no banco) e conferir o
      modal “Seu período de teste de 24h acabou”, com o limite de 1 análise/dia.
- [ ] Cadastro no MESMO device → deve cair na tela “teste de 24h já usado”, com a
      conta em `free` (sem VIP).
- [ ] PWA instalável no Android (manifest + service worker `sw.js`).

## 6. Monitoramento e rollback

- [ ] Alertas de falha do cron-job.org ligados (2 falhas seguidas → e-mail).
- [ ] Vercel → *Logs* filtrados por `[stripe]` e `[stripe/webhook]` na primeira semana.
- [ ] Rollback: Vercel → Deployments → *Promote* no deploy anterior (instantâneo).
      Se o problema for o Stripe, basta desativar o endpoint — o acesso dos VIPs
      atuais continua válido até `expiresAt`.
- [ ] Se precisar pausar vendas sem derrubar o app: remover `STRIPE_SECRET_KEY`
      de Production faz `/api/stripe/checkout` responder 503 com mensagem amigável.
