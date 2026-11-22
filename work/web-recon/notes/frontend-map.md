# Mapa de Frontend — app.statshub.com.br

> Case: `work/web-recon` · Alvo: `https://app.statshub.com.br` · Perfil de rede: `authorized_target_only`
> Coleta 100% passiva (GETs únicos em assets públicos). Nenhum fuzzing, nenhum endpoint de API foi chamado.

## 1. Stack identificada

| Camada | Evidência |
|---|---|
| Next.js **App Router** (SSR + RSC flight payload `self.__next_f`) | `index.html`, `login.html` |
| buildId: `TCfzx9o-EUt5bTUL7XAu2` | payload RSC |
| next-auth (`/api/auth/signin?`, `/signout`) | chunk `998-9b44704c6d7f0224.js` |
| Tailwind (CSS utilitário minificado, 2 folhas ~55 KB) | `css__4e8…`, `css__35c…` |
| Fonte self-hosted: **Plus Jakarta Sans** (principal) + **Inter** (secundária), via `next/font` (`__Plus_Jakarta_Sans_de4d8c`) | CSS |
| Widget de chat: **Chatwoot** (`/api/chatwoot/identity`, CSP `frame-ancestors … https://chat.statshub.com.br`) | E-005 / E-001 |
| i18n em runtime: `/api/user/locale` (POST detecta, PUT troca + reload) | E-005 |
| Proxy/edge: HTTP/2, HSTS preload 63072000, `x-nextjs-*`; `server` header oculto | E-001 |

Sem SourceMap exposto, sem `NEXT_PUBLIC_*` inlined, sem chave de terceiro (Stripe/Firebase/Sentry/PostHog/GTM) no bundle público.

## 2. Superfície de rotas

| Rota | Status observado |
|---|---|
| `/` (raiz) | acessível |
| `/login` | **200** — única página pública completa |
| `/jogos` | **307** → `/login?callbackUrl=%2Fjogos` |
| `/manifest.json`, `/sitemap.xml` | **307** → login |
| `/robots.txt` | 404 (página 404 do Next) |
| `/_next/static/**` | 200 — assets estáticos |

O app inteiro (área logada) está atrás de sessão; as rotas internas (`/jogos` e demais) só aparecem nos chunks das respectivas páginas, que exigem login. `/_next/static/<buildId>/_buildManifest.js` está vazio (App Router não publica lista de páginas) — E-006.

## 3. Inventário de assets baixados (15/15 HTTP 200)

Pasta: `evidence/assets/` · lista: `evidence/asset_list.txt`

| Arquivo | Tamanho |
|---|---|
| `chunks__app__login__page-302de685fa148a97.js` | 33993 B |
| `chunks__app__layout-7dbb18ff3a563a02.js` | 8493 B |
| `chunks__main-app-096d0756a33f9644.js` | 484 B |
| `chunks__webpack-1d971fe2e1bb2c6e.js` | 3781 B |
| `chunks__polyfills-78c92fac7aa8fdd8.js` | 91381 B |
| `chunks__fd9d1056-c61bfde645e3cbc7.js` | 172834 B |
| `chunks__5190-3d815808926219e0.js` | 128571 B |
| `chunks__5504-f216f929d3d44b51.js` | 139894 B |
| `chunks__4696-de4fa7671780bd48.js` | 32906 B |
| `chunks__4798-c9146ce129234459.js` | 19674 B |
| `chunks__6407-a655893dbfd33a0b.js` | 6686 B |
| `chunks__6648-62e712068aba03a5.js` | 13847 B |
| `chunks__998-9b44704c6d7f0224.js` | 34541 B |
| `css__35c612c7412b5e64.css` | 5406 B |
| `css__4e801ed4a4873151.css` | 50235 B |

Mais: `index.html` (32.9 KB), `login.html` (32.8 KB), `headers_root.txt`, `headers_login.txt`, `pub__*` (3 respostas de sondagem passiva).

Imagens referenciadas (não baixadas, são conteúdo, não estrutura): `/login/hero-analytics-v2.png`, `/logos/logo-claro.png`, `/logos/logo-escuro.png`, `/flags/br.svg`, `/logos/favicon.png`.

## 4. Endpoints de API descobertos

Todos descobertos por leitura estática de string no bundle público.

| Método | Endpoint | Payload observado | Origem |
|---|---|---|---|
| POST | `/api/auth/login-check` | `{email, password}` | login page chunk |
| POST | `/api/auth/register` | `{...form, cpf, whatsapp, country:"BR", referralCode}` | login page chunk |
| POST | `/api/auth/password/forgot` | `{email}` | login page chunk |
| POST | `/api/auth/password/reset` | `{token, password, confirmPassword}` | login page chunk |
| GET | `/api/auth/signin?` (+ `/signout`) | next-auth OAuth/credentials | chunk 998 |
| GET | `/api/chatwoot/identity` | `credentials:"include"` → identidade do chat | layout chunk |
| POST | `/api/user/locale` | — (detecta locale) | layout chunk |
| PUT | `/api/user/locale` | `{lang}` | layout chunk |

Comportamento de erro observado no código: `e.status >= 500` → mensagem "Serviço indisponível no momento. Tente novamente em instantes."; demais erros usam `json.error` do servidor.

## 5. Contrato de UI da página de login (para replicar)

- Formulários: **login**, **registro**, **esqueci minha senha**, **reset** (`token` na query).
- Campos do registro incluem `cpf` (placeholder `000.000.000-00`) e `whatsapp` (placeholder `(11) 99999-9999`), com máscaras aplicadas no cliente (`T3()` para telefone, remoção de máscara no CPF antes do POST).
- `country` default `"BR"`; existe caminho internacional que envia `cpf: ""`.
- `referralCode` opcional no registro.
- Seletor de idioma troca via PUT `/api/user/locale` e recarrega a página.
- Metadados: `theme-color #0a0f1a`, `apple-mobile-web-app-title StatsHub`, descrição PT-BR sobre análise de futebol.

## 6. Tokens de design recuperáveis

| Token | Valor |
|---|---|
| Accent | `#ff5200` (6 usos), hover/claro `#ff9666` |
| Superfície escura | `#050505` (5 usos), app background `#0a0f1a` (theme-color) |
| Neutros | `#9ca3af`, `#e5e7eb`, `#dde3ed`, `#dde1e7`, `#f0f2f5`, `#f5f6f8`, `#e8ecf2` |
| Erro | `#ef4444` |
| Fontes | Plus Jakarta Sans (16), Inter (7), `ui-monospace` para código |
| Radius/sombra | classes Tailwind no CSS (`rounded-*`, `shadow-*`); sem `:root` custom properties próprias |

## 7. O que NÃO foi obtido (e por quê)

- Rotas e endpoints da área logada (`/jogos`, estatísticas, ligas): os chunks por página só são servidos/renderizados após sessão válida. Obter isso exigiria credenciais próprias — fora do escopo passivo aprovado.
- Endpoints de dados (backend de estatísticas): não há base URL de API no bundle público; o app usa rotas same-origin `/api/*` no servidor Next, então o backend real fica atrás do servidor (BFF pattern).
