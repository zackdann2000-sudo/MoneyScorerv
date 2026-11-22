# StatsHub (`app.statshub.com.br`) — Relatório de Engenharia Reversa de Frontend

> Análise: 2026-11-22 · Operador: local (AI) · Case: `work/web-recon`
> Alvo: `https://app.statshub.com.br` · Escopo: assets públicos do frontend (HTML/JS/CSS), somente GET passivo
> Ferramentas: `curl`, `rg`, `sha256sum`, `python3` (Termux aarch64) · Skill primária: `js-reverse` (R3)

## 0. Cadeia de evidência

### 0.1 Escopo (scope.md)
- `auth.status = granted`, `auth.basis = own_system`, `network_profile = authorized_target_only`
- `in_scope.assets = [https://app.statshub.com.br/jogos]` (host único; todos os GETs ficaram nesse host)
- `out_of_scope.activities = [dos, phishing_real_users, unrestricted_exfil]`

### 0.2 Evidência (detalhe em `evidence/E-00*.md`)
| ID | Observação | Hash |
|---|---|---|
| E-001 | `/jogos` → 307 `/login?callbackUrl=%2Fjogos` | `43936bf6…cb8b2` |
| E-002 | `login.html` público, Next App Router, buildId `TCfzx9o-EUt5bTUL7XAu2` | `6d8ab303…8a91` |
| E-003 | 15 assets estáticos, 15×200, sem SourceMap | `18b63789…dde4` |
| E-004 | 4 endpoints `/api/auth/*` + payloads (login chunk) | `8462a187…d2ca` |
| E-005 | `/api/chatwoot/identity`, `/api/user/locale` (layout chunk) | `282ae427…31f5` |
| E-006 | `/manifest.json`,`/sitemap.xml` 307; `/robots.txt` 404; `_buildManifest.js` vazio | `e88f5052…a66b` |
| E-007 | Design tokens (fonte/paleta) do CSS | `0228aff7…f95d` |

Fixity completa: `evidence/evidence_sha256.txt`. Reprodução: qualquer comando `repro_command` de E-001…E-007.

## 1. Resultado em uma página

- O site é um **Next.js App Router** com **next-auth**, servido como BFF same-origin: não existe domínio de API no bundle, tudo passa por `/api/*` no próprio host.
- Única superfície pública completa é **`/login`**; `/jogos` (e o resto do app) redireciona para login (307).
- **8 endpoints** mapeados, todos de autenticação/sessão/i18n (tabela §4 do mapa). Nenhum endpoint de dados (estatísticas, jogos) vaza em bundle público.
- **Nenhum segredo** no frontend: zero `NEXT_PUBLIC_*`, zero chaves Stripe/Firebase/Sentry/PostHog/GTM, zero JWT hardcoded, zero SourceMap.
- Estrutura e tokens suficientes para replicar **shell + tela de login + fluxo de sessão** localmente: ver `notes/frontend-map.md`.

## 2. Metodologia (passiva)

1. `GET /jogos` → descobrir redirect de auth e headers de segurança (E-001).
2. `GET /login` → HTML público + payload RSC; extrair `src`/`href` de `_next/static` (E-002).
3. Baixar **apenas** os 15 assets referenciados pelo próprio HTML, 1 GET cada (E-003).
4. Varredura estática: regex de `https?://`, `"/..."`, `fetch(`, `NEXT_PUBLIC_*`, padrões de chave (E-004, E-005).
5. Sondagem passiva de 4 caminhos padrão de PWA/SEO/manifest (E-006) — sem fuzzing.
6. Extração de tokens de design do CSS (E-007).
7. Fixity SHA-256 de cada artefato antes de escrever as conclusões.

## 3. Findings

### F-001
- title: Superfície de API de autenticação totalmente exposta no bundle público (8 endpoints com contrato de payload)
- severity: info
- category: design
- status: validated
- evidence_ids: [E-004, E-005]
- location: evidence/assets/chunks__app__login__page-302de685fa148a97.js ; chunks__app__layout-7dbb18ff3a563a02.js
- impact: Permite replicar o contrato de auth (login-check, register, forgot, reset, locale, chatwoot identity) sem engenharia social ou acesso autenticado. Não é vulnerabilidade por si — é o custo normal de SPA; o risco real depende do rate-limit e da validação server-side, que não foram testadas (fora de escopo).
- confidence: high
- repro_steps:
  1. Baixar o chunk da página de login (E-004 repro_command).
  2. `rg -oN '/api/auth/[a-z/-]+'` → 4 endpoints + next-auth signin.
  3. Repetir no layout chunk → `/api/chatwoot/identity`, `/api/user/locale`.
- remediation: n/a (RE)
- optional_attack: 

### F-002
- title: Nenhum segredo ou chave de terceiro no frontend público
- severity: n/a_re
- category: other
- status: validated
- evidence_ids: [E-003, E-004]
- location: evidence/assets/ (todos os 13 chunks)
- impact: Confirmado que o modelo de segurança é server-side: nada de `sk_live_`, `AIza`, JWT assinado, `NEXT_PUBLIC_*` ou telemetria de terceiro embutida. Reduz a superfície de abuso a partir do cliente e simplifica a replicação (sem stubs de SDK no cliente).
- confidence: high
- repro_steps:
  1. `rg -oN '(sk_live_[A-Za-z0-9]{6,}|AIza[A-Za-z0-9_-]{20,}|NEXT_PUBLIC_[A-Z0-9_]+|api[_-]?key\s*[:=])' *.js` → 0 resultados.
- remediation: n/a (RE)

### F-003
- title: Área logada inteiramente protegida por sessão; ausência de SourceMap e de manifesto de rotas
- severity: n/a_re
- category: other
- status: validated
- evidence_ids: [E-001, E-006]
- location: https://app.statshub.com.br/jogos ; /_next/static/TCfzx9o-EUt5bTUL7XAu2/_buildManifest.js
- impact: Enumeração de rotas internas por leitura passiva é inviável: `_buildManifest.js` vazio (App Router), `/manifest.json` e `/sitemap.xml` redirecionam para login, `/robots.txt` 404. O mapa completo da área logada exigiria sessão própria do titular.
- confidence: high
- repro_steps:
  1. `curl -sS -o /dev/null -w '%{http_code}\n' https://app.statshub.com.br/jogos` → 307.
  2. `curl -sS https://app.statshub.com.br/_next/static/TCfzx9o-EUt5bTUL7XAu2/_buildManifest.js | wc -c` → 224 (vazio).
- remediation: n/a (RE)

### F-004
- title: Design system replicável a partir do CSS público (fonte, paleta, raio/sombra Tailwind)
- severity: n/a_re
- category: other
- status: validated
- evidence_ids: [E-007]
- location: evidence/assets/css__4e801ed4a4873151.css
- impact: Permite reconstruir o visual localmente: Plus Jakarta Sans (display) + Inter (texto), accent `#ff5200`, fundo `#050505`/`#0a0f1a`, erro `#ef4444`, neutros listados no mapa §6.
- confidence: high
- repro_steps:
  1. `rg -oN 'font-family:[^;}]+' css__4e801ed4a4873151.css | sort | uniq -c | sort -rn`.
- remediation: n/a (RE)

## 4. Paths

### P-001
- title: Fluxo de autenticação observado (callflow)
- path_type: callflow
- start: GET /jogos (sem sessão)
- goal: entender como a sessão é criada e onde o cliente entra
- steps:
  1. `GET /jogos` → `307 location: /login?callbackUrl=%2Fjogos` [E-001]
  2. `/login` renderiza SSR + hidrata chunk `app/login/page` [E-002, E-003]
  3. Submit do form → `POST /api/auth/login-check {email,password}` [E-004]
  4. Sucesso → signin next-auth (`/api/auth/signin?`) grava cookie de sessão [E-004]
  5. Layout chama `GET /api/chatwoot/identity` (`credentials: include`) [E-005]
  6. `POST/PUT /api/user/locale` define idioma e recarrega [E-005]
- evidence_ids: [E-001, E-002, E-003, E-004, E-005]

### P-002
- title: Grafo de carregamento de assets do frontend (callflow)
- path_type: callflow
- start: HTML público (`/login`)
- goal: saber exatamente o que compõe o bundle e em que ordem
- steps:
  1. HTML referencia 2 CSS + 13 JS sob `/_next/static/` [E-003]
  2. `main-app` → `webpack` (runtime/chunk map) → `polyfills` → shared chunks (4696/4798/5190/5504/6407/6648/998/fd9d1056) [E-003]
  3. `app/layout` (chrome + chatwoot + locale) → `app/login/page` [E-005, E-004]
  4. Nenhum `.map` referenciado → sem SourceMap [E-003]
- evidence_ids: [E-003, E-004, E-005]

## 5. Artefatos entregues

| Artefato | Caminho |
|---|---|
| Mapa de frontend (para replicação) | `work/web-recon/notes/frontend-map.md` |
| Evidência bruta + fixity | `work/web-recon/evidence/` (7×E-*.md, `assets/`, `evidence_sha256.txt`) |
| Diagrama de fluxo | `work/web-recon/report/diagram-auth-flow.mmd` |
| Timeline | `work/web-recon/timeline.md` |
| Work items | `work/web-recon/workitems.md` |

## 6. Limitações e próximos passos

- Nada da área logada foi mapeado (exige credencial própria do titular). Com login autorizado, o próximo passo natural é abrir `/jogos`, coletar os chunks `app/<rota>/page-*.js` e repetir a extração para obter os endpoints de dados.
- Não foram feitas chamadas a nenhum endpoint `/api/*` (nem com GET): a autorização cobria assets públicos, não a API.
- Rate-limit/validação server-side não avaliados.
