/**
 * Combo Builder — matemática do bilhete, módulo PURO.
 *
 * Regras inegociáveis:
 *  1. A odd que entra no EV é SEMPRE a da Pinnacle (âncora). Se a Pinnacle não
 *     cotou aquele mercado, a perna fica sem odd (`null`) e o EV não é exibido —
 *     em vez de usar a odd de uma casa menor e fabricar valor que não existe.
 *  2. Probabilidade combinada é produto das marginais. Isso só vale para eventos
 *     independentes, e mercados do mesmo jogo NÃO são. Por isso toda combinação
 *     com pernas correlacionadas é marcada (`correlacionado: true` + motivo) e
 *     o EV dela não é publicado.
 *
 * Sem I/O, sem rede: serve para a rota, para o dock e para teste.
 */

export type Origem = "prop" | "mercado";

export type Perna = {
  /** id estável: `match:<fixture>:<mercadoId>` ou `prop:<fixture>:<jogador>:<mercado>:<linha>`. */
  chave: string;
  fixtureId: number;
  origem: Origem;
  /** "Palmeiras × Flamengo" — o que o usuário lê no bilhete. */
  matchLabel: string;
  /** Texto do mercado/perna. */
  rotulo: string;
  /** Id do mercado de jogo (`btts`, `over25_jogo`, ...) quando houver. */
  mercadoId?: string;
  /** `gols` | `gols_1t` | `escanteios` — usado na detecção de correlação. */
  grupo?: string;
  /** Nome do jogador, quando for prop. */
  jogador?: string;
  /** Probabilidade do modelo, 0..1. */
  prob: number;
  /** Odd da Pinnacle. `null` = a âncora não cotou este mercado. */
  odd: number | null;
  /** `true` quando a métrica é derivada (ex.: cantos do 1º tempo). */
  estimado?: boolean;
};

export type Perfil = "Seguro" | "Equilibrado" | "Ousado";

export type Combo = {
  perfil: Perfil;
  pernas: Perna[];
  prob: number;
  odd: number;
  /** `null` quando o combo tem perna sem odd de âncora ou correlação. */
  ev: number | null;
  correlacionado: boolean;
  motivo: string | null;
};

/**
 * Mercados de jogo → chave (market|selection) do banco de odds da Sportmonks.
 * Só o que a Pinnacle costuma cotar está mapeado; o resto simplesmente não tem
 * âncora, e é assim que deve ser.
 */
export const MAPA_ANCORA: Record<string, { market: string; selection: string }> = {
  btts: { market: "BTTS", selection: "Yes" },
  over15_jogo: { market: "Over/Under", selection: "Over 1.5" },
  over25_jogo: { market: "Over/Under", selection: "Over 2.5" },
};

/** Chave canônica usada no dicionário de âncoras. */
export const chaveAncora = (market: string, selection: string) => `${market}|${selection}`;

/** EV em % sobre a odd da âncora: prob × odd − 1. */
export function evDe(prob: number, odd: number | null | undefined): number | null {
  if (odd == null || !Number.isFinite(odd) || odd <= 1) return null;
  if (!Number.isFinite(prob) || prob <= 0 || prob >= 1) return null;
  return (prob * odd - 1) * 100;
}

/**
 * Por que duas pernas não podem ser multiplicadas como independentes.
 * `null` = independentes o suficiente para o produto.
 */
export function motivoCorrelacao(a: Perna, b: Perna): string | null {
  if (a.chave === b.chave) return "mesma seleção repetida";
  if (a.fixtureId !== b.fixtureId) return null;

  const jA = (a.jogador || "").trim().toLowerCase();
  const jB = (b.jogador || "").trim().toLowerCase();
  if (jA && jB && jA === jB) return `mesmo jogador (${a.jogador})`;

  // BTTS depende dos dois ataques: sobrepõe qualquer mercado de gols do jogo.
  const ehBtts = (p: Perna) => p.mercadoId === "btts";
  const ehGols = (p: Perna) => p.grupo === "gols" || p.grupo === "gols_1t";
  if ((ehBtts(a) && ehGols(b)) || (ehBtts(b) && ehGols(a))) {
    return "BTTS e mercado de gols se sobrepõem";
  }

  // Gols do jogo contêm os gols do 1º tempo (aninhados).
  const grupos = new Set([a.grupo, b.grupo].filter(Boolean));
  if (grupos.has("gols") && grupos.has("gols_1t")) {
    return "gols do 1º tempo estão dentro dos gols do jogo";
  }

  // Mesmo grupo no mesmo jogo (dois overs de gols, dois de cantos, ...).
  if (a.grupo && a.grupo === b.grupo) return `dois mercados de ${a.grupo} no mesmo jogo`;

  return null;
}

/** Correlação de um conjunto (primeiro par conflitante). */
export function correlacaoDoConjunto(pernas: Perna[]): string | null {
  for (let i = 0; i < pernas.length; i++) {
    for (let j = i + 1; j < pernas.length; j++) {
      const motivo = motivoCorrelacao(pernas[i], pernas[j]);
      if (motivo) return motivo;
    }
  }
  return null;
}

export type OpcoesCombos = {
  minPernas?: number;
  maxPernas?: number;
  /** Probabilidade mínima do combo. */
  minProb?: number;
  /** Quantas pernas no máximo entram na busca (custo combinatorial). */
  pool?: number;
};

const produto = (ns: number[]) => ns.reduce((a, b) => a * b, 1);

/**
 * Sugere três combos a partir das pernas com odd de âncora.
 *
 * Perfis:
 *  - Seguro ...... maior probabilidade (2 pernas, sem correlação)
 *  - Equilibrado . maior EV entre os de prob ≥ 15%
 *  - Ousado ...... maior odd entre os de prob ≥ 3%
 */
export function montarCombos(pernas: Perna[], opts: OpcoesCombos = {}): Combo[] {
  const minPernas = Math.max(2, opts.minPernas ?? 2);
  const maxPernas = Math.min(4, Math.max(minPernas, opts.maxPernas ?? 3));
  const minProb = opts.minProb ?? 0.03;
  const pool = Math.max(maxPernas, opts.pool ?? 8);

  const elegiveis = pernas
    .filter((p) => p.odd != null && p.odd > 1 && p.prob > 0 && p.prob < 1)
    .sort((a, b) => b.prob - a.prob)
    .slice(0, pool);

  if (elegiveis.length < minPernas) return [];

  const candidatos: Combo[] = [];
  const visitar = (inicio: number, atual: Perna[]) => {
    if (atual.length >= minPernas) {
      const prob = produto(atual.map((p) => p.prob));
      if (prob >= minProb) {
        const odd = produto(atual.map((p) => p.odd as number));
        const motivo = correlacaoDoConjunto(atual);
        candidatos.push({
          perfil: "Equilibrado",
          pernas: [...atual],
          prob,
          odd,
          ev: motivo ? null : evDe(prob, odd),
          correlacionado: Boolean(motivo),
          motivo,
        });
      }
    }
    if (atual.length >= maxPernas) return;
    for (let i = inicio; i < elegiveis.length; i++) {
      // 1 perna por mercado/jogador evita bilhete com duas linhas do mesmo mercado
      if (atual.some((p) => p.chave === elegiveis[i].chave)) continue;
      atual.push(elegiveis[i]);
      visitar(i + 1, atual);
      atual.pop();
    }
  };
  visitar(0, []);

  if (!candidatos.length) return [];

  // Preferência: combos sem correlação primeiro (produto honesto).
  const ordem = (a: Combo, b: Combo) => Number(a.correlacionado) - Number(b.correlacionado);

  const seguros = [...candidatos].sort((a, b) => ordem(a, b) || b.prob - a.prob || b.odd - a.odd);
  const equilibrados = [...candidatos]
    .filter((c) => c.prob >= 0.15)
    .sort((a, b) => ordem(a, b) || (b.ev ?? -999) - (a.ev ?? -999) || b.prob - a.prob);
  const ousados = [...candidatos]
    .filter((c) => c.prob >= 0.03)
    .sort((a, b) => ordem(a, b) || b.odd - a.odd);

  const escolhidos: Combo[] = [];
  const jaTem = (c: Combo) => escolhidos.some((e) => e.pernas.map((p) => p.chave).join() === c.pernas.map((p) => p.chave).join());
  const pegar = (lista: Combo[], perfil: Perfil) => {
    const c = lista.find((x) => !jaTem(x));
    if (c) escolhidos.push({ ...c, perfil });
  };
  pegar(seguros, "Seguro");
  pegar(equilibrados, "Equilibrado");
  pegar(ousados, "Ousado");

  return escolhidos;
}
