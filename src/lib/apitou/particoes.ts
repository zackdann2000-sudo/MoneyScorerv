/**
 * Particionamento do resumo do apitou (M3).
 *
 * Antes: `apitou_cache` tinha UMA linha (`semana-v2`, ~1,2 MB) com a semana
 * inteira. Abrir um jogo custava carregar e parsear a semana toda, atualizar um
 * dia reescrevia os outros, e a agregação de desajustes não tinha cache.
 *
 * Agora o resumo é quebrado em linhas pequenas, cada uma com um trabalho só:
 *
 *   meta:apitou            ~1 KB    versão do sync, dias[], totais
 *   dia:<YYYY-MM-DD>       ~5 KB    lista enxuta dos jogos do dia (tela /jogos)
 *   jogo:<fixtureId>       ~30 KB   jogo bruto + props calculadas + desajustes
 *   desajustes:<dia>       ~40 KB   agregação transversal do dia
 *   desajustes:semana      ~40 KB   agregação da semana (quando não há ?date)
 *
 * A versão (`versao` = `salvadoEm` do sync) está em TODAS as linhas: um sync
 * novo muda a versão e invalida as partições antigas sem TTL para errar — o
 * mesmo truque que a rota de desajustes já usava.
 *
 * Este arquivo é PURO de propósito (sem `db`, sem `next`, sem `fetch`): é o que
 * permite testá-lo com fixture sem banco. Quem grava é `store.ts`; o script do
 * GitHub Actions importa daqui também, para não haver duas implementações do
 * mesmo recorte.
 */
import {
  calcularJogo,
  extrairDesajustes,
  type DesajusteCalculado,
  type PropCalculada,
} from "./analise";
import type { ResumoJogo } from "./fonte";

/**
 * Teto de tamanho por linha (payload jsonb). Um dia normal dá ~40 KB; o teto é
 * o alarme de "isto deixou de ser particionado" — 120 KB é o critério do M3.
 */
export const LIMITE_KB = 120;

export const PREFIXO_META = "meta:";
export const PREFIXO_DIA = "dia:";
export const PREFIXO_JOGO = "jogo:";
export const PREFIXO_DESAJUSTES = "desajustes:";
export const ESCOPO_SEMANA = "semana";

export const META_APITOU = `${PREFIXO_META}apitou`;

/** Chaves: uma função por partição, para nenhum lado inventar formato. */
export const chaveMeta = () => META_APITOU;
export const chaveDia = (dia: string) => `${PREFIXO_DIA}${dia}`;
export const chaveJogo = (fixtureId: number) => `${PREFIXO_JOGO}${fixtureId}`;
export const chaveDesajustes = (escopo: string) => `${PREFIXO_DESAJUSTES}${escopo}`;

/**
 * Dia local (America/Sao_Paulo) de um kickoff em ISO.
 *
 * É a borda do fuso: o banco e o resumo vivem em UTC, e o recorte "dia" é o do
 * usuário. Um jogo de 21h local não pode cair no dia seguinte.
 */
export function diaSaoPaulo(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Tamanho aproximado do payload em KB (o jsonb guarda o texto). */
export function tamanhoKb(valor: unknown): number {
  return Math.round((JSON.stringify(valor)?.length ?? 0) / 1024);
}

/* ------------------------------------------------------------------ */
/* Tipos das partições                                                */
/* ------------------------------------------------------------------ */

/** Jogo sem props calculadas — o que a lista (`/jogos`) precisa. */
export type JogoEnxuto = {
  id: number;
  competicao: string;
  ligaId: number;
  home: string;
  away: string;
  kickoff: string;
  dia: string;
  jogadores: number;
  mercados: number;
  temEscalacao: boolean;
  arbitro: string | null;
};

export type MetaApitou = {
  /** Versão do sync (= salvadoEm). Muda a cada gravação e invalida partições. */
  versao: string;
  geradoEm: string;
  salvadoEm: number;
  fonte: string;
  dias: string[];
  jogosTotal: number;
  propsTotal: number;
  desajustesTotal: number;
  avisos: string[];
};

export type ParticaoDia = {
  versao: string;
  dia: string;
  geradoEm: string;
  salvadoEm: number;
  jogos: JogoEnxuto[];
};

export type ParticaoJogo = {
  versao: string;
  geradoEm: string;
  salvadoEm: number;
  jogo: ResumoJogo;
  props: PropCalculada[];
  desajustes: DesajusteCalculado[];
};

export type ParticaoDesajustes = {
  versao: string;
  escopo: string;
  geradoEm: string;
  salvadoEm: number;
  itens: DesajusteCalculado[];
};

/** Linha pronta para o upsert em `apitou_cache`. */
export type LinhaCache = { cacheKey: string; kind: string; geradoEm: string; payload: unknown };

export type Particionado = {
  meta: MetaApitou;
  linhas: LinhaCache[];
  /** Diagnóstico por chave — o sync loga e o teste confere o teto de 120 KB. */
  tamanhos: { chave: string; kb: number }[];
};

/* ------------------------------------------------------------------ */
/* Recorte                                                            */
/* ------------------------------------------------------------------ */

/** Enxuga um jogo para a lista. */
export function enxugar(jogo: ResumoJogo): JogoEnxuto {
  return {
    id: jogo.id,
    competicao: jogo.competicao,
    ligaId: jogo.ligaId,
    home: jogo.home,
    away: jogo.away,
    kickoff: jogo.kickoff,
    dia: diaSaoPaulo(jogo.kickoff),
    jogadores: jogo.jogadores.length,
    mercados: jogo.mercados.length,
    temEscalacao: Boolean(jogo.escHome || jogo.escAway),
    arbitro: jogo.arbitro?.nome ?? null,
  };
}

/** Agrupa jogos por dia local, em ordem cronológica. */
export function agruparPorDia(jogos: ResumoJogo[]): Map<string, ResumoJogo[]> {
  const porDia = new Map<string, ResumoJogo[]>();
  for (const jogo of jogos) {
    const dia = diaSaoPaulo(jogo.kickoff);
    const lista = porDia.get(dia);
    if (lista) lista.push(jogo);
    else porDia.set(dia, [jogo]);
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id - b.id);
  }
  return new Map([...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Quebra o resumo em partições.
 *
 * As props são calculadas AQUI, uma vez por jogo, no momento da gravação —
 * não no request. O cálculo é aritmética pura sobre campos já em memória, então
 * sai de graça no fim de um sync que já custou 22 MB de download; em troca,
 * `/jogo/:id` vira a leitura de uma linha só.
 */
export function particionar(
  resumo: { geradoEm: string; fonte: string; salvadoEm: number; jogos: ResumoJogo[]; avisos: string[] },
  opcoes: { minimoEdge?: number } = {},
): Particionado {
  const minimoEdge = opcoes.minimoEdge ?? 0.03;
  const versao = String(resumo.salvadoEm);
  const porDia = agruparPorDia(resumo.jogos);

  const linhas: LinhaCache[] = [];
  const tamanhos: { chave: string; kb: number }[] = [];

  const empilhar = (cacheKey: string, kind: string, payload: unknown) => {
    linhas.push({ cacheKey, kind, geradoEm: resumo.geradoEm, payload });
    tamanhos.push({ chave: cacheKey, kb: tamanhoKb(payload) });
  };

  const todosDesajustes: DesajusteCalculado[] = [];
  const todosProps: PropCalculada[] = [];
  let propsTotal = 0;

  // ── por dia (jogos + desajustes) e por jogo (props já calculadas)
  for (const [dia, jogos] of porDia) {
    const propsDoDia: PropCalculada[] = [];

    for (const jogo of jogos) {
      const props = calcularJogo(jogo);
      const desajustes = extrairDesajustes(props, minimoEdge);
      propsTotal += props.length;
      propsDoDia.push(...props);
      todosProps.push(...props);
      todosDesajustes.push(...desajustes);

      const particao: ParticaoJogo = {
        versao,
        geradoEm: resumo.geradoEm,
        salvadoEm: resumo.salvadoEm,
        jogo,
        props,
        desajustes,
      };
      empilhar(chaveJogo(jogo.id), "jogo", particao);
    }

    const diaParticao: ParticaoDia = {
      versao,
      dia,
      geradoEm: resumo.geradoEm,
      salvadoEm: resumo.salvadoEm,
      jogos: jogos.map(enxugar),
    };
    empilhar(chaveDia(dia), "dia", diaParticao);

    const desajustesDoDia: ParticaoDesajustes = {
      versao,
      escopo: dia,
      geradoEm: resumo.geradoEm,
      salvadoEm: resumo.salvadoEm,
      // Já vêm ordenados por edge dentro de cada jogo; o sort global mantém a
      // mesma ordem que a rota devolvia quando calculava tudo por request.
      itens: extrairDesajustes(propsDoDia, minimoEdge),
    };
    empilhar(chaveDesajustes(dia), "desajustes", desajustesDoDia);
  }

  // ── semana inteira: o caso de `/desajustes` sem `?date`
  const semana: ParticaoDesajustes = {
    versao,
    escopo: ESCOPO_SEMANA,
    geradoEm: resumo.geradoEm,
    salvadoEm: resumo.salvadoEm,
    itens: extrairDesajustes(todosProps, minimoEdge),
  };
  empilhar(chaveDesajustes(ESCOPO_SEMANA), "desajustes", semana);

  const meta: MetaApitou = {
    versao,
    geradoEm: resumo.geradoEm,
    salvadoEm: resumo.salvadoEm,
    fonte: resumo.fonte,
    dias: [...porDia.keys()],
    jogosTotal: resumo.jogos.length,
    propsTotal,
    desajustesTotal: todosDesajustes.length,
    avisos: resumo.avisos.slice(0, 50),
  };
  empilhar(chaveMeta(), "meta", meta);

  return { meta, linhas, tamanhos };
}

/* ------------------------------------------------------------------ */
/* Filtro do escopo (mesma ordem e mesmas regras da rota)             */
/* ------------------------------------------------------------------ */

/**
 * Filtra a lista de desajustes de uma partição.
 *
 * `principais` roda ANTES do `slice(limit)`: filtrar depois devolveria menos
 * itens que o pedido e a paginação "carregar mais" ficaria furada.
 */
export function filtrarDesajustes(
  itens: DesajusteCalculado[],
  opcoes: { nivel?: string | null; principais?: boolean; minimoEdge?: number } = {},
): DesajusteCalculado[] {
  const minimo = opcoes.minimoEdge ?? 0;
  let saida = minimo > 0 ? itens.filter((d) => d.edge >= minimo) : itens;
  if (opcoes.nivel) saida = saida.filter((d) => d.nivel === opcoes.nivel);
  // O filtro de liga principal depende de `isMainLeague`, que vive em outro
  // módulo; quem chama aplica (mantém este arquivo sem dependência de dados).
  return saida;
}

/** Contagem por nível, como a rota devolve em `contagem`. */
export function contarPorNivel(itens: DesajusteCalculado[]): Record<string, number> {
  return itens.reduce<Record<string, number>>((acc, d) => {
    acc[d.nivel] = (acc[d.nivel] ?? 0) + 1;
    return acc;
  }, {});
}
