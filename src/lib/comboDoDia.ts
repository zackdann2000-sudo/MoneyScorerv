/**
 * Combo do dia — múltiplas montadas a partir das oportunidades de valor do dia
 * (as que têm EV positivo na rota `/api/opportunities`).
 *
 * Camada PURA: recebe as oportunidades já calculadas (modelo Poisson × odd de
 * mercado) e devolve as combinações. Nada de rede, nada de banco — o mesmo
 * arquivo roda no cliente e no teste unitário.
 *
 * Três travas de honestidade, que são o motivo de existir esta função:
 *
 *  1. **Uma perna por jogo.** Os mercados do mesmo jogo vêm do mesmo Poisson:
 *     "over 2.5" e "ambas marcam" do mesmo jogo são dependentes. Multiplicar as
 *     probabilidades ali é inflar a conta, então a perna repetida é proibida —
 *     não é só "marcada como correlacionada", é descartada.
 *  2. **EV combinado honesto.** EV do combo = Π(prob·odd) − 1. É o produto dos
 *     EVs individuais: cada perna tem que pagar, senão a múltipla só amplifica
 *     a perda esperada.
 *  3. **Nada de odd inventada.** Perna sem odd > 1 não entra. Sem número, sem
 *     combo.
 */

/** Subconjunto de `OportunidadeValor` que esta camada realmente usa. */
export type OportunidadeLike = {
  matchId: string;
  league?: string;
  chave: string;
  mercado?: string;
  rotulo: string;
  odd: number;
  probModelo: number;
  evPct: number;
  kickoff?: string;
  fonteOdd?: string;
  home?: { name?: string } | null;
  away?: { name?: string } | null;
};

export type PernaDia = {
  /** `match:<matchId>:<chave>` — estável para o bilhete. */
  chave: string;
  matchId: string;
  league: string;
  matchLabel: string;
  rotulo: string;
  odd: number;
  prob: number;
  evPct: number;
  kickoff: string;
  fonteOdd: string;
  /** Odd da Pinnacle, quando a fonte da odd foi ela. Senão `null`. */
  oddPinnacle: number | null;
};

export type ComboDia = {
  tamanho: number;
  pernas: PernaDia[];
  /** Produto das odds. */
  odd: number;
  /** Produto das probabilidades do modelo. */
  prob: number;
  /** EV combinado em % de stake: (Π(prob·odd) − 1) · 100. */
  evPct: number;
  /** Faixa de risco pelo tamanho e pela probabilidade combinada. */
  risco: "conservador" | "moderado" | "agressivo";
};

export type OpcoesComboDia = {
  /** EV mínimo por perna, em %. Default 10 (as "melhores do dia"). */
  minEvPct?: number;
  /** Tamanhos de múltipla pedidos. Default [2, 3, 4]. */
  tamanhos?: number[];
  /** Quantas pernas entram na busca combinatória (custo). Default 10. */
  pool?: number;
  /** Odd combinada máxima aceita. Default 60 (acima já é bilhete de loteria). */
  oddMax?: number;
};

const EV_MIN_PADRAO = 10;
const POOL_PADRAO = 10;
const ODD_MAX_PADRAO = 60;
const TAMANHOS_PADRAO = [2, 3, 4];

const produto = (ns: number[]) => ns.reduce((a, b) => a * b, 1);
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/**
 * Oportunidades cruas → pernas elegíveis.
 *
 * Descarta (não corrige) o que não dá para usar: odd ausente/≤ 1, prob fora de
 * (0,1) e EV abaixo do corte. Ordena por EV e corta no `pool`.
 */
export function pernasDoDia(
  ops: OportunidadeLike[] | null | undefined,
  opts: OpcoesComboDia = {},
): PernaDia[] {
  const minEv = opts.minEvPct ?? EV_MIN_PADRAO;
  const pool = Math.max(2, opts.pool ?? POOL_PADRAO);
  if (!Array.isArray(ops)) return [];

  const vistas = new Set<string>();
  const saida: PernaDia[] = [];

  for (const o of ops) {
    if (!o || typeof o !== "object") continue;
    const odd = numero(o.odd);
    const prob = numero(o.probModelo);
    const evPct = numero(o.evPct);
    if (!(odd > 1) || !(prob > 0 && prob < 1)) continue;
    if (!Number.isFinite(evPct) || evPct < minEv) continue;

    const matchId = String(o.matchId || "").trim();
    if (!matchId) continue;

    const chave = `match:${matchId}:${String(o.chave || o.rotulo || "?")}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    const home = o.home?.name || "Mandante";
    const away = o.away?.name || "Visitante";
    const fonte = String(o.fonteOdd || "—");

    saida.push({
      chave,
      matchId,
      league: String(o.league || ""),
      matchLabel: `${home} × ${away}`,
      rotulo: String(o.rotulo || o.mercado || "Mercado"),
      odd,
      prob,
      evPct,
      kickoff: String(o.kickoff || ""),
      fonteOdd: fonte,
      // Âncora só quando a própria odd veio da Pinnacle: senão o EV da múltipla
      // no bilhete ficaria ancorado numa odd que não é de referência.
      oddPinnacle: /pinnacle/i.test(fonte) ? odd : null,
    });
  }

  return saida.sort((a, b) => b.evPct - a.evPct).slice(0, pool);
}

const riscoDe = (tamanho: number, prob: number): ComboDia["risco"] => {
  if (prob >= 0.25 && tamanho <= 2) return "conservador";
  if (prob >= 0.08) return "moderado";
  return "agressivo";
};

/**
 * Melhor combo de CADA tamanho pedido (2, 3, 4 pernas).
 *
 * "Melhor" = maior EV combinado; empate desempata pela maior probabilidade
 * (mais chance de acertar com o mesmo retorno proporcional).
 *
 * Regra dura: no máximo uma perna por jogo — ver nota de correlação no topo.
 */
export function combosDoDia(
  pernas: PernaDia[] | null | undefined,
  opts: OpcoesComboDia = {},
): ComboDia[] {
  const lista = Array.isArray(pernas) ? pernas.filter((p) => p && p.odd > 1 && p.prob > 0 && p.prob < 1) : [];
  if (lista.length < 2) return [];

  const tamanhos = (opts.tamanhos ?? TAMANHOS_PADRAO).filter((n) => n >= 2 && n <= 4);
  const oddMax = opts.oddMax ?? ODD_MAX_PADRAO;

  const melhores: ComboDia[] = [];

  for (const tamanho of tamanhos) {
    if (lista.length < tamanho) continue;

    let melhor: ComboDia | null = null;

    const visitar = (inicio: number, atual: PernaDia[]) => {
      if (atual.length === tamanho) {
        const odd = produto(atual.map((p) => p.odd));
        if (!(odd <= oddMax)) return;
        const prob = produto(atual.map((p) => p.prob));
        const evPct = (prob * odd - 1) * 100;
        const candidato: ComboDia = {
          tamanho,
          pernas: [...atual],
          odd,
          prob,
          evPct,
          risco: riscoDe(tamanho, prob),
        };
        if (!melhor || candidato.evPct > melhor.evPct + 1e-9 ||
            (Math.abs(candidato.evPct - melhor.evPct) <= 1e-9 && candidato.prob > melhor.prob)) {
          melhor = candidato;
        }
        return;
      }
      for (let i = inicio; i < lista.length; i++) {
        // Uma perna por jogo: mercados do mesmo jogo são dependentes.
        if (atual.some((p) => p.matchId === lista[i].matchId)) continue;
        atual.push(lista[i]);
        visitar(i + 1, atual);
        atual.pop();
      }
    };

    visitar(0, []);
    if (melhor) melhores.push(melhor);
  }

  return melhores;
}

/**
 * Retorno e lucro de um combo sobre uma banca.
 * `banca` inválida/negativa → zeros (nunca NaN na tela).
 */
export function retornoComBanca(
  combo: Pick<ComboDia, "odd"> | null | undefined,
  banca: number,
): { stake: number; retorno: number; lucro: number } {
  const b = Number.isFinite(banca) && banca > 0 ? banca : 0;
  const odd = combo && Number.isFinite(combo.odd) && combo.odd > 1 ? combo.odd : 0;
  if (!b || !odd) return { stake: b, retorno: 0, lucro: -b };
  const retorno = b * odd;
  return { stake: b, retorno: +retorno.toFixed(2), lucro: +(retorno - b).toFixed(2) };
}
