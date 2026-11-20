# Pronostic.io — recon map (clean-room, fontes públicas)

Alvo: https://pronostic.io (es-AR) · app instalado no celular do usuário · recon 20/11/2026.

## 0. Limites

- Fontes usadas: `robots.txt`, `sitemap.xml`, **páginas SSR públicas** (`/`, `/home`,
  `/analisis`, `/analisis/:slug`, `/precios`, `/como-funciona`, `/terminos`, `/login`).
- **Não** li bundles JS, **não** chamei `/api/` (bloqueado no robots), **não** loguei em conta.
- `robots.txt`: `Allow: /` com `Disallow: /api/`, `/r/`, `/admin/` — sem content-signal de IA,
  então uso como referência é permitido; ainda assim nada de código/texto/logo foi copiado.
- Os **picks** (Favorito/Valor/Bomba) ficam atrás do login: existe a estrutura e as regras
  publicadas, mas não o layout interno da área logada.

## 1. Stack

| sinal | leitura |
| --- | --- |
| `/_next/static/...?dpl=` | **Next.js** no **Vercel** (App Router) |
| HTML SSR completo (43–300 KB) | forte aposta em SEO: 247 páginas `/analisis/:slug` |
| login com **Google OAuth** + email/senha | auth social + credencial |
| **Stripe** (citado na página de preços) | assinatura mensal |
| `PayVips Group LLC` (nos termos) | empresa operadora |
| sem `manifest.json` (404) | **não é PWA** — o "app" do celular é o app nativo/atalho |

## 2. Inventário de telas

| ID | tela | rota | propósito | componentes-chave | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Landing | `/` | vender e converter | hero, "Pronósticos Destacados", "Aciertos", "Partidos disponibles" por liga, prova social (77% / 8-de-10 / 5.000+), aviso 18+ | anônimo |
| S02 | Home do produto | `/home` | explicar o produto | 4 camadas (ingesta → modelos → EV → leitura IA), 4 mercados, 9 ligas, FAQ, CTA | anônimo |
| S03 | Lista de análises | `/analisis` | achar partido | partidos agrupados por dia (data + hora AR), liga, "Ver →" | 247 partidos |
| S04 | **Informe do partido** | `/analisis/<time-a>-vs-<time-b>-<id>` | análise pública | placar/data, ranking local×visitante, texto da IA, probabilidades 1X2 + goles, tabela de forma (10 jogos), gate "análisis completo" | pré-jogo; mantido depois do jogo |
| S05 | Login / registro | `/login` | desbloquear consultas | "Continuar con Google", email/senha, esqueci senha | anônimo |
| S06 | **Chat de consulta** | área logada ("Volver al chat") | pedir análise | input de time/partido → informe | logado |
| S07 | **Picks** | dentro do informe | 3 faixas de risco | Pick Favorito, Pick de Valor, Pick Bomba | Free/Hobby/Pro |
| S08 | Planos | `/precios` | assinatura | 4 planos, promo BETA −57%, cupom, FAQ de cobrança | logado/anônimo |
| S09 | Como funciona | `/como-funciona` | transparência do modelo | 2 opiniões (modelo × mercado), EV, 3 faixas, de-vig, calibração, FAQ | público |
| S10 | Termos | `/terminos` | legal | "Sobre las cuotas" (de-vig) e "Sobre nuestros picks" | público |
| S11 | Privacidade | `/privacidad` | legal | — | público |
| S12 | Aciertos / histórico | bloco da landing | prova social | picks acertados com jogo, pick e cuota da época + 77% / 8-de-10 | público |

## 3. Regras publicadas do motor (o mais valioso do recon)

**Duas opiniões combinadas por mercado:**

| mercado | peso do modelo | peso do mercado |
| --- | --- | --- |
| resultado (1X2) | **65%** | 35% |
| goles (over/under) | 40% | **60%** |

**Seleção por valor esperado**: só entra pick quando `prob_modelo × cuota − 1 > 0`. "Alta
probabilidade com cuota baixa não é informação" — é filtro explícito.

**Três faixas de risco (até 3 picks por partido, um por faixa):**

| faixa | regra publicada | leitura |
| --- | --- | --- |
| **Pick Favorito** | maior probabilidade do modelo, **cuota ≥ 1.25** | maior confiança |
| **Pick de Valor** | **cuota entre 1.75 e 2.90** | onde o modelo mais se descola do preço |
| **Pick Bomba** | cuota alta com **probabilidade > 25%** | o mais arriscado, "falha mais" |

Se nenhum mercado passa o filtro, **não há pick** naquela faixa (não forçam).

**Cuota descomissionada (de-vig)**: publicam a cuota implícita **sem overround**,
descontando **50% da comissão**. Dizem que fica **3–8% acima** da cuota de casas como
bet365/William Hill/Bwin.

**Calibração como métrica-mãe**: cada pick é registrado com a cuota do momento da emissão e
depois conferido contra o resultado real; a meta é dizer 68% e acertar ~68%, não acertar muito.

**Modelo**: histórico dos times + forma recente + rendimento ofensivo/defensivo, combinado com
**sistema ELO** e "análisis actuarial" (termos), mais cuotas de mercado.

## 4. Conteúdo do informe público (S04)

- Cabeçalho: liga, data/hora (fuso Argentina), mandante × visitante, **ranking** ("Local · Nº 117", "Visitante · Nº 72").
- Parágrafo-resumo gerado: diferença de pontos percentuais entre os favoritos, com leitura de "parejo/favorito".
- **Probabilidades**: Gana A / Empate / Gana B · Más de 1,5 / 2,5 / 3,5 goles · Ambos marcan.
- **Forma (10 jogos)**: goles a favor/contra (prom.), goles por partido, córners a favor, tarjetas, over 2.5
  (ex. "2 de 10"), ambos marcaram ("4 de 10"), valla invicta ("3 de 10").
- Texto com V/E/D e médias de cada time, escrito por IA.
- Rodapé: disclaimer de estimativa matemática + 18+.
- Gate: "Esta página muestra lo básico… el modelo cruza cada probabilidad con la cuota e devolve o informe completo."

## 5. Planos (público)

| plano | preço | consultas/dia | o que inclui |
| --- | --- | --- | --- |
| **Free** | $0 | **3** | 2 mercados (1X2 + OU 2.5), Pick Favorito quando aplica |
| **Hobby** | $14 → **$5,99** (−57% BETA, preço congelado) | **4** | todos os mercados, Favorito + Valor, **1 Bomba/dia** |
| **Pro** | $23,50 → **$9,99** | **8** | Bomba em todas as consultas, **matriz de resultado exacto**, acesso antecipado |
| **Empresa** | desde **$299** | a combinar | integração por API, volume alto, suporte dedicado |

Regras: Stripe mensal, cancelamento a qualquer momento (acesso até o fim do período), **sem
reembolso**, reset das consultas **00:00 hora Argentina**, cupom de desconto, promo BETA −57%
congelada enquanto a assinatura estiver ativa.

## 6. Fluxos

| ID | fluxo | passos | observado |
| --- | --- | --- | --- |
| F01 | Consulta sem cadastro | `/` → 1 consulta de teste sem registro | sim (texto) |
| F02 | Registro grátis | `/login` → Google ou email → 3 consultas/dia | sim |
| F03 | Achar partido | `/analisis` → dia → liga → `Ver →` | sim |
| F04 | Ler informe | S04 → probabilidades → forma → gate | sim |
| F05 | Consulta no chat | chat → digita time/partido → informe completo | parcial |
| F06 | Assinar | `/precios` → Stripe → plano ativo | sim |
| F07 | Cancelar | perfil → cancela → mantém até fim do ciclo | sim (texto) |
| F08 | Cupom | `/precios` → "¿Tenés un cupón?" | sim |
| F09 | Matriz de resultado exato | Pro | anunciado |
| F10 | API / volume | Empresa | anunciado |

## 7. Mercados e cobertura

- **4 tipos de mercado**: 1X2, goles (over/under), hándicap, ambos marcan — **12+ opções por partido**.
- **9 ligas**: LaLiga (ESP), Premier League (ENG), Serie A (ITA), Bundesliga (GER), Ligue 1 (FRA),
  Liga Profesional (ARG), Brasileirão (BRA), Copa Libertadores (CONMEBOL), Champions League (UEFA).
- Só futebol; foco Europa + Sudamérica.

## 8. Modelo de dados inferido

```
users(id, email, password_hash, google_sub, plan, created_at)
plans(id, slug(free|hobby|pro|empresa), price_cents, consultas_dia, markets_json, bomba_rule)
subscriptions(user_id, plan_id, stripe_customer, stripe_sub, status, current_period_end, beta_price_frozen)
leagues(id, name, country, code)
teams(id, league_id, name, slug, elo)
matches(id, league_id, home_team_id, away_team_id, kickoff_utc, status, home_score, away_score, slug)
team_form(team_id, window=10, gf_avg, ga_avg, gpg_avg, corners_avg, cards_avg, over25_count, btts_count, clean_sheet_count)
h2h(match_id, n, wins, draws, losses) · injuries(team_id, player, status, updated_at)
odds_market(match_id, market, selection, line, raw_odds, margin, fair_odds)     -- fair = de-vig 50%
probabilities(match_id, market, selection, prob_model, prob_market, prob_final, ev)
picks(id, match_id, user_id, band(favorito|valor|bomba), market, selection, line,
      odd_at_issue, prob_at_issue, ev_at_issue, status(pending|green|red), settled_at)
consults(id, user_id, match_id, day(ART), created_at)                          -- cota diária
chat_messages(id, user_id, role, content, match_id, created_at)
hits(id, pick_id, result_json)                                                 -- "Aciertos"
```

Regras: `prob_final` = blend por mercado (1X2 65/35, goles 40/60); pick só com `ev > 0`;
`odd_at_issue` congelada no registro; cota por `day` no fuso America/Argentina/Buenos_Aires.

## 9. O que é bom roubar (ideia, não código)

1. **Blend declarado por mercado** (modelo × mercado com pesos diferentes para resultado e goles) — hoje o GreenScore usa Poisson + odds sem essa ponderação explícita por mercado.
2. **Cuota descomissionada (de-vig 50%)** exibida ao lado da probabilidade do modelo — melhora a comparação e é fácil de explicar.
3. **Faixas de risco com regra pública** (Favorito / Valor / Bomba) em vez de um único "melhor pick".
4. **Página de transparência** (`/como-funciona`) com EV, filtros e calibração: cria confiança sem prometer acerto.
5. **SEO por partido**: 247 páginas `/analisis/:slug` que sobrevivem ao jogo (tráfego perpétuo) — o GreenScore já tem `/jogos/:id`, falta a versão indexável com slug de times + data.

## 10. Lacunas

Layout interno dos picks, chat (S06), matriz de resultado exacto (F09), tela de perfil/conta,
histórico completo de acertos, e o `/admin/` (bloqueado, fora de escopo).
