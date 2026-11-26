/**
 * BACKTEST DO LEDGER — módulo PURO.
 *
 * Sem DB, sem rede. É a matemática do Validador: pega as picks que já foram
 * liquidadas no `value_bet_history`, aplica o filtro (liga + mercado + janela)
 * e responde três perguntas:
 *
 *   1. Quanto teria rendido?          → lucro, ROI, banca final
 *   2. Quão doloroso foi no caminho?  → drawdown máximo e sequências
 *   3. O que a banca fazia a cada pick? → curva para o gráfico
 *
 * ## Modelo de stake (regra que não pode mudar)
 *
 * Stake FIXA em unidades (`unidade`, padrão 1) sobre uma banca inicial de 100.
 * Não compomos a stake com o resultado — de propósito: aqui a pergunta é "o
 * modelo acerta o preço?", não "eu sou bom de gestão de banca". Composto
 * multiplica o erro de uma amostra pequena e transforma sorte em curva bonita.
 * Green rende `unidade × (odd − 1)`, red custa `unidade`.
 *
 * Pick sem odd válida (> 1) não entra na curva: sem preço não existe P/L. Ela
 * é contada em `semOdd` para a tela explicar o que ficou de fora — nunca
 * inventamos uma odd.
 */

export type PickBacktest = {
  id: number;
  /** YYYY-MM-DD (`match_date`) — é o dia do jogo, não o do registro. */
  data: string;
  status: string; // green | red | pendente | ao_vivo | anulada
  odd: number | null;
  leagueName: string;
  mercado: string;
  rotulo: string;
  linha: number | null;
  homeName?: string;
  awayName?: string;
};

export type FiltroBacktest = {
  /** "all" ou o nome exato da liga. */
  liga?: string;
  /** "all" ou a chave do mercado (`over25`, `btts`, ...). */
  mercado?: string;
  /** Só a linha exata, quando informada (cartões/escanteios). */
  linha?: number | null;
  /** Janela em dias contada a partir de `agora`. `null` = tudo. */
  dias?: number | null;
};

export type OpcaoBacktest = { valor: string; rotulo: string; picks: number };

export type OpcoesBacktest = {
  ligas: OpcaoBacktest[];
  mercados: OpcaoBacktest[];
  /** Picks liquidadas no ledger inteiro (base do seletor). */
  liquidadas: number;
};

export type PontoBanca = {
  /** 0 = ponto de partida (banca inicial). */
  i: number;
  data: string;
  banca: number;
  lucroAcumulado: number;
  /** Desvio em relação ao pico, em unidades (≤ 0). */
  drawdown: number;
  odd: number | null;
  resultado: "green" | "red" | "inicio";
};

export type ResultadoBacktest = {
  liga: string;
  mercado: string;
  dias: number | null;
  bancaInicial: number;
  unidade: number;
  liquidadas: number;
  greens: number;
  reds: number;
  acerto: number | null;
  lucro: number;
  roi: number | null;
  bancaFinal: number;
  oddMedia: number | null;
  maiorSequenciaGreens: number;
  maiorSequenciaReds: number;
  sequenciaAtual: { tipo: "green" | "red"; n: number } | null;
  /** Maior queda do pico, em unidades (número positivo). */
  drawdownMaximo: number;
  drawdownMaximoPct: number | null;
  picoBanca: number;
  curva: PontoBanca[];
  primeiro: string | null;
  ultimo: string | null;
  /** Picks do recorte sem odd válida — fora da curva, contadas à parte. */
  semOdd: number;
};

const um = (v: number) => Math.round(v * 10) / 10;
const dois = (v: number) => Math.round(v * 100) / 100;
const tres = (v: number) => Math.round(v * 1000) / 1000;

const oddValida = (o: number | null | undefined): number | null => {
  const n = Number(o);
  return Number.isFinite(n) && n > 1 ? n : null;
};

/** Só green e red têm resultado. Pendente/ao vivo/anulada ficam fora de tudo. */
const liquidada = (p: PickBacktest) => p.status === "green" || p.status === "red";

/** Data (YYYY-MM-DD) em ms UTC. Data inválida = 0 (entra no início da fila). */
function msData(data: string): number {
  const t = Date.parse(`${String(data ?? "").slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? t : 0;
}

/** Opções do seletor, montadas do próprio ledger (nada hardcoded). */
export function opcoesDoLedger(picks: PickBacktest[]): OpcoesBacktest {
  const ligas = new Map<string, number>();
  const mercados = new Map<string, { n: number; rotulo: string }>();
  let liquidadas = 0;
  for (const p of picks) {
    if (!liquidada(p)) continue;
    liquidadas++;
    const liga = String(p.leagueName ?? "").trim();
    if (liga) ligas.set(liga, (ligas.get(liga) ?? 0) + 1);
    const m = String(p.mercado ?? "").trim();
    if (m) {
      const atual = mercados.get(m);
      mercados.set(m, { n: (atual?.n ?? 0) + 1, rotulo: atual?.rotulo || String(p.rotulo || m) });
    }
  }
  return {
    ligas: [...ligas.entries()]
      .map(([valor, picks]) => ({ valor, rotulo: valor, picks }))
      .sort((a, b) => b.picks - a.picks || a.valor.localeCompare(b.valor)),
    mercados: [...mercados.entries()]
      .map(([valor, v]) => ({ valor, rotulo: v.rotulo, picks: v.n }))
      .sort((a, b) => b.picks - a.picks || a.valor.localeCompare(b.valor)),
    liquidadas,
  };
}

/**
 * Aplica o recorte: status liquidado + liga + mercado + linha + janela.
 * A janela usa o dia do JOGO (`data`), não o dia em que a pick foi gravada.
 */
export function filtrarPicks(
  picks: PickBacktest[],
  filtro: FiltroBacktest = {},
  agora: Date = new Date(),
): PickBacktest[] {
  const liga = (filtro.liga ?? "all").trim();
  const mercado = (filtro.mercado ?? "all").trim();
  const dias = filtro.dias ?? null;
  const corte = dias != null && dias > 0 ? agora.getTime() - dias * 86_400_000 : null;

  return picks
    .filter(liquidada)
    .filter((p) => liga === "all" || !liga ? true : String(p.leagueName ?? "") === liga)
    .filter((p) => mercado === "all" || !mercado ? true : String(p.mercado ?? "") === mercado)
    .filter((p) => (filtro.linha == null ? true : Number(p.linha) === Number(filtro.linha)))
    .filter((p) => (corte == null ? true : msData(p.data) >= corte))
    .sort((a, b) => msData(a.data) - msData(b.data) || a.id - b.id);
}

/**
 * Roda o backtest no recorte.
 *
 * - A curva começa em `i: 0` com a banca inicial, para o gráfico ter origem.
 * - `drawdownMaximo` é a maior distância do pico em unidades; `%` é sobre o
 *   pico que existia naquele momento.
 * - Sem pick com odd válida a curva fica vazia (o gráfico mostra estado vazio).
 */
export function rodarBacktest(
  picks: PickBacktest[],
  filtro: FiltroBacktest = {},
  opts: { bancaInicial?: number; unidade?: number; agora?: Date } = {},
): ResultadoBacktest {
  const bancaInicial = Number.isFinite(opts.bancaInicial) && (opts.bancaInicial as number) > 0 ? Number(opts.bancaInicial) : 100;
  const unidade = Number.isFinite(opts.unidade) && (opts.unidade as number) > 0 ? Number(opts.unidade) : 1;
  const recorte = filtrarPicks(picks, filtro, opts.agora ?? new Date());

  let greens = 0;
  let reds = 0;
  let lucro = 0;
  let semOdd = 0;
  let banca = bancaInicial;
  let pico = bancaInicial;
  let ddMax = 0;
  let ddMaxPct: number | null = null;
  let seqG = 0;
  let seqR = 0;
  let maiorG = 0;
  let maiorR = 0;
  const odds: number[] = [];
  const curva: PontoBanca[] = [];

  if (recorte.some((p) => oddValida(p.odd) != null)) {
    curva.push({ i: 0, data: recorte[0]?.data ?? "", banca: bancaInicial, lucroAcumulado: 0, drawdown: 0, odd: null, resultado: "inicio" });
  }

  for (const p of recorte) {
    const green = p.status === "green";
    if (green) greens++;
    else reds++;

    if (green) {
      seqG++;
      seqR = 0;
    } else {
      seqR++;
      seqG = 0;
    }
    if (seqG > maiorG) maiorG = seqG;
    if (seqR > maiorR) maiorR = seqR;

    const odd = oddValida(p.odd);
    if (odd == null) {
      semOdd++;
      continue;
    }
    odds.push(odd);

    const variacao = green ? unidade * (odd - 1) : -unidade;
    lucro += variacao;
    banca += variacao;
    if (banca > pico) pico = banca;
    const dd = banca - pico;
    if (dd < -ddMax) {
      ddMax = -dd;
      ddMaxPct = pico > 0 ? um((-dd / pico) * 100) : null;
    }

    curva.push({
      i: curva.length,
      data: p.data,
      banca: dois(banca),
      lucroAcumulado: dois(lucro),
      drawdown: dois(dd),
      odd,
      resultado: green ? "green" : "red",
    });
  }

  const comOdd = greens + reds - semOdd;
  const liquidadas = greens + reds;

  return {
    liga: filtro.liga ?? "all",
    mercado: filtro.mercado ?? "all",
    dias: filtro.dias ?? null,
    bancaInicial,
    unidade,
    liquidadas,
    greens,
    reds,
    acerto: liquidadas ? um((greens / liquidadas) * 100) : null,
    lucro: tres(lucro),
    // ROI sobre o total apostado (stake fixa): comOdd × unidade.
    roi: comOdd > 0 ? um((lucro / (comOdd * unidade)) * 100) : null,
    bancaFinal: dois(banca),
    oddMedia: odds.length ? dois(odds.reduce((s, x) => s + x, 0) / odds.length) : null,
    maiorSequenciaGreens: maiorG,
    maiorSequenciaReds: maiorR,
    sequenciaAtual: seqG > 0 ? { tipo: "green", n: seqG } : seqR > 0 ? { tipo: "red", n: seqR } : null,
    drawdownMaximo: dois(ddMax),
    drawdownMaximoPct: ddMaxPct,
    picoBanca: dois(pico),
    curva,
    primeiro: recorte[0]?.data ?? null,
    ultimo: recorte[recorte.length - 1]?.data ?? null,
    semOdd,
  };
}
