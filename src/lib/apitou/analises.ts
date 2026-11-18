/**
 * Bloco de 4 análises do /apitou: gols, cartões, faltas e impedimentos.
 *
 * Todos os números saem de médias reais do raio-X da fonte (jogos da temporada
 * do time): quanto o time produz (`own`) e quanto ele concede (`adv`). Nada é
 * inventado — se a amostra não existe, o item volta com `semDados: true`.
 *
 * Modelo (transparente, o mesmo espírito do resto do módulo):
 *   λ_casa = (produção do mandante + concessão do visitante) / 2
 *   λ_fora = (produção do visitante + concessão do mandante) / 2
 *   λ_jogo = λ_casa + λ_fora
 * A "linha sugerida" é a meia-linha imediatamente abaixo do total esperado
 * (λ 23.4 -> 22.5) e a probabilidade vem da Poisson de sobrevivência.
 *
 * É estimativa de média, não leitura de mercado: por isso o card nunca fala em
 * odd nem em valor esperado.
 */
import { mediaComDecaimento, poissonSF } from "./engine";
import type { SerieTime } from "./fonte";

export type MetricaId = "gols" | "cartoes" | "faltas" | "impedimentos";

/** Só os campos que este bloco usa — aceita StatsTime completo ou cache antigo. */
export type StatsLite = {
  jogos?: number;
  /** Série dos últimos 10 jogos — quando existe, a média vira ponderada. */
  serie?: SerieTime;
  gols?: number;
  golsSof?: number;
  amarelos?: number;
  amarelosSof?: number;
  faltas?: number;
  faltasSof?: number;
  impedimentos?: number;
  impedimentosSof?: number;
};

export type AnaliseItem = {
  id: MetricaId;
  titulo: string;
  unidade: string;
  /** Média por jogo do mandante e do visitante (campo `own`). */
  mediaCasa: number | null;
  mediaFora: number | null;
  /** Média por jogo que cada um concede (campo `adv`). */
  concedidaCasa: number | null;
  concedidaFora: number | null;
  /** Total esperado do jogo (λ_casa + λ_fora). */
  lambda: number | null;
  /** Meia-linha abaixo do total esperado. */
  linha: number | null;
  /** P(total > linha) pela Poisson. */
  prob: number | null;
  /** Quem tende a produzir mais. */
  favorito: "casa" | "fora" | "equilibrio" | null;
  amostraCasa: number;
  amostraFora: number;
  semDados: boolean;
};

type Def = {
  id: MetricaId;
  titulo: string;
  unidade: string;
  own: keyof StatsLite;
  ownSof: keyof StatsLite;
};

/** Mercados do bloco, na ordem em que aparecem na tela. */
const DEFS: Def[] = [
  { id: "gols", titulo: "Gols", unidade: "gols", own: "gols", ownSof: "golsSof" },
  { id: "cartoes", titulo: "Cartões", unidade: "cartões", own: "amarelos", ownSof: "amarelosSof" },
  { id: "faltas", titulo: "Faltas", unidade: "faltas", own: "faltas", ownSof: "faltasSof" },
  { id: "impedimentos", titulo: "Impedimentos", unidade: "impedimentos", own: "impedimentos", ownSof: "impedimentosSof" },
];

/** Diferença relativa a partir da qual há um lado claramente mais produtivo. */
const TOLERANCIA_FAVORITO = 0.15;

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function arred(v: number, casas = 2): number {
  const p = 10 ** casas;
  return Math.round(v * p) / p;
}

/** Item vazio, com um motivo explícito: a tela mostra "sem dados". */
function vazio(def: Def, amostraCasa: number, amostraFora: number): AnaliseItem {
  return {
    id: def.id,
    titulo: def.titulo,
    unidade: def.unidade,
    mediaCasa: null,
    mediaFora: null,
    concedidaCasa: null,
    concedidaFora: null,
    lambda: null,
    linha: null,
    prob: null,
    favorito: null,
    amostraCasa,
    amostraFora,
    semDados: true,
  };
}

/**
 * Calcula as 4 análises. Devolve sempre 4 itens, na ordem de `DEFS`; quem não
 * puder ser calculado vem com `semDados: true` (nunca com zero fingido).
 */
export function quatroAnalises(
  casa: StatsLite | null | undefined,
  fora: StatsLite | null | undefined,
): AnaliseItem[] {
  const amostraCasa = Math.max(0, Math.floor(num(casa?.jogos) ?? 0));
  const amostraFora = Math.max(0, Math.floor(num(fora?.jogos) ?? 0));

  return DEFS.map((def) => {
    // Com a série em mãos, a média é ponderada pela forma recente
    // (1.5 nos 3 últimos jogos, 1.0 do 4º ao 7º, 0.5 do 8º ao 10º). Sem série,
    // cai para a média de temporada que veio da fonte.
    // Nomes de campo da série e de StatsLite são os mesmos, então o índice
    // cru serve para os dois.
    const campoNum = (lado: StatsLite | null | undefined, campo: keyof SerieTime) =>
      num((lado as Record<string, unknown> | undefined)?.[campo]);

    const ponderada = (lado: StatsLite | null | undefined, campo: keyof SerieTime) => {
      const serie = lado?.serie?.[campo];
      const media = serie?.length ? mediaComDecaimento(serie) : null;
      return media != null && media > 0 ? media : campoNum(lado, campo);
    };

    const ownCasa = ponderada(casa, def.own as keyof SerieTime);
    const ownFora = ponderada(fora, def.own as keyof SerieTime);
    const sofCasa = ponderada(casa, def.ownSof as keyof SerieTime);
    const sofFora = ponderada(fora, def.ownSof as keyof SerieTime);

    // Sem os quatro números não há média cruzada honesta: não chutamos.
    if (ownCasa == null || ownFora == null || sofCasa == null || sofFora == null) {
      return vazio(def, amostraCasa, amostraFora);
    }

    const lamCasa = (ownCasa + sofFora) / 2;
    const lamFora = (ownFora + sofCasa) / 2;
    const lambda = lamCasa + lamFora;

    if (!Number.isFinite(lambda) || lambda <= 0) {
      return vazio(def, amostraCasa, amostraFora);
    }

    // Meia-linha abaixo do total esperado: λ 23.4 -> 22.5.
    const linha = Math.max(0.5, Math.floor(lambda) - 0.5);
    const prob = poissonSF(linha, lambda);

    const maior = Math.max(lamCasa, lamFora);
    const menor = Math.min(lamCasa, lamFora);
    const favorito: AnaliseItem["favorito"] =
      maior <= 0 ? "equilibrio" : (maior - menor) / maior <= TOLERANCIA_FAVORITO ? "equilibrio" : lamCasa > lamFora ? "casa" : "fora";

    return {
      id: def.id,
      titulo: def.titulo,
      unidade: def.unidade,
      mediaCasa: arred(ownCasa),
      mediaFora: arred(ownFora),
      concedidaCasa: arred(sofCasa),
      concedidaFora: arred(sofFora),
      lambda: arred(lambda),
      linha: arred(linha, 1),
      prob: arred(prob, 4),
      favorito,
      amostraCasa,
      amostraFora,
      semDados: false,
    };
  });
}
