# Plano técnico — Combo Builder + Alertas (Gol / Kickoff)

Estado: **desenho**. Win-Prob ao vivo já implementado (`src/lib/winProb.ts`, `WinProbChart.tsx`, `/api/matches/[id]/momentum`).
Regras: nada de número inventado, nada de chamada de rede em teste, cada fase entra atrás de feature flag.

---

## 1. AI Combo Builder (Bet Builder)

### 1.1 O que já existe e serve
- `src/context/BetSlipContext.tsx` — store externo com `selecoes`, `alternar`, `remover`, `limpar`, `oddTotal`, `probCombinada`, persistência em `localStorage` (`apitou.betslip.v1`), badge e dock (`components/apitou/BetSlipDock.tsx`).
- `src/lib/mercadosPoisson.ts` — `mercadosDoJogo` (prob + λ + `estimado` + `amostra`) e `filtrarMelhores` (prob ≥ 70% ou EV+).
- `src/lib/evPct` — EV padronizado; `OddsCards` já mostra odd × prob.
- Motor de props (`playerPropsEngine`) devolve `probModelo` e `odd` por jogador.

### 1.2 O que falta
`Selecao` hoje é só de prop de jogador (`jogador`, `linha`, `odd`, `probModelo`). Um combo de verdade mistura **mercado de jogo** (BTTS, Over 1.5, cantos) com **prop**. Precisa de um discriminador e de um rótulo legível.

### 1.3 Mudança de tipo (v2, retrocompatível)
```ts
type Origem = "prop" | "mercado";

type Selecao = {
  chave: string;              // "match:<id>:<mercadoId>" | "prop:<fixture>:<jogador>:<mercado>:<linha>"
  origem: Origem;             // NOVO — default "prop" ao ler bilhete antigo
  fixtureId: number;
  matchLabel: string;         // "Palmeiras x Flamengo"
  mercado: string;            // "Ambas marcam" | "Over 1.5 gols" | "Finalizações"
  linha?: number;             // opcional no mercado de jogo
  jogador?: string;           // opcional
  odd: number;                // odd de mercado quando existir; senão odd justa = 1/prob
  probModelo: number;         // 0..1
  estimado?: boolean;         // veio de proxy (ex.: cantos 1T = 50%)
  grupo?: "gols" | "gols_1t" | "escanteios" | "jogador";
};
```
- Migração na leitura (`lerDoStorage`): item sem `origem` recebe `"prop"` e `matchLabel = home + " x " + away`. Nada quebra.
- Chave de storage continua `apitou.betslip.v1` (o formato é aditivo; só sobe para `v2` se `origem` virar obrigatório).

### 1.4 UI
1. **Botão “＋ Combinar”** em cada card de `MercadosTab` e nas linhas de `PropsTab`/`OddsCards` → `alternar(selecao)`.
2. **`BetSlipDock`** ganha: odd total, prob combinada, EV (`prob*odd - 1`) e selo de risco:
   - `EV ≥ +5%` → “VALOR”
   - `prob combinada < 25%` → “ALTO RISCO”
   - itens do mesmo `fixtureId` → “CORRELACIONADO” (ver 1.6)
3. **AI Combo Builder** (botão na aba MERCADOS): gera 3 sugestões prontas a partir do jogo aberto.
   - Entrada: mercados do jogo + props top-3 + odds.
   - Regras: 2 a 4 pernas, 1 perna por mercado, prob combinada ≥ 20%, odd alvo 1.80–4.00, exclui `estimado` quando existir alternativa real.
   - Saída: 3 cards (“Seguro”, “Equilibrado”, “Ousado”) com pernas, odd, prob e EV. Botão “Usar no bilhete”.
4. Sem odd real disponível: mostrar **odd justa** (1/prob) com etiqueta “odd justa (modelo)” — nunca fingir odd de casa.

### 1.5 API
- `POST /api/combos/build` body `{ matchId, league }` → `{ combos: [{ pernas[], odd, prob, ev, perfil }] }`.
- Implementação: função **pura** `montarCombos(mercados, props, opts)` em `src/lib/comboBuilder.ts`; a rota só busca dados (histórico já em cache) e aplica `rateLimit("combos", ip, { limit: 20, windowSec: 3600 })`.
- Teste unitário sem rede: `comboBuilder.test.cjs` com arrays sintéticos (prob/odd fixos) conferindo produto, filtros e ordenação.

### 1.6 Honestidade estatística (ponto crítico)
`probCombinada` atual assume independência. Em mercados do mesmo jogo isso é **falso** (BTTS e Over 1.5 se sobrepõem). Plano:
- Marcar cada perna com `fixtureId`; se houver 2+ do mesmo jogo, exibir “correlacionado: prob real é maior que o produto” e **não** publicar EV como se fosse independente.
- Versão 2: calcular prob conjunta por Poisson bivariado para pares do mesmo jogo (reaproveita `prob1x2`/`poissonAcf`), em vez do produto.

### 1.7 Fases
1. Tipo v2 + botão Combinar + dock com odd/prob/EV (só leitura). Sem API nova.
2. `comboBuilder.ts` puro + 3 cards locais no cliente (dados já carregados).
3. Rota `POST /api/combos/build` + rate limit + teste.
4. Gate premium/moedas (depois, com o plano de monetização).

---

## 2. Alertas de Gol e Lembrete de Kickoff

### 2.1 O que já existe
- **Envio**: `src/lib/fcm.ts` (FCM HTTP v1, JWT RS256, cache de token), `src/lib/push.ts` (web-push VAPID + OneSignal).
- **Tokens**: tabela `fcm_tokens` + `POST /api/push/fcm-token` (associa ao usuário logado, aceita anônimo).
- **Preferências**: `alert_prefs` (`user_id`, `team_id`, `match_id`, `alerts jsonb`), UI de sino no `MatchClient` (`flags`), `POST /api/preferences`.
- **Estado/dedupe**: `alert_state` (`match_id` PK, `state jsonb`).
- **Varredura**: `scanLiveAlertaSafe()` em `src/lib/alertScan.ts`, chamada por `/api/cron/diario`.
- **Cron**: `vercel.json` com 4 jobs diários.

### 2.2 O que falta
1. **Watcher de jogo ao vivo** (o cron atual é diário, não serve para gol).
2. **Diff de placar** com dedupe por evento.
3. **Lembrete de kickoff** (T-15 min).
4. **Preferências granulares** `gol` / `kickoff` / `quiet_hours` — hoje `flags` não tem essas chaves.

### 2.3 Desenho

**a) Cron de placar — `/api/cron/live`, 1×/minuto** (Vercel Pro; no Hobby usar 5 min e aceitar atraso, documentado na UI).
```
1. matches = getAllMatches() das ligas canônicas (18), só status live/em andamento
2. para cada match:
     snap = { h: home.score, a: away.score, status, minuto }
     anterior = alert_state[matchId].snap
     se h/a mudou → evento GOL (lado = quem marcou)
     grava snap novo (merge no jsonb), dedupeKey = `${matchId}:${h}-${a}`
3. para cada evento novo:
     alvos = alert_prefs where (match_id = id  OR  team_id in (homeId, awayId))
             and alerts.gol = true
     respeita quiet_hours do usuário e cap diário
     envia FCM + web-push (fallback OneSignal), url = /jogos/{id}?liga={league}
4. grava em alert_state.sent[dedupeKey] = timestamp (retenção 7 dias)
```
Custo: 1 request ESPN por liga por minuto — usar `getSummaryRaw` só para jogos vivos (o scoreboard já traz placar; summary só se precisar do autor do gol). **Regra**: se o scoreboard não diz quem marcou, o texto é “GOL! 2–1” sem autor, não um palpite.

**b) Lembrete de kickoff — `/api/cron/kickoff`, 1×/5 min**
```
janela = jogos com início entre now+10 e now+20
alvos = alert_prefs com alerts.kickoff = true (match_id exato ou team_id)
dedupe = `kickoff:${matchId}` (nunca repete)
título: "Começa em 15 min: Palmeiras x Flamengo"
```
Sem `alert_prefs` para aquele jogo → não envia (opt-in explícito, nunca push em massa).

**c) Preferências**
- `flags` no `MatchClient`: `{ gol: true, kickoff: true, escalacao: false, cartao: false, fim: false }` com default `gol/kickoff = on` ao favoritar.
- `POST /api/preferences` valida o JSON (whitelist de chaves) e grava em `alert_prefs.alerts`.
- `quiet_hours` (`{ start: 23, end: 8, tz: "America/Sao_Paulo" }`) em `users.preferences`/`alert_prefs`; o watcher descarta envios na janela, **exceto** gol de jogo favoritado explicitamente (decisão de produto: gol é o motivo de ter o app).

**d) Dedupe e anti-spam**
- Chave `matchId:placar` impede repetição em reentrega da ESPN.
- Cap: 20 pushes/dia por usuário (`push_log` em memória do dia via tabela `alert_state` global ou coluna em `users`).
- Se `FCM_ENABLED=false` e `VAPID_ENABLED=false`, a rota loga e retorna `{ enviados: 0, motivo }` — não falha o cron.

### 2.4 Fases
1. `flags` granulares + persistência (sem envio ainda) — UI e API.
2. `lib/alertDiff.ts` puro: `detectarGols(anterior, atual)` + `devemEnviar(...)` com testes `alertDiff.test.cjs` (sem rede).
3. Rota `/api/cron/live` + `vercel.json` (1 min) + log estruturado.
4. Rota `/api/cron/kickoff` + template de mensagem.
5. Quiet hours + cap diário.
6. Service Worker (`public/sw.js`) tratando `push` e `notificationclick` → deep link.

### 2.5 Métricas de sucesso
- % de gols entregues em < 90 s do lance.
- Push por usuário/dia (meta < 8).
- Opt-out por tipo de alerta (se `gol` for desligado em > 30% dos usuários, o produto está exagerando).

---

## 3. Ordem de execução sugerida
1. Win-Prob (feito) → validar em jogo real.
2. Fase 1 do Combo (tipo v2 + botão Combinar + dock) — menor risco, maior uso imediato.
3. Alertas fase 1–3 (preferências + diff + cron de gol).
4. Combo builder automático (fases 2–3).
5. Kickoff + quiet hours.

## 4. Arquivos previstos
- `src/lib/comboBuilder.ts` (novo, puro) · `src/context/BetSlipContext.tsx` (tipo v2) · `src/components/apitou/BetSlipDock.tsx` · `src/components/match/MercadosTab.tsx`
- `src/lib/alertDiff.ts` (novo, puro) · `src/app/api/cron/live/route.ts` · `src/app/api/cron/kickoff/route.ts` · `vercel.json` · `public/sw.js`
- `src/app/api/preferences/route.ts` (whitelist) · `src/components/match/MatchClient.tsx` (flags)
- Testes: `comboBuilder.test.cjs`, `alertDiff.test.cjs` (rodam sem rede)
