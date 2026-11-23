/**
 * Dados das páginas de SEO por liga (`/palpites/{liga}`).
 *
 * SERVIDOR APENAS (toca o Postgres). Uma função, quatro queries — o resto é
 * montagem em memória. Nada de API externa aqui: a página é ISR de 10 minutos,
 * então tudo o que ela mostra precisa estar no banco, senão o request de
 * revalidação fica dependente da ESPN (foi o erro do `/palpites-ia`).
 *
 * Regras de honestidade do dado (as mesmas do resto do app):
 *  - jogo sem análise aparece com `analise: false` e a UI diz "em preparação";
 *    não inventamos probabilidade nem escondemos o jogo;
 *  - `analysisText` vazio hoje é a REGRA (nenhuma linha tem texto), então o
 *    bloco de leitura some em vez de renderizar um espaço em branco;
 *  - sem `summary`, não há xG: campo `null`, nunca 0.
 */
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  hubAnalysis,
  hubFixture,
  hubLeague,
  hubPredictionRow,
  hubTeam,
  hubTopScore,
  type HubAnalysisSummary,
} from "@/db/hub-schema";
import { analisesDegeneradas, MIN_JOGOS_INDEXAVEIS, type SeoLiga } from "@/lib/seoLigas";

/** Janela de jogos que a página mostra (passado curto + semana à frente). */
const HORAS_ATRAS = 12;
const DIAS_A_FRENTE = 8;
const LIMITE_JOGOS = 40;

export type ProbabilidadesSeo = {
  casa: number | null;
  empate: number | null;
  fora: number | null;
  duplaCasaEmpate: number | null;
  duplaCasaFora: number | null;
  duplaEmpateFora: number | null;
  over25: number | null;
  under25: number | null;
  btts: number | null;
  semBtts: number | null;
};

export type JogoSeo = {
  id: number;
  /** ISO — a UI formata em horário de Brasília. */
  inicio: string;
  casa: string;
  fora: string;
  casaSlug: string | null;
  foraSlug: string | null;
  liveState: string;
  encerrado: boolean;
  /** "2-1" quando o jogo já começou; null antes do apito. */
  placar: string | null;
  /** true = existe análise do modelo para este jogo. */
  analise: boolean;
  forcaFavorito: string | null;
  favorito: "casa" | "fora" | null;
  topProb: number | null;
  xgCasa: number | null;
  xgFora: number | null;
  golsEsperados: number | null;
  over25: number | null;
  btts: number | null;
  confianca: number | null;
  placarProvavel: { casa: number; fora: number; prob: number } | null;
  probs: ProbabilidadesSeo | null;
  /** Texto do Relatório IA — string vazia quando o modelo não escreveu. */
  leitura: string;
  /** Tem odd real publicada? (sem odd não existe value bet) */
  temOdd: boolean;
};

export type LigaSeo = {
  liga: SeoLiga;
  jogos: JogoSeo[];
  totalJogos: number;
  totalAnalisados: number;
  /** Futuros = ainda não começaram (a regra de noindex conta só estes). */
  jogosFuturos: number;
  /** Última análise gerada (ISO) — vira "atualizado em" e `lastModified`. */
  atualizadoEm: string | null;
  /**
   * Todas as análises da liga têm o mesmo resumo. Sinal de motor rodando com
   * entrada repetida: a página não indexa e avisa que o número está em revisão.
   */
  revisao: boolean;
  indexavel: boolean;
};

const vazio = (liga: SeoLiga): LigaSeo => ({
  liga,
  jogos: [],
  totalJogos: 0,
  totalAnalisados: 0,
  jogosFuturos: 0,
  atualizadoEm: null,
  revisao: false,
  indexavel: false,
});

/** Só os mercados que a página usa, para não varrer 40 seleções por jogo. */
const PROB = {
  "1X2": ["Home", "Draw", "Away"],
  DoubleChance: ["HomeOrDraw", "HomeOrAway", "DrawOrAway"],
  "Over/Under": ["Over 2.5", "Under 2.5"],
  BTTS: ["Yes", "No"],
} as const;

export async function carregarLiga(liga: SeoLiga): Promise<LigaSeo> {
  try {
    const linhas = await db
      .select({ id: hubLeague.id })
      .from(hubLeague)
      .where(inArray(hubLeague.slug, liga.hubSlugs));
    if (linhas.length === 0) return vazio(liga);

    const ids = linhas.map((l) => l.id);
    const casa = alias(hubTeam, "casa_seo");
    const fora = alias(hubTeam, "fora_seo");

    const agora = Date.now();
    const jogos = await db
      .select({
        id: hubFixture.id,
        inicio: hubFixture.matchDate,
        liveState: hubFixture.liveState,
        homeScore: hubFixture.homeScore,
        awayScore: hubFixture.awayScore,
        minutesPlayed: hubFixture.minutesPlayed,
        casa: casa.name,
        casaSlug: casa.slug,
        fora: fora.name,
        foraSlug: fora.slug,
      })
      .from(hubFixture)
      .innerJoin(casa, eq(casa.id, hubFixture.homeTeamId))
      .innerJoin(fora, eq(fora.id, hubFixture.awayTeamId))
      .where(
        and(
          inArray(hubFixture.leagueId, ids),
          gte(hubFixture.matchDate, new Date(agora - HORAS_ATRAS * 3600_000)),
          lte(hubFixture.matchDate, new Date(agora + DIAS_A_FRENTE * 86_400_000)),
        ),
      )
      .orderBy(asc(hubFixture.matchDate))
      .limit(LIMITE_JOGOS);

    if (jogos.length === 0) return vazio(liga);

    const fixtureIds = jogos.map((j) => j.id);

    /* Várias versões/tipos de análise podem existir para o mesmo jogo. A
       escolhida é "Final" quando existe, senão a de maior versão — é a mesma
       preferência da página do jogo, para o número não divergir entre telas. */
    const analises = await db
      .select({
        id: hubAnalysis.id,
        fixtureId: hubAnalysis.fixtureId,
        version: hubAnalysis.version,
        tipo: hubAnalysis.analysisType,
        summary: hubAnalysis.summary,
        confianca: hubAnalysis.confidence,
        texto: hubAnalysis.analysisText,
        criadoEm: hubAnalysis.createdAt,
      })
      .from(hubAnalysis)
      .where(inArray(hubAnalysis.fixtureId, fixtureIds))
      .orderBy(asc(hubAnalysis.fixtureId), asc(hubAnalysis.version));

    const melhor = new Map<number, (typeof analises)[number]>();
    for (const a of analises) {
      const atual = melhor.get(a.fixtureId);
      if (!atual) { melhor.set(a.fixtureId, a); continue; }
      const ganha = a.tipo === "Final" && atual.tipo !== "Final";
      if (ganha || (a.tipo === atual.tipo && a.version > atual.version)) melhor.set(a.fixtureId, a);
    }

    const analiseIds = [...melhor.values()].map((a) => a.id);
    const probs = new Map<number, ProbabilidadesSeo>();
    const provaveis = new Map<number, { casa: number; fora: number; prob: number }>();

    if (analiseIds.length > 0) {
      const mercados = Object.keys(PROB) as (keyof typeof PROB)[];
      const selecoes = mercados.flatMap((m) => PROB[m].map((s) => ({ m, s })));

      const linhas2 = await db
        .select({
          analysisId: hubPredictionRow.analysisId,
          market: hubPredictionRow.market,
          selection: hubPredictionRow.selection,
          probability: hubPredictionRow.probability,
        })
        .from(hubPredictionRow)
        .where(
          and(
            inArray(hubPredictionRow.analysisId, analiseIds),
            inArray(hubPredictionRow.market, mercados),
            inArray(hubPredictionRow.selection, selecoes.map((x) => x.s)),
          ),
        );

      /* Uma passada: inicializa o registro na primeira seleção vista. */
      for (const l of linhas2) {
        const p = probs.get(l.analysisId) ?? {
          casa: null, empate: null, fora: null,
          duplaCasaEmpate: null, duplaCasaFora: null, duplaEmpateFora: null,
          over25: null, under25: null, btts: null, semBtts: null,
        };
        if (l.market === "1X2") {
          if (l.selection === "Home") p.casa = l.probability;
          else if (l.selection === "Draw") p.empate = l.probability;
          else if (l.selection === "Away") p.fora = l.probability;
        } else if (l.market === "DoubleChance") {
          if (l.selection === "HomeOrDraw") p.duplaCasaEmpate = l.probability;
          else if (l.selection === "HomeOrAway") p.duplaCasaFora = l.probability;
          else if (l.selection === "DrawOrAway") p.duplaEmpateFora = l.probability;
        } else if (l.market === "Over/Under") {
          if (l.selection === "Over 2.5") p.over25 = l.probability;
          else if (l.selection === "Under 2.5") p.under25 = l.probability;
        } else if (l.market === "BTTS") {
          if (l.selection === "Yes") p.btts = l.probability;
          else if (l.selection === "No") p.semBtts = l.probability;
        }
        probs.set(l.analysisId, p);
      }

      const placares = await db
        .select({
          analysisId: hubTopScore.analysisId,
          casa: hubTopScore.home,
          fora: hubTopScore.away,
          probability: hubTopScore.probability,
        })
        .from(hubTopScore)
        .where(inArray(hubTopScore.analysisId, analiseIds));

      for (const p of placares) {
        const atual = provaveis.get(p.analysisId);
        if (!atual || p.probability > atual.prob) {
          provaveis.set(p.analysisId, { casa: p.casa, fora: p.fora, prob: p.probability });
        }
      }
    }

    const agoraIso = new Date().toISOString();
    const lista: JogoSeo[] = jogos.map((j) => {
      const a = melhor.get(j.id);
      const s: HubAnalysisSummary | null | undefined = a?.summary ?? null;
      const p = a ? probs.get(a.id) ?? null : null;
      const comecou = j.liveState !== "NS" && j.liveState !== "POSTPONED";
      return {
        id: j.id,
        inicio: j.inicio.toISOString(),
        casa: j.casa,
        fora: j.fora,
        casaSlug: j.casaSlug ?? null,
        foraSlug: j.foraSlug ?? null,
        liveState: j.liveState,
        encerrado: ["FT", "AET", "PEN"].includes(j.liveState),
        placar: comecou ? `${j.homeScore}-${j.awayScore}` : null,
        analise: Boolean(a),
        favorito: s?.favouriteSide === "Home" ? "casa" : s?.favouriteSide === "Away" ? "fora" : null,
        forcaFavorito: s?.favouriteStrength ?? null,
        topProb: s?.topProbability ?? null,
        xgCasa: s?.xgHome ?? null,
        xgFora: s?.xgAway ?? null,
        golsEsperados: s?.expectedTotalGoals ?? null,
        over25: s?.over25Probability ?? p?.over25 ?? null,
        btts: s?.bttsProbability ?? p?.btts ?? null,
        confianca: a?.confianca ?? null,
        placarProvavel: a ? provaveis.get(a.id) ?? null : null,
        probs: p,
        leitura: (a?.texto ?? "").trim(),
        temOdd: s?.hasOdds ?? false,
      };
    });

    const jogosFuturos = lista.filter((j) => !j.placar).length;
    const totalAnalisados = lista.filter((j) => j.analise).length;
    const atualizadoEm = analises.length > 0
      ? analises.reduce((max, a) => (a.criadoEm > max ? a.criadoEm : max), analises[0].criadoEm).toISOString()
      : agoraIso;

    /* Resumos repetidos = motor rodou com entrada placeholder (ver
       `analisesDegeneradas`). Não indexa e a UI avisa. */
    const revisao = analisesDegeneradas(
      [...melhor.values()].map((a) => JSON.stringify(a.summary ?? null)),
    );

    return {
      liga,
      jogos: lista,
      totalJogos: lista.length,
      totalAnalisados,
      jogosFuturos,
      atualizadoEm,
      revisao,
      /* Portão de conteúdo: liga com poucos jogos, sem nenhuma análise ou com
         todo mundo com o mesmo número não pede indexação. Página pobre ou
         falsa indexada é pior que página ausente. */
      indexavel: jogosFuturos >= MIN_JOGOS_INDEXAVEIS && totalAnalisados >= 1 && !revisao,
    };
  } catch (e) {
    // Banco fora não pode virar página de erro 500 indexada.
    console.error("[seo/liga]", liga.slug, e instanceof Error ? e.message : String(e));
    return vazio(liga);
  }
}

/** Todos os jogos de todas as ligas — usado pelo hub /palpites. */
export async function carregarTodas(ligas: SeoLiga[]): Promise<LigaSeo[]> {
  return await Promise.all(ligas.map((l) => carregarLiga(l)));
}
