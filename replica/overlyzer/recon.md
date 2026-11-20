# Overlyzer — recon estático (v2026)

Alvo: `https://www.overlyzer.com/pt` · Empresa **Overlyzer GmbH** (Áustria) · foco em **pressão ao vivo**
para mercados over/under.

Método: **clean-room** — `robots.txt`, `sitemap.xml`, HTML público das páginas PT/EN, página de registo e
tutorial. Nada de bundle JavaScript, nada de área logada, nenhuma chamada à API privada. O que não foi
observado está marcado como **não observado**.

## Permissões (verificadas)

```
# https://www.overlyzer.com/robots.txt
Sitemap: https://www.overlyzer.com/sitemap_index.xml
User-Agent: *
allow: /
```

`Allow: /` sem `Disallow`. Não há `Content-Signal` de IA; o uso aqui é **referência de produto**, não cópia
de dados ou de código.

## Stack

- **Next.js** (App Router: `_next/static`, 116 referências no HTML) + React.
- Renderização **no servidor para as tabelas** (os HTML trazem os dados já no markup: rankings, médias,
  tabelas de apostas com números reais).
- A tela **`/live` é client-side** (o HTML tem só o casco: legendas e esqueletos `...`).
- 7 idiomas: en, de, es, fr, pt, ru, tr. Sitemap com 76 URLs (11 por idioma).
- Checkout fora do domínio: `shop.overlyzer.com` (produtos de 1 e 3 meses).

## Mapa de telas (rotas reais)

| # | rota | tela |
|---|---|---|
| S01 | `/pt` | landing: 6 módulos, prova social, preços |
| S02 | `/pt/live` | **Ao vivo**: gráfico de pressão por jogo, filtros, odds pré e ao vivo |
| S03 | `/pt/prematch` | **Rankings de equipes** (era a "área pré-jogo" antiga) |
| S04 | `/pt/prematch/upcoming` | **Estatísticas de jogos**: próximos jogos ordenados por probabilidade |
| S05 | `/pt/prematch/match-averages` | **Médias de jogo** por equipe (casa/fora/combinado) |
| S06 | `/pt/prematch/betting-tables` | **Tabelas de apostas**: a tabela da liga refeita por mercado |
| S07 | `/pt/prematch/reports` | **AI Reports**: 6 mercados, hoje e amanhã, 1 grátis/dia |
| S08 | `/pt/register` + `/pt/register/tutorial` | registo e tutorial (fluxo de afiliação) |
| S09 | `/pt/apostas/*` | 3 artigos SEO de estratégia (15 estratégias, "aposte como profissional") |

## S02 — Ao vivo (o coração do produto)

Legendas lidas direto do HTML: cada jogo é uma **linha com gráfico de pressão** e as colunas são

```
Pressão do mandante · Pressão do visitante · Pressão · Pressão total nos últimos 10 minutos
Pressão total do jogo · Odds 1X2 pré-jogo · Odds 1X2 ao vivo
```

Cinco densidades de layout: `Padrão · Largo · Largo 3 · Compacto · Foco`.

Exemplos de filtro rápido citados na landing (texto literal):

- mais de 65% de posse de bola
- mais de 15 finalizações no gol
- mais de 15 escanteios
- uma equipe vencendo por 4 gols ou mais
- uma equipe com cartão vermelho / 2+ vermelhos

E dois recursos de fluxo:
1. **salvar filtros** ("salve seus filtros e receba um alerta quando um jogo bater com seus critérios");
2. **alerta por FCM/push** quando um jogo ao vivo casa com o filtro salvo.

> A pressão deles é a mesma ideia do nosso gráfico de momentum (peso por tipo de lance, janela de 10 min),
> mas eles mostram as DUAS pressões como série contínua e o total do jogo — e acoplam isso a odds ao vivo.

## S03 — Rankings de equipes

Seletor de métrica, com o que é grátis e o que é PRO:

| métrica | acesso |
|---|---|
| Mais de 2.5 · Menos de 2.5 (gols) | **grátis** |
| Mais de 0.5 / 1.5 / 3.5 / 4.5 · Menos de 1.5 / 3.5 / 4.5 | PRO |
| Ambas marcam | PRO |
| Gols (total), 1º tempo, 2º tempo, Resultados, Detalhes dos gols | PRO |
| Escanteios, Cartões, Estatísticas, xG e avançado | PRO |

Filtros da tela (texto real): `Todas as ligas · 3 meses · Mín. jogos 7+ · "Jogam nos próximos 7 dias" ·
Excluir: Juniores / Feminino / Amadores / Seleções · Principais ligas · Seleção ampla (Todas) · Filtros salvos · Redefinir`.

Colunas do ranking: `Clube · Liga · Próximo jogo · JG · <métrica> · acertos/total` (ex.: `100.0% · 10/10`).

## S04 — Estatísticas de jogos (upcoming)

"Todos os próximos jogos ordenados pela **probabilidade** de gols, escanteios ou cartões. Mais/Menos,
Ambas marcam, para o jogo todo ou por tempo." — tabela com `Data/Hora · Casa · Fora · Liga · Casa % ·
Fora % · Combinado %`. Exemplo real do HTML: `Basel × Vaduz 100.0% / 100.0% → combinado 95.9%`.

## S05 — Médias de jogo

Colunas: `Data/Hora · Casa (Marcados·Sofridos·Total) · Fora (Marcados·Sofridos·Total) · Combinado · Liga · JG`.
Métricas: `Gols` (grátis), `Escanteios / Cartões / xG / Posse de bola` (PRO).

## S06 — Tabelas de apostas

Estrutura (Premier League, temporada atual):
`Clube · JG · GP · GC · SG · Pts · Média · +1.5 · +2.5 · +3.5 · −1.5 · −2.5 · −3.5 · BTTS · SSG · SM`
(SSG = sofreu sem gol / clean sheet; SM = sem marcar). Tem `Glossário` e visão **desempenho geral / casa / fora**
e variante **Padrão / Avançado / xG**.

## S07 — AI Reports

Seis mercados, hoje e amanhã:

```
1X2 · +2.5 gols · −2.5 gols · +9.5 escanteios · +4.5 cartões · +1.5 no 1º tempo
```

Cada palpite vem com **justificativa em linguagem simples** (ex.: "Em uma tendência de muitos gols, tanto
o LASK quanto o Hartberg têm consistentemente proporcionado partidas com muitos gols."), em 7 idiomas.
Freemium: "1 relatório grátis por dia; assine para desbloquear os 6 mercados e os palpites de amanhã."

## Modelo de dados inferido

```
team_metric {
  team, league, jogos (JG),
  gols_marcados, gols_sofridos, total, media,
  over15, over25, over35, under15, under25, under35, btts, ssg, sm,
  corners_over95, cards_over45, xg, posse, 1t, 2t
}
match_upcoming { dataHora, casa, fora, liga, prob_casa%, prob_fora%, combinado% }
live_match {
  casa, fora, minuto, placar,
  pressao_casa, pressao_fora, pressao, pressao_10min, pressao_total,
  odd_pre_1x2, odd_live_1x2, posse, chutes_no_gol, escanteios, cartoes (amarelo/vermelho)
}
ai_report { data, mercado, jogo, palpite, texto_justificativa, idioma }
```

## Monetização (texto público)

- **1 mês 19 €** (4,44 €/semana) · **3 meses 49 €** (3,77 €/semana, "14% mais barato").
- "Tudo incluído, em todos os planos" — não há plano anual nem tier acima.
- Checkout em `shop.overlyzer.com` (fora do app; sem billing in-app na web).
- **Afiliado**: o registo "grátis" exige criar conta numa casa parceira via link deles e enviar print do
  depósito de pelo menos €100 (tutorial oficial). Ou seja: o funil monetiza por CPA além da assinatura.
- Prova social: "250.000+ usuários · 2.000+ ligas · 500.000+ downloads".

## Lacunas honestas (não observado)

- **Fórmula da pressão** (pesos por tipo de lance) — está no bundle client-side; não foi lido.
- **Filtros personalizados**: os campos exatos e o limite por plano não são públicos.
- **Tela de detalhe do jogo** (`/live/<id>`?): não existe no sitemap; é aberta por estado de cliente.
- **AI Reports**: só o texto de venda e 1 exemplo; os 30 palpites/dia não são acessíveis sem login.
- **Odds**: mostra odd pré e ao vivo, mas não publica a casa/provedor (não dá para saber a fonte).
- Play Store bloqueou o fetch (403), então não li a descrição da loja.
