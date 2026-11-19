# API recon — Sports Alert (resumo executivo)

Status: **APK encerrado** (recon estático concluído; sem integração no GreenScore).

## Descobertas da engenharia reversa

| Tema | Achado |
|---|---|
| API principal | **`https://api.sportsalert.ai`** (hospedada em Vercel — header `x-vercel-forwarded`) |
| Staging | `staging.sportsalert.ai` |
| Domínio legado | `sporalarm.com` |
| Stack do app | React Native + Expo, bytecode Hermes (`assets/index.android.bundle`) |
| Auth | Bearer token em memória → `Authorization: Bearer <token>` + header `X-App-Version: <versão do app>` em todas as chamadas autenticadas; sem `x-api-key` fixa em texto claro |
| Login | `POST /api/auth/login`, registro `POST /api/auth/register?ref=...`, oauth Google `GET/POST /api/auth/google/callback`; Apple; logout; verify-code; forgot-password; marketing-consent; attribution |
| Paywall | `GET /api/pricing?platform=...`, `GET /api/public/paywall`, `POST /api/iap-not-available` |
| Assinaturas | `/v1/subscriptions/{status,entitlements,bind-user}`, `/v1/products`, `/v1/webhooks/stream` |
| Store de pagamento | **OpenIAP** (abstração cross-platform; strings `openiap`, `requestPurchase`, `finishTransaction` no bundle) em cima dos produtos RevenueCat `sportsalert.{starter,pro,max}.{weekly,monthly,yearly}` + créditos `sportsalert.credits.*` |
| Notificações | `POST /api/notifications/register-token`, `POST /api/v2/push/updateDeviceToken`; Firebase presente apenas para FCM push |
| Usuário | `GET /api/user/account`, `/api/referrals/<code>` |
| Dado esportivo | **Não recuperável por strings** — o app é centrado em push; payloads JSON reais exigiriam captura de tráfego (mitmproxy/Charles, por ora descartada) |

## Implicações para o GreenScore (o que copiar, sem código alheio)

1. Auth mobile: fluxo Google OAuth com callback no servidor (`/api/auth/google/callback` é o padrão) + sessão Bearer curta.
2. Paywall server-driven: `pricing?platform=` no servidor, entitulado no app via OpenIAP/RevenueCat — a regra de negócio fica no backend (igual nosso `users.plan`).
3. Push como produto: registro de token por aparelho + alertas como core (espelha nosso `fcm_tokens`/`valueAlertLog`).

## Conclusão
Recon estático encerrado com sucesso. Decisão prévia mantida: **pular captura de tráfego** (app focado em push; nossos dados vêm de ESPN + API-Football). Próximo foco: 100% GreenScore (Track Record).