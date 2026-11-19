# Recon estático — Sports Alert 1.3.7 (com.sportsalert.app)

Análise **estática e leve** no Termux (sem jadx/apktool/decompilação completa).
Fonte: `Sports+Alert_1.3.7_APKPure.xapk` (89 MB) → split bundle.

## 1. Artefato

| Campo | Valor |
|---|---|
| XAPK | `Sports+Alert_1.3.7_APKPure.xapk` (ZIP, 22 entradas) |
| Base APK | `com.sportsalert.app.apk` (66,9 MB) |
| Package | `com.sportsalert.app` |
| Version | 1.3.7 (code 104) |
| min/target SDK | 24 / 36 |
| Stack | **React Native + Expo (prebuild)**, bytecode **Hermes** |
| Split configs | 19 (`config.arm64_v8a`, idiomas, xxhdpi) |

### Extração usada
```bash
unzip -o "Sports+Alert_1.3.7_APKPure.xapk"            # XAPK é um ZIP de APKs
unzip -o com.sportsalert.app.apk "classes*.dex" "AndroidManifest.xml" "assets/*" -d base
strings -n 6 base/assets/index.android.bundle         # JS Hermes (string table é UTF-8 legível)
strings -n 8 base/classes*.dex                        # 7 dex
```
`assets/index.android.bundle` (4,8 MB) é **Hermes bytecode** → não é JS legível, mas as
strings literais permanecem na tabela de strings, o que permitiu extrair URLs e headers.

## 2. Domínios e hosts

| Host | Uso |
|---|---|
| **`api.sportsalert.ai`** | **API própria (backend principal)** — host inferido do trecho `base.replace('sportsalert.ai','api.sportsalert.ai').replace('sporalarm.com','api.sportsalert.ai')` |
| `staging.sportsalert.ai` | ambiente de staging (mesma API, prefixo `staging.`) |
| `sportsalert.ai` | site institucional (`/privacy.html`, `#how-it-works`) |
| `u.expo.dev/4dc7854f-6799-43b5-8582-3af8f62fd01b` | OTA updates (Expo EAS) |
| `cdn.sportmonks.com` | imagens de escudos/times (CDN, não API) |
| `o447951.ingest.sentry.io` / `596e2e09…@o4510323490160640.ingest.us.sentry.io` | Sentry (erros/telemetria) |

Legado: o domínio antigo era **`sporalarm.com`** (ainda referenciado em `commitCallback`);
hoje tudo é redirecionado para `api.sportsalert.ai`.

## 3. Autenticação

Formato de header confirmado literalmente no bundle:

```js
headers: {
  'Authorization': 'Bearer ' + token,
  'X-App-Version': <versão>
}
```

- **`Authorization: Bearer <token>`** — token obtido do fluxo `/api/auth/*` e persistido
  (`access_token` / `refresh_token` aparecem na string table; chave de storage `SESSION`/`authToken`).
- **`X-App-Version`** — versão do app (controle de compatibilidade).
- **CORS com credenciais**: `Access-Control-Allow-Credentials` está no bundle → o fluxo web
  também usa cookies.
- OAuth social: `GET /api/auth/google/callback`, `POST /api/auth/apple`.
- Não há `x-api-key` fixa nem chave de API embutida em texto claro no JS.
  A string `supabase` / `postgrest` aparece, mas **sem `*.supabase.co` nem tabela/`rpc`** —
  provável dependência empacotada não usada (ou uso com URL injetada em runtime). **Não confirmado.**
- Firebase presente apenas para **FCM/messaging** (RNFirebase), com configuração em recursos
  nativos (não exposta em texto claro).

## 4. Endpoints (API própria)

Limpo de sufixos de ícones/nomes coladas pelo Hermes:

### Auth
- `POST /api/auth/register?ref=<code>`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/verify?platform=<...>`
- `POST /api/auth/verify-code`
- `POST /api/auth/send-verification-code`
- `POST /api/auth/forgot-password`
- `GET  /api/auth/google/callback`
- `POST /api/auth/apple`
- `POST /api/auth/marketing-consent`
- `POST /api/auth/attribution/ad_attribution_token`
- `POST /api/auth/mobile-appsflyer-link`

### Conta / indicação
- `GET|POST /api/user/account`
- `GET  /api/referrals/<code>`

### Billing
- `GET  /api/pricing?platform=<ios|android>`
- `GET  /api/public/paywall`
- `GET  /api/iap-not-available` (flag de indisponibilidade)
- `GET  /v1/products`
- `GET  /v1/subscriptions/status`
- `GET  /v1/subscriptions/entitlements`
- `POST /v1/subscriptions/bind-user`
- `POST /v1/webhooks/stream`

### Push
- `POST /api/notifications/register-token`
- `POST /api/v2/push/updateDeviceToken`

> **Observação importante:** não apareceu endpoint de *dados esportivos* (jogos, alertas,
> sinais, previsões) em texto claro. O app é centrado em **alertas por push**: o conteúdo
> chega via FCM e telas usam `/app/alerts`, `/app/matches/`, `/app/notifications/cancelled`.
> Rotas de tela (Expo Router): `/app/login`, `/app/register`, `/app/alerts`, `/app/matches/`,
> `/app/pricing`, `/app/profile`, `/app/dashboard-customize`, `/app/notifications/cancelled`.

## 5. Produtos (RevenueCat)

```
sportsalert.starter.weekly
sportsalert.starter.monthly
sportsalert.starter.yearly
sportsalert.pro.monthly
sportsalert.pro.yearly
sportsalert.max.monthly
sportsalert.credits.small / single.member / medium / micro / large
```

## 6. Estrutura de dados (payloads)

**Não recuperável por strings** — property names em Hermes ficam em tabela separada e o
corpo das respostas não está no bundle. Confirmado apenas:

- Token de sessão `access_token` + `refresh_token`.
- Entitlements/assinaturas consumidos de `/v1/subscriptions/*`.

Para mapear payloads reais seria necessário **capturar tráfego em runtime** (proxy no aparelho
com o próprio app logado) — etapa separada, fora deste recon estático.

## 7. Terceiros identificados

Firebase (FCM), Sentry, AppsFlyer (attribution/deep link), RevenueCat (IAP),
Expo/EAS (OTA), MLKit (barcode), Sportmonks (imagens), Vercel (`x-vercel-forwarded`).

## 8. Limites e próximos passos

- Recon **estático**: nada de payloads, nada de chaves.
- Para integração: replicar apenas o **fluxo** (auth Bearer + versionamento + billing via
  nosso Stripe), **sem** reusar dados/marca do app.
- Próximo passo sugerido: capturar 5–10 requests reais no aparelho para documentar o JSON de
  `/api/user/account`, `/v1/subscriptions/entitlements` e das notificações.

## 9. Legal

Este documento é mapeamento de **interoperabilidade** a partir de um APK já instalado pelo
usuário. Não usar endpoints/marca/conteúdo de terceiros em produção sem autorização.
