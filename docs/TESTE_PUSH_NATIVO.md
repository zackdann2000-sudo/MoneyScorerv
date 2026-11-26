# Teste de Push Nativo (FCM) — rota temporária

Rota de diagnóstico criada para validar de ponta a ponta o push **nativo** do
GreenScore (notificação que aparece na tela de bloqueio com o app **fechado**).

- **Arquivo:** `src/app/api/cron/test-push/route.ts`
- **Endpoints:** `GET` e `POST /api/cron/test-push`
- **Status:** temporária — **apagar após o teste** (dispara para toda a base).

## O que ela faz

1. Lê todos os tokens de `fcm_tokens` (uma query, deduplicados).
2. Envia pelo `sendFcmToTokens` (`src/lib/fcm.ts`) — o **mesmo caminho** do
   alerta de gol em `/api/cron/live`.
3. Payload fixo, idêntico ao de um gol:

   ```
   title: "⚽ Teste GreenScore"
   body:  "Se você recebeu isso com o app fechado, o Push Nativo está funcionando!"
   ```

   (`url: "/"`, `tag: "teste-greenscore"`, `data: { tipo: "teste", url: "/" }`)

4. Remove do banco os tokens que a FCM devolver como inválidos (`UNREGISTERED`,
   `NOT_FOUND`, `INVALID_ARGUMENT`).

## Segurança

Auth via `src/lib/cronAuth.ts` — o mesmo `CRON_SECRET` do resto do projeto
(`CRON_SECRET_V2` tem precedência). Formas aceitas:

- `Authorization: Bearer $CRON_SECRET` (Vercel Cron)
- `x-cron-secret: $CRON_SECRET` ou `?secret=$CRON_SECRET` (manual/curl)

Falha fechada: sem segredo configurado responde **503**; segredo errado **401**.
Título e corpo são constantes no servidor — nada vem do visitante (diferente da
antiga `/api/testar-alerta`, que era pública).

## Como testar

**1. Dry-run** — valida infra + tokens, **não envia** push:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://SEU-DOMINIO.vercel.app/api/cron/test-push?dry=1"
```

Confira no retorno: `fcmConfigurado: true`, `tokens` > 0.

Se `tokens` for 0: abra o app, permita notificações e registre o token antes.

**2. Push real** — feche o app no celular primeiro:

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://SEU-DOMINIO.vercel.app/api/cron/test-push"
```

## Como ler a resposta

| Campo | Significado |
| --- | --- |
| `ok` | `true` só se **todos** os tokens aceitaram |
| `tokens` | tokens encontrados em `fcm_tokens` |
| `enviados` | pushes aceitos pela FCM |
| `falhas` | pushes recusados |
| `removidos` | tokens inválidos apagados do banco |
| `erro` | motivo da recusa da FCM, quando houver |

Status HTTP: `200` tudo ok · `207` parcial · `502` nenhum saiu · `503` sem
`CRON_SECRET` no runtime · `401` segredo errado.

## Checklist de falhas comuns

- **503 com "nenhum segredo configurado"** → falta `CRON_SECRET` (ou
  `CRON_SECRET_V2`) nas envs da Vercel no escopo **Production**; depois Redeploy.
- **`fcmConfigurado: false`** → faltam `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL` ou
  `FCM_PRIVATE_KEY` (PEM com `\n` literais é aceito).
- **`tokens: 0`** → o app não registrou o token (`POST /api/push/fcm-token`).
- **`enviados > 0` mas o celular ficou quieto** → permissão de notificação
  negada, "Não perturbe" ativo, ou o app está em primeiro plano em algumas
  versões do Android.

## Remoção

Depois que o push chegar no celular:

```bash
rm -rf src/app/api/cron/test-push
```

Não está no `vercel.json`, então não existe cron agendado apontando para ela.
