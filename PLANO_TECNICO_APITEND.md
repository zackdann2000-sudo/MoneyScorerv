# PLANO_TECNICO_APITEND.md

**Escopo aprovado:** GAP 1 (Motor de Tendências "Apitend"), painel **Quentes** (V/E/D + sequências) e **split 1T/2T**.
**Fora de escopo:** `refCedida` / ligas irmãs (V2) e cards para redes sociais (descartado).
**Status:** plano para aprovação. Nada implementado, nenhuma migração rodada, nenhum `next build` executado.

---

## 0. Resumo executivo (o que muda)

| Item | Situação hoje | Depois |
|---|---|---|
| Motor de frequência | `lib/screener.ts` — 12 mercados com **linhas fixas** (1.5, 2.5, 9.5…) | Mesmo motor + **linhas derivadas da mediana** (`tendMediana`/`tendLinhas`) e catálogo ampliado |
| "Bateu X de Y" | Existe internamente (`avaliarLado` devolve `total`, `pct`, `serie`) mas **não é dito na tela** | Frase explícita: "bateu 8 de 10", com bolinhas 0/1 e destaque em 100% |
| Histórico por time | `getTeamHistory()` em memória, TTL 20 min → **refaz toda chamada a cada cold start** | Tabela `team_history_cache` com TTL 12 h → **menos** chamadas que hoje |
| 1º/2º tempo | Só gols (`htGf`/`htGa` em `HistGame`) | Gols 1T/2T pela ESPN; cantos/cartões 1T pela fonte Apitou, com amostra exibida |
| Painel Quentes | Não existe na tela do jogo | Bloco V/E/D + sequências automáticas |

**Ganho de posicionamento:** o Apitou anuncia "últimos 10 jogos", mas o `raioxRaw` dele tem **mediana de 3 jogos** (medido: 1.153 times, máx. 15, apenas 300 com ≥10). O nosso `getTeamHistory` entrega **10 jogos reais com summary por partida**. Podemos entregar a mesma frase com amostra verdadeira — e dizer isso na tela.

---

## 1. De onde vem a "mediana" (a pergunta central)

### 1.1 O diagnóstico que resolve o problema

Medição feita hoje em `dados.js` (23,7 MB) sobre os 1.153 times com raio-x:

| Jogos no `raioxRaw.geral` | Times |
|---|---|
| 0 | 12 |
| 1 | 420 |
| 2 | 107 |
| 3 | 64 |
| 4–9 | 250 |
| **10** | 188 |
| 12–15 | 112 |

**Mediana = 3 jogos. Máximo = 15. Zero times com ≥ 30.**

Ou seja: a fonte que o Apitou usa **não tem** histórico longo, e ele não tem outro caminho. Quando a tela diz "últimos 10 jogos", em boa parte dos times está usando 1 a 3. Isso não é um problema nosso — é uma vantagem nossa.

### 1.2 As três fontes disponíveis e o custo de cada uma

| Fonte | O que entrega | Amostra | Custo de cota |
|---|---|---|---|
| **A. `getTeamHistory()` (ESPN)** | `HistGame[]` por partida: `corners`, `fouls`, `yellow`, `red`, `offsides`, `sot`, `shots`, `poss`, `htGf`, `htGa` + versões `opp*` | **10 reais** (parametrizável até 15) | 1 `getSchedule` + **N `getSummaryRaw`** por time |
| **B. Cache Apitou (`apitouCache`)** | `statsHome.serie` com 8 métricas (gols, faltas, amarelos, impedimentos + sofridos) e `raioxRaw.geral[].own/adv` completo com `tempos.1T/2T` | 1–15 (mediana 3) | **Zero** — já está no banco |
| **C. `hub_fixture` (acúmulo próprio)** | Placar e estatísticas de partidas finalizadas que já sincronizamos | cresce com o tempo | Zero |

### 1.3 A decisão

**Primária: A (ESPN).** É a única com 10 jogos reais *e* a única que já tem o split de 1º tempo para gols.
**Complemento: B (Apitou).** Entra em dois casos específicos — (i) 1T/2T de **cantos, cartões e finalizações**, que a ESPN não entrega no histórico; (ii) time sem histórico ESPN (base parcial).
**C fica de reserva** e não entra nesta entrega: base fria, exigiria meses para chegar a 10 jogos.

**A mediana nunca é inventada.** Se a amostra < `MIN_COBERTURA` (3), o mercado simplesmente não aparece — o mesmo princípio que o `screener.ts` já aplica hoje ("cobertura menor que MIN_COBERTURA ⇒ o mercado some, não vira 0%").

### 1.4 A conta de cota (por que precisamos de cache persistente)

Hoje `getTeamHistory(league, teamId, 10)` dispara:

```
1 × getSchedule(...)                    → cache memória 30 min
10 × getSummaryRaw(..., "post")         → cache memória 1 h
= 11 chamadas por time · 22 por partida
```

O `cached()` de `src/lib/cache.ts` é **memória de instância** (`globalThis`). Em serverless, cold start = zero cache = 22 chamadas de novo.

Simulação com a tabela nova (`team_history_cache`, TTL 12 h):

| Cenário | Sem cache persistente | Com cache persistente |
|---|---|---|
| 20 partidas do dia abertas | ~440 chamadas | ~24 chamadas (só o que nunca foi visto) |
| Mesma partida revisitada 50× | ~1.100 | **0** |
| Sync diário de 145 fixtures | ~3.190 ❌ | ~1.450 → e só se pré-aquecermos |

**Regra:** o motor de tendências roda **sob demanda** (usuário abriu a partida), nunca em lote sobre as 145 fixtures. Pré-aquecimento é opcional e limitado a: times que jogam **hoje** em ligas tier 1.

---

## 2. O motor: "bateu X de Y"

### 2.1 Fórmulas (portado do original, reescrito do zero)

```ts
// mediana de um vetor de números
tendMediana(vals: number[]): number | null

// 3 linhas candidatas em torno da mediana, respeitando o passo do mercado
// gols/cantos/cartões → passo 1 · faltas → passo 2 · fin/chutesGol/defesas → passo 1
tendLinhas(mediana: number, passo: number): number[]
// = [max(0.5, arred(med-0.5)+0.5) - passo, mediana, +passo]  (deduplicado, só > 0)

// para cada linha: quantos dos últimos N jogos passaram
tendPontos(vals: number[], linha: number): { hit: number; n: number; serie: (0|1)[] }
// hit = count(v > linha)  → "bateu {hit} de {n}"
```

`pct = round(hit/n*100)`. Regra de exibição herdada do `screener`:

- `n < 3` → mercado não aparece.
- `hit === n` **e** `n >= 5` → selo **"100%"** (é a frase que vende).
- `pct >= 60` (`LIMIAR_PADRAO`) → destaque neutro.
- `hit === n` **e** `n < 5` → aparece como "bateu N de N · amostra curta", sem selo.

### 2.2 Catálogo de mercados (o que cada fonte alimenta)

| Mercado | Extrator | Fonte A (ESPN) | Fonte B (Apitou) | Passo |
|---|---|---|---|---|
| Gols na partida | `g.gf + g.ga` | ✅ | ✅ | 1 |
| Gols do time | `g.gf` | ✅ | ✅ | 1 |
| Gols no 1º tempo | `g.htGf + g.htGa` | ✅ | ✅ | 0.5 |
| Gols no 2º tempo | `(g.gf+g.ga) - (htGf+htGa)` | ✅ | ✅ | 0.5 |
| Escanteios do jogo | `corners + oppCorners` | ✅ | ✅ (`1T` também) | 1 |
| Escanteios do time | `corners` | ✅ | ✅ (`1T` também) | 1 |
| Cartões do jogo | `yellow + oppYellow` (+ `red`) | ✅ | ✅ (`1T` também) | 1 |
| Cartões do time | `yellow` | ✅ | ✅ | 1 |
| Faltas do jogo | `fouls + oppFouls` | ✅ | ✅ | 2 |
| Finalizações do time | `shots` | ✅ | ✅ (`1T` também) | 1 |
| Chutes a gol do time | `sot` | ✅ | ✅ (`1T` também) | 1 |
| Impedimentos do time | `offsides` | ✅ | ✅ | 1 |
| Defesas do goleiro | — | ❌ | ✅ (só elenco/temporada) | 1 |
| Ambas marcam | `gf>0 && ga>0` | ✅ | ✅ | — |

**1T/2T — o que é honesto prometer:**

| Mercado | 1T/2T via ESPN | 1T/2T via Apitou |
|---|---|---|
| Gols | ✅ 10 jogos | ✅ amostra curta |
| Escanteios, cartões, finalizações, chutes a gol | ❌ não existe em `HistGame` | ✅ via `raioxRaw.geral[].tempos.1T/2T` |
| Faltas | ❌ | ✅ |

Quando o mercado vem só da fonte B com `n < 5`, a UI mostra o número com a etiqueta **"amostra curta (N jogos)"**. Nunca é apresentado como se fosse 10.

### 2.3 Onde encaixa no que já existe

Não criamos um segundo motor de frequência. `src/lib/screener.ts` (198 linhas) já tem a mecânica certa:

- `avaliarLado(games, def, opts)` → devolve `{ total, pct, serie: (0|1)[] }` — exatamente o que "X de Y" precisa.
- `MIN_COBERTURA = 3`, `LIMIAR_PADRAO = 60`.

O que falta nele: **`def.linha` é fixa**. A entrega é:

1. **Novo** `src/lib/tendencias.ts` (puro, sem I/O) com `tendMediana`, `tendLinhas`, `tendPontos`, e `gerarTendencias(histCasa, histFora, opts)` que devolve a lista pronta.
2. `screener.ts` **não é alterado** — recebe um adaptador que gera `MercadoScreener` com linha dinâmica. Assim `/api/matches/[id]/frequencia` e o Screener continuam funcionando sem regressão.

### 2.4 Contrato de saída (o que a API devolve)

```ts
type Tendencia = {
  id: string;                 // "cantos_jogo:9.5"
  mercado: string;            // "cantos_jogo"
  rotulo: string;             // "Escanteios do jogo"
  periodo: "total" | "1t" | "2t";
  lado?: "casa" | "fora" | null;
  linha: number;
  mediana: number;            // de onde a linha nasceu
  hit: number;                // "bateu X…"
  n: number;                  // "…de Y"
  pct: number;
  serie: (0 | 1)[];           // mais antigo → mais recente
  cemPorCento: boolean;       // hit === n && n >= 5
  amostraCurta: boolean;      // n < 5
  fonte: "ESPN" | "Apitou" | "ESPN+Apitou";
};
```

---

## 3. Painel "Quentes" (V/E/D + sequências)

Bloco derivado do **mesmo** `HistGame[]`, custo de cota zero.

- **Faixa V/E/D**: últimos 10 resultados, mais antigo → mais recente, coloridos.
- **Sequências automáticas** (só quando `n >= 3`):
  - "Venceu os últimos N" · "Não perde há N" · "Não vence há N" · "Marcou gol nos últimos N" · "Não sofreu gol há N"
- **Mini-tendências com `hit/n`**: as 3 melhores do time, com destaque quando `pct >= 70` (o mesmo corte do original).
- **Forma recente**: reutiliza `mediaPonderada` de `src/lib/formaRecente.ts` (pesos 1.5/1.0/0.5 que já temos) para mostrar a produção recente ao lado da média da temporada.

---

## 4. Onde aparece na UI

**Recomendação: aba própria na página da partida + bloco dentro de ESTATÍSTICAS.**

O `MatchClient` já tem 15 abas (`oportunidades`, `mercados`, `estatisticas`, `cantos-cartoes`, `props`, `ia`, …). A decisão do usuário acontece ali, não no módulo `/apitou`.

### 4.1 Nova aba `TENDÊNCIAS` (posição: depois de `ESTATÍSTICAS`)

```
┌ TENDÊNCIAS ─────────────────────────────────────────────┐
│  Flamengo × Palmeiras · últimas 10 de cada time         │
│  [ Todos ] [ 1º tempo ] [ 2º tempo ]                    │
│                                                          │
│  ●●●●●●●●●●  100%                                        │
│  Mais de 9.5 escanteios no jogo                          │
│  bateu 10 de 10 · mediana 11 · ESPN                      │
│                                                          │
│  ●●○●●●●○●●   80%                                        │
│  Flamengo · mais de 5.5 finalizações                     │
│  bateu 8 de 10 · mediana 6 · ESPN                        │
│                                                          │
│  ⚠ Cartões no 1º tempo · 3 jogos (amostra curta)        │
└──────────────────────────────────────────────────────────┘
```

Ordenação: primeiro os 100% com `n >= 5`, depois por `pct`, depois por `n`. Filtro por período e por lado.

### 4.2 Bloco "Quentes" dentro da aba `ESTATÍSTICAS`

Inserido no topo, acima das médias: faixa V/E/D dos dois times, sequências e as 3 mini-tendências. É leitura de contexto — não compete com a lista completa.

### 4.3 No módulo `/apitou`

4ª aba no `AnaliseTab` (hoje tem `desajustes | props | contexto`): **`tendência`**, alimentada **só pela fonte B** (cache Apitou, custo zero de API), para o usuário que está naquele fluxo de props. Rótulo explícito "amostra: N jogos" sempre visível.

---

## 5. Arquivos e mudanças

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/tendencias.ts` | Motor puro: mediana, linhas, hit/n, catálogo. Sem fetch. 100% testável. |
| `src/lib/tendenciasFonte.ts` | Adaptadores `HistGame[] → Tendencia` e `ResumoJogo → Tendencia`; decide fonte e marca `amostraCurta`. |
| `src/lib/tendencias.test.cjs` | Testes: mediana par/ímpar, linha duplicada, amostra < 3, 1T > total, `opp*` nulo. |
| `src/app/api/matches/[id]/tendencias/route.ts` | `GET` com `?amostra=10&periodo=total&lado=`. Rate limit; cache. |
| `src/components/match/TendenciasTab.tsx` | Lista + bolinhas + selos. |
| `src/components/match/QuentesBlock.tsx` | Cartão V/E/D + sequências. |
| `drizzle/00XX_team_history_cache.sql` | Migração da tabela de cache. |

### Alterados (cirúrgico, uma linha cada)

| Arquivo | Mudança |
|---|---|
| `src/db/schema.ts` | + `teamHistoryCache` (~10 linhas, mesmo formato de `teamXgCache`) |
| `src/components/match/MatchClient.tsx` | + 1 entrada em `TABS` + 1 render condicional |
| `src/components/match/InfoTabs.tsx` | + `<QuentesBlock />` no topo de ESTATÍSTICAS |
| `src/app/api/matches/[id]/frequencia/route.ts` | Passa a ler `team_history_cache` em vez de `cached()` só-memória (**reduz** chamadas) |
| `src/components/apitou/AnaliseTab.tsx` | + 4º modo `tendência` |

**Não será tocado:** `engine.ts`, `fonte.ts`, `analise.ts`, `screener.ts` (só consumido), `hub/`, schema existente.

### Schema proposto

```
team_history_cache
  team_id      text      PK
  league       text      PK
  team_name    text
  payload      jsonb     -- HistGame[] compacto (sem events)
  amostra      integer
  base_parcial boolean
  source       text
  fetched_at   timestamptz
  → índice em (league, fetched_at)
TTL de leitura: 12 h · mantém a linha mesmo vencida (fallback "stale é melhor que erro")
```

---

## 6. Ordem de execução (fatias finas)

1. **Motor puro + testes** — `tendencias.ts` e `tendencias.test.cjs`. Nada de UI. Vira o critério de aceite.
2. **Cache persistente** — migração + leitura/escrita + reaproveitar em `frequencia`.
3. **API `/tendencias`** — contrato do item 2.4, rate limit herdado do padrão da rota `frequencia`.
4. **UI aba TENDÊNCIAS** — lista, bolinhas, selos, estados vazio/erro/carregando.
5. **Quentes** — bloco em ESTATÍSTICAS.
6. **1T/2T** — habilitar gols pela ESPN; cantos/cartões pela fonte B com etiqueta de amostra.
7. **/apitou aba tendência** — reuso do motor com fonte B.

Cada passo termina com teste rodando e verificação na tela. **Sem `next build`** — validação por `tsc --noEmit`, `node --test` e navegador.

---

## 7. Critérios de aceite

- [ ] Mesma partida, dois requests: a 2ª não gera chamada à ESPN (cache bate).
- [ ] `n < 3` → o mercado não aparece (nunca 0%).
- [ ] Selo "100%" só com `hit === n && n >= 5`.
- [ ] Mercado de 1T vindo da fonte B sempre exibe `amostraCurta` quando `n < 5`.
- [ ] Aba vazia diz "sem histórico suficiente", não uma lista inventada.
- [ ] Nenhuma regressão em `screener`/`frequencia` (contrato atual preservado).
- [ ] `tsc --noEmit` limpo; testes do motor verdes.

---

## 8. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Cota ESPN estourar | Cache 12 h em banco, sob demanda, nunca em lote; reuso em `frequencia` **reduz** o total |
| Base fria (`< 3` jogos) | Mercado some; texto explica o porquê |
| 1T de cantos com amostra 1–3 | Etiqueta obrigatória + nunca selo "100%" |
| Linha derivada virar ruído | 3 linhas por mercado, passo por tipo, mediana obrigatória |
| Duplicar lógica com o Screener | `tendencias.ts` **gera** `MercadoScreener`; uma mecânica só |

---

## 9. O que este plano deliberadamente não faz

- Não copia código, texto ou assets do original — fórmulas são matemática, reescritas do zero em TS tipado.
- Não implementa `refCedida` nem ligas irmãs (V2, conforme decisão).
- Não gera cards para redes sociais (descartado).
- Não cria módulo de NBA.
- Não altera o motor de props existente.

---

**Aguardando aprovação para iniciar pelo passo 1 (motor puro + testes).**
