/**
 * H2H Real — frequências reais dos últimos confrontos diretos.
 *
 * REGRA DE OURO: nada é estimado aqui. Cada número é uma contagem de jogos
 * reais. Quando a fonte não entrega o dado (cartões, faltas, escanteios), o
 * campo volta `null` e a tela mostra "Sem dados históricos" — nunca um chute.
 *
 * Módulo puro: sem import, sem I/O, sem rede.
 */

export type H2HJogoReal = {
  /** Gols do mandante do jogo histórico (não do time da casa de hoje). */
  golsCasa: number;
  golsFora: number;
  /** ISO da data do confronto — usado só para desempate do placar mais comum. */
  data?: string;
  cartoes?: number | null;
  faltas?: number | null;
  escanteios?: number | null;
};

/** Contagem de um mercado: `acertos` de `total` jogos. */
export type Frequencia = {
  acertos: number;
  total: number;
  /** 0..100, arredondado. */
  pct: number;
};

export type PlacarComum = {
  /** "1-0" no sentido casa-fora do confronto histórico. */
  placar: string;
  golsCasa: number;
  golsFora: number;
  vezes: number;
  pct: number;
  /** vezes/total sem arredondar (0..1). */
  prob: number;
  /** Odd que pagaria o preço justo se a frequência fosse a probabilidade. */
  oddJusta: number;
};

export type H2HResumo = {
  total: number;
  /** false quando há menos de 3 confrontos: número existe, mas é coincidência. */
  confiavel: boolean;
  over15: Frequencia | null;
  over25: Frequencia | null;
  over35: Frequencia | null;
  btts: Frequencia | null;
  cleanSheets: Frequencia | null;
  placarComum: PlacarComum | null;
  medias: {
    cartoes: number | null;
    faltas: number | null;
    escanteios: number | null;
  };
  /** Frase pronta, montada só com o que existe. */
  texto: string;
};

export const MIN_H2H_CONFIAVEL = 3;

const freq = (acertos: number, total: number): Frequencia => ({
  acertos,
  total,
  pct: total ? Math.round((acertos / total) * 100) : 0,
});

const valido = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const mediaDe = (valores: unknown[]): number | null => {
  const ok = valores.filter(valido);
  if (!ok.length) return null;
  return +(ok.reduce((s, v) => s + v, 0) / ok.length).toFixed(2);
};

/**
 * Resumo dos confrontos. Devolve `null` quando não há nenhum jogo com placar —
 * a tela então mostra "Sem dados históricos".
 */
export function resumirH2H(jogos: H2HJogoReal[] | null | undefined): H2HResumo | null {
  const limpos = (jogos || []).filter(
    (g) => valido(Number(g?.golsCasa)) && valido(Number(g?.golsFora)) && !Number.isNaN(Number(g.golsCasa)) && !Number.isNaN(Number(g.golsFora)),
  );
  if (!limpos.length) return null;

  const total = limpos.length;
  const soma = (fn: (g: H2HJogoReal) => boolean) => limpos.filter(fn).length;

  const over15 = freq(soma((g) => g.golsCasa + g.golsFora > 1.5), total);
  const over25 = freq(soma((g) => g.golsCasa + g.golsFora > 2.5), total);
  const over35 = freq(soma((g) => g.golsCasa + g.golsFora > 3.5), total);
  const btts = freq(soma((g) => g.golsCasa > 0 && g.golsFora > 0), total);
  /* Clean sheet em qualquer lado: algum time terminou sem levar gol. */
  const cleanSheets = freq(soma((g) => g.golsCasa === 0 || g.golsFora === 0), total);

  /* Placar exato mais repetido. Empate na contagem → o mais recente ganha. */
  const mapa = new Map<string, { golsCasa: number; golsFora: number; vezes: number; ultimo: number }>();
  for (const g of limpos) {
    const chave = `${g.golsCasa}-${g.golsFora}`;
    const atual = mapa.get(chave);
    const quand = g.data ? new Date(g.data).getTime() : 0;
    if (atual) {
      atual.vezes++;
      atual.ultimo = Math.max(atual.ultimo, quand || 0);
    } else {
      mapa.set(chave, { golsCasa: g.golsCasa, golsFora: g.golsFora, vezes: 1, ultimo: quand || 0 });
    }
  }

  let placarComum: PlacarComum | null = null;
  for (const [chave, v] of mapa) {
    if (!placarComum || v.vezes > placarComum.vezes) {
      placarComum = {
        placar: chave,
        golsCasa: v.golsCasa,
        golsFora: v.golsFora,
        vezes: v.vezes,
        pct: Math.round((v.vezes / total) * 100),
        prob: +(v.vezes / total).toFixed(4),
        oddJusta: +(total / v.vezes).toFixed(2),
      };
    }
  }

  const medias = {
    cartoes: mediaDe(limpos.map((g) => g.cartoes)),
    faltas: mediaDe(limpos.map((g) => g.faltas)),
    escanteios: mediaDe(limpos.map((g) => g.escanteios)),
  };

  const partes: string[] = [];
  partes.push(`Em ${total} confronto${total > 1 ? "s" : ""} direto${total > 1 ? "s" : ""}`);
  partes.push(`Over 1.5 saiu em ${over15.acertos} (${over15.pct}%)`);
  partes.push(`Over 2.5 em ${over25.acertos} (${over25.pct}%)`);
  partes.push(`ambas marcaram em ${btts.acertos} (${btts.pct}%)`);
  if (placarComum && placarComum.vezes > 1) {
    partes.push(`e o placar ${placarComum.placar.replace("-", "×")} se repetiu ${placarComum.vezes}×`);
  }
  const texto = `${partes.slice(0, 1).join("")}: ${partes.slice(1).join(", ")}.`;

  return {
    total,
    confiavel: total >= MIN_H2H_CONFIAVEL,
    over15,
    over25,
    over35,
    btts,
    cleanSheets,
    placarComum,
    medias,
    texto,
  };
}

export type DivergenciaPlacar = {
  /** Odd justa pela frequência observada (1/p). */
  oddJusta: number;
  /** Odd do mercado para aquele placar exato, quando a fonte publica. */
  oddMercado: number;
  /** lucro esperado em % de stake: (prob × oddMercado − 1) × 100. */
  evPct: number;
  /** "valor" quando a odd de mercado paga acima do justo. */
  rotulo: "valor" | "neutro" | "evitar";
};

/**
 * Cruza o placar mais comum com a odd de mercado do placar exato.
 * Sem odd de mercado, devolve `null` — não existe divergência sem preço.
 */
export function divergenciaPlacar(
  placarComum: PlacarComum | null | undefined,
  oddMercado: number | null | undefined,
): DivergenciaPlacar | null {
  if (!placarComum || !valido(oddMercado as number) || (oddMercado as number) <= 1) return null;
  const evPct = +((placarComum.prob * (oddMercado as number) - 1) * 100).toFixed(1);
  return {
    oddJusta: placarComum.oddJusta,
    oddMercado: oddMercado as number,
    evPct,
    rotulo: evPct >= 10 ? "valor" : evPct >= 0 ? "neutro" : "evitar",
  };
}
