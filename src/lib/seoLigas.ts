/**
 * Catálogo das ligas com página de SEO (`/palpites/{slug}`).
 *
 * MÓDULO PURO — sem DB, sem rede, sem React. É o contrato entre a URL pública
 * e as linhas do banco:
 *
 *   1. `slug`      → é o que aparece na URL e nunca muda (link quebrado é o
 *                    pior passivo de SEO; renomear liga troca o `nome`, não o
 *                    `slug`).
 *   2. `hubSlugs`  → os valores REAIS de `hub_league.slug`. A mesma competição
 *                    entra no banco duas vezes ("premier-league" pela
 *                    Sportmonks e "espn-premier-league" pela ESPN), então a
 *                    página precisa consultar TODAS as linhas daquela liga ou
 *                    metade dos jogos fica de fora.
 *   3. `mainLeagueId` → a mesma chave de `mainLeagues.ts`, para o filtro de
 *                    "liga principal" e a home continuarem coerentes (null nas
 *                    competições que a home ainda não trata como principal).
 *
 * Regra de ouro: um `hub_league.slug` pertence a NO MÁXIMO uma liga aqui. Se
 * dois slugs do banco caírem na mesma página, ótimo (é o caso da Premier
 * League); se duas PÁGINAS disputarem o mesmo slug do banco, o mesmo jogo é
 * publicado em duas URLs e nós canibalizamos nós mesmos. O teste garante isso.
 *
 * `2. Bundesliga` é a armadilha real: contém "bundesliga" no slug e é uma
 * competição diferente. Por isso o mapa é explícito, nunca por `includes`.
 */

import { MAIN_LEAGUES } from "./mainLeagues";

export type SeoLiga = {
  /** Segmento da URL: /palpites/{slug}. Estável para sempre. */
  slug: string;
  /** Nome de exibição nas páginas. */
  nome: string;
  /** País/região — usado no breadcrumb e no texto. */
  pais: string;
  /** Chave equivalente em `mainLeagues.ts` (null: não é liga principal na home). */
  mainLeagueId: string | null;
  /** Valores de `hub_league.slug` que pertencem a esta liga (o 1º é o preferido). */
  hubSlugs: string[];
  /** Como o público busca — vira o texto da página, nunca keyword stuffing. */
  termos: string[];
  /**
   * Parágrafo próprio de cada liga. Existe para a página não ser 10 cópias do
   * mesmo texto: o Google trata página templated sem particularidade como
   * conteúdo duplicado, e o leitor também.
   */
  contexto: string;
};

/** Quantos jogos futuros a liga precisa ter para valer indexação. */
export const MIN_JOGOS_INDEXAVEIS = 3;

export const SEO_LIGAS: SeoLiga[] = [
  {
    slug: "brasileirao-serie-a",
    nome: "Brasileirão Série A",
    pais: "Brasil",
    mainLeagueId: "brasileirao_a",
    hubSlugs: ["espn-brasileirao-serie-a"],
    termos: ["palpites brasileirão série a", "jogos do brasileirão hoje", "probabilidades brasileirão"],
    contexto:
      "O Brasileirão tem o mando de campo mais valioso entre as ligas que cobrimos: viagem longa, calendário apertado e três competições ao mesmo tempo mudam a escalação. O modelo trata o desgaste e o mando com peso separado, e é por isso que o xG da casa aqui não é o mesmo da Premier League.",
  },
  {
    slug: "premier-league",
    nome: "Premier League",
    pais: "Inglaterra",
    mainLeagueId: "premier_league",
    hubSlugs: ["premier-league", "espn-premier-league"],
    termos: ["palpites premier league", "premier league hoje", "probabilidades premier league"],
    contexto:
      "A Premier League é a liga mais equilibrada do top 5: a diferença entre o 6º e o 15º costuma ser menor do que a variação de forma de um mês. O modelo corrige isso com peso exponencial nas últimas partidas, para não herdar a tabela de três meses atrás.",
  },
  {
    slug: "champions-league",
    nome: "Champions League",
    pais: "Europa",
    mainLeagueId: "champions_league",
    hubSlugs: ["espn-champions-league"],
    termos: ["palpites champions league", "jogos da champions hoje", "probabilidades champions"],
    contexto:
      "Na Champions, dois times da mesma página quase nunca jogaram entre si, então o H2H é fraco e a forma doméstica não é comparável: um líder de liga menor não vale o mesmo que o 4º da Premier League. O modelo normaliza a força dos adversários antes de comparar.",
  },
  {
    slug: "la-liga",
    nome: "La Liga",
    pais: "Espanha",
    mainLeagueId: "la_liga",
    hubSlugs: ["espn-laliga"],
    termos: ["palpites la liga", "la liga hoje", "probabilidades la liga"],
    contexto:
      "A La Liga é uma das ligas de menor média de gols do top 5 e onde o empate aparece com mais frequência. Por isso a leitura da página olha a dupla chance antes do 1X2: em jogo travado, o valor mora na cobertura, não no vencedor.",
  },
  {
    slug: "serie-a",
    nome: "Serie A",
    pais: "Itália",
    mainLeagueId: "serie_a",
    hubSlugs: ["espn-serie-a"],
    termos: ["palpites serie a", "serie a italiana hoje", "probabilidades serie a"],
    contexto:
      "A Serie A tem os maiores recortes entre casa e fora da Europa: times que brigam por título em casa somem fora. O modelo separa o desempenho de mandante e visitante em vez de usar uma média só, e é isso que faz o número do jogo fora ser diferente do jogo em casa.",
  },
  {
    slug: "bundesliga",
    nome: "Bundesliga",
    pais: "Alemanha",
    mainLeagueId: "bundesliga",
    hubSlugs: ["bundesliga", "espn-bundesliga"],
    termos: ["palpites bundesliga", "bundesliga hoje", "probabilidades bundesliga"],
    contexto:
      "A Bundesliga tem a maior média de gols entre as grandes ligas, e Over 2.5 é o mercado que mais aparece com valor. O modelo calibra a expectativa de gols pela liga, não por um número genérico de futebol europeu.",
  },
  {
    slug: "ligue-1",
    nome: "Ligue 1",
    pais: "França",
    mainLeagueId: "ligue_1",
    hubSlugs: ["espn-ligue-1"],
    termos: ["palpites ligue 1", "ligue 1 hoje", "probabilidades ligue 1"],
    contexto:
      "A Ligue 1 é a liga mais concentrada do top 5: um ou dois times dominam e o resto se equilibra em jogos de poucos gols. O modelo evita o erro clássico de projetar goleada só porque o favorito é grande.",
  },
  {
    slug: "brasileirao-serie-b",
    nome: "Brasileirão Série B",
    pais: "Brasil",
    mainLeagueId: "brasileirao_b",
    hubSlugs: ["espn-brasileirao-serie-b"],
    termos: ["palpites série b", "brasileirão série b hoje", "probabilidades série b"],
    contexto:
      "Na Série B a informação é escassa e a tabela muda de humor rápido: séries de três resultados movem um time da zona de acesso para a de rebaixamento. O modelo dá mais peso ao recorte recente justamente por isso.",
  },
  {
    slug: "mls",
    nome: "MLS",
    pais: "Estados Unidos",
    mainLeagueId: "mls",
    hubSlugs: ["espn-mls"],
    termos: ["palpites mls", "mls hoje", "probabilidades mls"],
    contexto:
      "A MLS tem viagem transcontinental e fuso: o desgaste de deslocamento pesa mais do que a diferença técnica entre elencos médios. O modelo não ignora isso, e a odd de mercado costuma ignorar.",
  },
  {
    slug: "liga-mx",
    nome: "Liga MX",
    pais: "México",
    mainLeagueId: null,
    hubSlugs: ["espn-liga-mx"],
    termos: ["palpites liga mx", "liga mx hoje", "probabilidades liga mx"],
    contexto:
      "A Liga MX mistura dois torneios por ano e uma liguilla que muda a importância de cada rodada. Mando de campo forte e altitude fazem parte do modelo — o mesmo time rende diferente na Cidade do México e fora dela.",
  },
];

/**
 * Detecta análise degenerada: TODOS os jogos da liga com o MESMO resumo.
 *
 * Acontece quando o motor roda com entrada repetida/placeholder — cada jogo
 * recebe uma cópia do mesmo vetor de probabilidades. Publicar isso é pior que
 * não publicar: Liverpool x United com 46% de empate e Hull x Brighton com os
 * mesmos 46% é visivelmente falso, e o Google lê como página duplicada.
 *
 * `assinaturas` = um JSON por análise. 0 ou 1 análise não é degenerado (não há
 * o que comparar). Com 2+, qualquer repetição já é sinal: um vetor de
 * probabilidades idêntico em dois jogos diferentes (xG e over25 com 4 casas)
 * não sai de um modelo que leu entrada distinta — sai de entrada repetida.
 */
export function analisesDegeneradas(assinaturas: string[]): boolean {
  if (assinaturas.length < 2) return false;
  return new Set(assinaturas).size < assinaturas.length;
}

/** Aceita a rota como veio da URL ("Premier-League", "premier-league"). */
export function ligaPorSlug(slug: string | undefined | null): SeoLiga | undefined {
  if (!slug) return undefined;
  const alvo = String(slug).trim().toLowerCase();
  return SEO_LIGAS.find((l) => l.slug === alvo);
}

/** Todos os `hub_league.slug` que a página precisa consultar. */
export function hubSlugsDa(liga: SeoLiga): string[] {
  return liga.hubSlugs;
}

/** Caminho público — fonte única para o sitemap, links e JSON-LD. */
export function caminhoDaLiga(liga: SeoLiga): string {
  return `/palpites/${liga.slug}`;
}

/** Título sem a marca: o `template` do layout raiz já acrescenta "| GreenScore". */
export function tituloSeo(liga: SeoLiga): string {
  return `Palpites ${liga.nome} — probabilidades, xG e placar provável`;
}

export function descricaoSeo(liga: SeoLiga): string {
  return `Probabilidades do modelo para os jogos do ${liga.nome}: 1X2, dupla chance, over/under 2.5, ambas marcam, xG esperado e placar mais provável. Cada número é registrado antes do jogo e o histórico é público.`;
}

/** Ordem canônica (volume de busca). Usada no hub /palpites e no sitemap. */
export function ligasParaListagem(): SeoLiga[] {
  return SEO_LIGAS;
}

/** Ids válidos de `mainLeagues.ts` — o teste usa para pegar erro de digitação. */
export function idsDeLigaPrincipal(): string[] {
  return MAIN_LEAGUES.map((l) => l.id);
}
