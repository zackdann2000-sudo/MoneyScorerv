/**
 * "Palpite fixo" a partir dos confrontos diretos (H2H).
 *
 * Regra do produto: NÃO inventamos nada. A função recebe os gols dos últimos
 * confrontos (dados reais que já vêm do banco/ESPN) e devolve qual mercado mais
 * se repetiu, com a contagem exata (acertos/total) e o percentual.
 *
 * Módulo puro: sem imports, sem I/O, sem rede. Assim dá para testar com números
 * escritos à mão e reusar em qualquer módulo (match detail e apitou).
 */

export type H2HJogo = {
  golsCasa: number;
  golsFora: number;
};

export type Forca = "forte" | "moderado" | "leve";

export type PalpiteH2H = {
  /** chave estável do mercado */
  id: string;
  /** rótulo curto para o card */
  mercado: string;
  /** frase pronta para exibir */
  texto: string;
  acertos: number;
  total: number;
  /** 0..100 */
  pct: number;
  forca: Forca;
};

/** Janela pedida pelo produto. */
export const MAX_H2H = 7;
/** Menos que isso não é padrão, é coincidência. */
export const MIN_JOGOS = 3;
/** Abaixo disso não chamamos de "palpite fixo". */
const MIN_PCT_PRINCIPAL = 57;

type Candidato = {
  id: string;
  mercado: string;
  /** prioridade de desempate: menor = mais "informativo" */
  prio: number;
  teste: (g: H2HJogo) => boolean;
  frase: (acertos: number, total: number, pct: number) => string;
};

/**
 * Mercados avaliados. Só mercados de GOLS (linha fixa), que é o que o H2H
 * consegue provar: a fonte de H2H entrega apenas o placar. Ficam de fora
 * "vitória do mandante / empate / não perdeu" de propósito — com 7 amostras
 * eles acertam por acaso com frequência e dominariam o card, virando um
 * "palpite fixo" que não é palpite nenhum. O desempate (`prio`) prefere o
 * mercado mais específico quando dois acertam o mesmo número de jogos.
 */
const CANDIDATOS: Candidato[] = [
  {
    id: "over35",
    mercado: "Over 3.5 gols",
    prio: 0,
    teste: (g) => g.golsCasa + g.golsFora > 3.5,
    frase: (a, t, p) => `Over 3.5 gols em ${p}% dos jogos (${a}/${t}).`,
  },
  {
    id: "over25",
    mercado: "Over 2.5 gols",
    prio: 1,
    teste: (g) => g.golsCasa + g.golsFora > 2.5,
    frase: (a, t, p) => `Over 2.5 gols bateu em ${p}% (${a}/${t}).`,
  },
  {
    id: "casa15",
    mercado: "Mandante 2+ gols",
    prio: 2,
    teste: (g) => g.golsCasa > 1.5,
    frase: (a, t, p) => `O mandante fez 2+ gols em ${p}% (${a}/${t}).`,
  },
  {
    id: "fora15",
    mercado: "Visitante 2+ gols",
    prio: 3,
    teste: (g) => g.golsFora > 1.5,
    frase: (a, t, p) => `O visitante fez 2+ gols em ${p}% (${a}/${t}).`,
  },
  {
    id: "btts",
    mercado: "Ambas marcam",
    prio: 4,
    teste: (g) => g.golsCasa > 0 && g.golsFora > 0,
    frase: (a, t, p) => `Ambas as equipes marcaram em ${p}% (${a}/${t}).`,
  },
  {
    id: "over15",
    mercado: "Over 1.5 gols",
    prio: 5,
    teste: (g) => g.golsCasa + g.golsFora > 1.5,
    frase: (a, t, p) => `Over 1.5 gols bateu em ${p}% (${a}/${t}).`,
  },
];

function forcaDe(pct: number): Forca {
  if (pct >= 85) return "forte";
  if (pct >= 70) return "moderado";
  return "leve";
}

/**
 * Avalia todos os mercados sobre os jogos recebidos e devolve a lista ordenada
 * do que mais acontece para o que menos acontece.
 */
export function palpitesH2H(jogos: H2HJogo[]): PalpiteH2H[] {
  const validos = (jogos || []).filter(
    (g) => g && Number.isFinite(g.golsCasa) && Number.isFinite(g.golsFora),
  );
  const total = validos.length;
  if (total === 0) return [];

  return CANDIDATOS.map((c) => {
    const acertos = validos.filter((g) => c.teste(g)).length;
    const pct = Math.round((acertos / total) * 100);
    return {
      id: c.id,
      mercado: c.mercado,
      texto: c.frase(acertos, total, pct),
      acertos,
      total,
      pct,
      forca: forcaDe(pct),
    } as PalpiteH2H;
  }).sort((a, b) => {
    if (b.acertos !== a.acertos) return b.acertos - a.acertos;
    if (b.pct !== a.pct) return b.pct - a.pct;
    return CANDIDATOS.findIndex((c) => c.id === a.id) - CANDIDATOS.findIndex((c) => c.id === b.id);
  });
}

export type ResumoH2H = {
  /** palpite principal (o que mais acontece) ou null se não há padrão mínimo */
  principal: PalpiteH2H | null;
  /** segundo mais frequente, para o "também comum" */
  secundario: PalpiteH2H | null;
  /** quantos jogos entraram na conta */
  total: number;
  /** média de gols por confronto (1 casa decimal) */
  mediaGols: number;
};

/**
 * Resume o H2H para o card. `jogos` deve vir ordenado do mais recente para o
 * mais antigo e já limitado a 7 (ver MAX_H2H).
 */
export function resumoH2H(jogos: H2HJogo[]): ResumoH2H {
  const validos = (jogos || []).slice(0, MAX_H2H).filter(
    (g) => g && Number.isFinite(g.golsCasa) && Number.isFinite(g.golsFora),
  );
  const mediaGols =
    validos.length > 0
      ? Math.round((validos.reduce((s, g) => s + g.golsCasa + g.golsFora, 0) / validos.length) * 10) / 10
      : 0;

  if (validos.length < MIN_JOGOS) {
    return { principal: null, secundario: null, total: validos.length, mediaGols };
  }

  const ranking = palpitesH2H(validos);
  const principal = ranking.length > 0 && ranking[0].pct >= MIN_PCT_PRINCIPAL ? ranking[0] : null;
  // O secundário precisa ser um mercado diferente do principal e não ser trivial.
  const secundario =
    principal === null
      ? null
      : ranking.find((p) => p.id !== principal.id && p.pct >= MIN_PCT_PRINCIPAL && p.acertos < principal.acertos) ??
        null;

  return { principal, secundario, total: validos.length, mediaGols };
}
