/**
 * Critérios de desempate de classificação — lógica PURA, sem banco e sem rede.
 *
 * Por que este arquivo existe:
 *
 * Uma tabela de classificação não é "ordenar por pontos". Quando dois times
 * empatam em pontos, quem fica na frente depende da REGRA DA COMPETIÇÃO:
 *
 *   - Serie A (ITA), Premier League, La Liga, Bundesliga, Ligue 1:
 *       pontos -> saldo de gols -> gols pró
 *   - Brasileirão Série A e B:
 *       pontos -> VITÓRIAS -> saldo de gols -> gols pró
 *   - Série A italiana e La Liga usam confronto direto em empates específicos
 *
 * Aplicar a regra errada não quebra nada visivelmente: a tabela continua
 * bonita, com números plausíveis, e está ERRADA. Foi exatamente esse o risco
 * que a sonda `scripts/probe-tiebreak.mjs` confirmou com dado real do
 * Brasileirão de 2026: Vitória (11 vitórias, saldo -15) fica em 14º e
 * Mirassol (10 vitórias, saldo -9) em 15º. Ordenar por saldo inverteria os dois.
 *
 * Regra de ouro deste módulo: **se faltar um campo exigido pela regra, falha**.
 * Um comparador que lê `undefined -> 0` fica cego em silêncio e devolve a ordem
 * errada — foi o bug da primeira versão da sonda. Preferimos falhar de forma
 * barulhenta a publicar uma tabela que mente.
 */

/** Campo que participa da ordenação. Espelha os nomes do Football-Data v4. */
export type CampoDesempate =
  | "points"
  | "won"
  | "draw"
  | "goalDifference"
  | "goalsFor"
  | "goalsAgainst";

/** Regra ordenada, do critério mais forte para o mais fraco. */
export type RegraDesempate = readonly CampoDesempate[];

/** Padrão FIFA / Europeu. `won` NÃO entra: saldo antes de vitórias. */
export const DESEMPATE_PADRAO: RegraDesempate = ["points", "goalDifference", "goalsFor"];

/**
 * Série A e B do Brasil: vitórias antes de saldo (art. 8º do RGC).
 * `goalsFor` entra depois do saldo para desempatar times com campanha idêntica.
 */
export const DESEMPATE_BRASIL: RegraDesempate = ["points", "won", "goalDifference", "goalsFor"];

/**
 * Competições com regra própria, indexadas pelo código do Football-Data.
 *
 * Só entra aqui quem realmente diverge do padrão. Manter a lista curta é
 * proposital: cada linha errada aqui vira uma tabela errada em produção.
 *
 * Fonte das regras: regulamentos das competições (RGC/CBF para o Brasil).
 * Conferido com dado real via `scripts/probe-tiebreak.mjs`.
 */
export const DESEMPATE_POR_COMPETICAO: Record<string, RegraDesempate> = {
  // Brasil
  BSA: DESEMPATE_BRASIL,
  B: DESEMPATE_BRASIL,
};

/** Resolve a regra de um código de competição, caindo no padrão quando desconhecida. */
export function regraPara(codigo: string | null | undefined): RegraDesempate {
  if (!codigo) return DESEMPATE_PADRAO;
  return DESEMPATE_POR_COMPETICAO[codigo.toUpperCase()] ?? DESEMPATE_PADRAO;
}

/** Linha mínima necessária para ordenar. Tudo numérico — nada de string solta. */
export type LinhaOrdenavel = {
  points: number;
  won: number;
  draw?: number;
  goalDifference: number;
  goalsFor: number;
  goalsAgainst?: number;
  /** Posição que o FORNECEDOR publicou. Último critério: resolve confronto direto. */
  position?: number;
  /** Só para desempate determinístico final e mensagem de erro legível. */
  name?: string;
};

/**
 * Garante que todo campo da regra existe e é número em TODAS as linhas.
 *
 * Lança em vez de degradar: um sync que escreve tabela com comparador cego é
 * pior que um sync que não escreve nada (o anterior continua válido).
 */
export function validarLinhas(linhas: readonly LinhaOrdenavel[], regra: RegraDesempate): void {
  if (linhas.length === 0) return;
  for (let i = 0; i < regra.length; i++) {
    const campo = regra[i];
    for (let j = 0; j < linhas.length; j++) {
      const valor = (linhas[j] as Record<string, unknown>)[campo];
      if (typeof valor !== "number" || !Number.isFinite(valor)) {
        const nome = linhas[j].name ?? `linha ${j}`;
        throw new Error(
          `Desempate: campo "${campo}" ausente ou não numérico na linha "${nome}" ` +
            `(regra: ${regra.join(" > ")}). Recusando ordenar para não publicar tabela errada.`,
        );
      }
    }
  }
}

/**
 * Comparador da regra.
 *
 * Ordem final deliberada:
 *   1. campos da regra (descendente);
 *   2. `position` do fornecedor (ascendente) — resolve empate EXATO, que é
 *      justamente onde entra o confronto direto, que não dá para calcular a
 *      partir de um retrato da tabela;
 *   3. nome (ascendente) — último recurso, garante ordem total e determinística.
 *
 * Sem os passos 2 e 3 dois times com campanha idêntica trocariam de lugar a
 * cada sync, e a UI mostraria a tabela "dançando" sem nenhum jogo novo.
 */
export function comparador(regra: RegraDesempate): (a: LinhaOrdenavel, b: LinhaOrdenavel) => number {
  return (a, b) => {
    for (let i = 0; i < regra.length; i++) {
      const campo = regra[i];
      const va = a[campo] as number;
      const vb = b[campo] as number;
      if (va !== vb) return vb - va; // descendente: maior primeiro
    }
    const pa = a.position ?? Number.MAX_SAFE_INTEGER;
    const pb = b.position ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  };
}

/**
 * Ordena e atribui a posição (1-based).
 *
 * Devolve uma cópia: nunca muta a entrada, porque o chamador costuma guardar
 * o retrato do fornecedor para comparar/depurar.
 *
 * `confiavel = false` significa que dois ou mais times empataram em TODOS os
 * critérios da regra e a ordem veio do fornecedor/alfabeto. A UI pode marcar
 * isso; o sync grava de qualquer forma, mas o fato fica registrado.
 */
export function ordenarTabela<T extends LinhaOrdenavel>(
  linhas: readonly T[],
  regra: RegraDesempate,
): Array<T & { position: number }> & { confiavel: boolean } {
  validarLinhas(linhas, regra);
  const ordenadas = [...linhas].sort(comparador(regra)).map((linha, i) => ({
    ...linha,
    position: i + 1,
  }));

  // Duas linhas com a mesma assinatura de regra = empate que o fornecedor
  // resolveu por confronto direto. Sinalizamos, não escondemos.
  let confiavel = true;
  for (let i = 1; i < ordenadas.length; i++) {
    const igual = regra.every((campo) => {
      const a = ordenadas[i - 1][campo] as number;
      const b = ordenadas[i][campo] as number;
      return a === b;
    });
    if (igual) {
      confiavel = false;
      break;
    }
  }

  return Object.assign(ordenadas, { confiavel });
}

/** Explica em uma frase por que o time está naquela posição. Usado na UI. */
export function explicaPosicao(regra: RegraDesempate): string {
  const rotulo: Record<CampoDesempate, string> = {
    points: "pontos",
    won: "vitórias",
    draw: "empates",
    goalDifference: "saldo de gols",
    goalsFor: "gols pró",
    goalsAgainst: "gols contra",
  };
  return regra.map((c) => rotulo[c] ?? c).join(" › ");
}
