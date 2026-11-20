/**
 * Momentum ao vivo — a pressão da partida lida pelos LANCES, não pelo placar.
 *
 * Fonte: a narração da ESPN (`commentary`), que traz cada finalização, escanteio,
 * cartão e gol com minuto e time. Nada é estimado: se não há lance, não há barra
 * (e o componente mostra "sem lances recentes" em vez de uma onda decorativa).
 *
 * Módulo puro: sem I/O, sem rede.
 */

export type Lado = "home" | "away";

export type TipoLance =
  | "goal"
  | "pen"
  | "own"
  | "shot-on-target"
  | "shot-blocked"
  | "shot-off-target"
  | "corner"
  | "yellow"
  | "red"
  | "other";

export type Lance = { minuto: number; tipo: TipoLance; lado: Lado };

/** Peso de cada lance na pressão. Gol pesa como uma sequência inteira. */
export const PESOS: Record<TipoLance, number> = {
  goal: 4,
  pen: 4,
  own: 2.5,
  "shot-on-target": 1.6,
  "shot-blocked": 0.9,
  "shot-off-target": 0.6,
  corner: 0.9,
  yellow: 0.2,
  red: 0.2,
  other: 0,
};

/** Janelas oficiais do produto. */
export const JANELA_GRAFICO = 15;
export const JANELA_SINAL = 10;
/** Corte do selo: >80% FIRE, 60–80% BALL. */
export const CORTE_FIRE = 80;
export const CORTE_BALL = 60;

const norm = (s: string): string =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const TIPO_DE: Record<string, TipoLance> = {
  goal: "goal",
  "penalty-goal": "pen",
  "penalty---scored": "pen",
  "own-goal": "own",
  "shot-on-target": "shot-on-target",
  "shot-saved": "shot-on-target",
  "shot-blocked": "shot-blocked",
  "shot-off-target": "shot-off-target",
  "corner-awarded": "corner",
  "yellow-card": "yellow",
  "red-card": "red",
};

/** Minuto do lance: usa o displayValue ("44'") e cai para os segundos do clock. */
export function minutoDoLance(entry: any): number {
  const disp = String(entry?.time?.displayValue || "");
  const m = disp.match(/^(\d+)/); // "90+3'" conta como 90
  if (m) {
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) return n;
  }
  const seg = Number(entry?.time?.value ?? entry?.play?.time?.value);
  return Number.isFinite(seg) && seg > 0 ? Math.floor(seg / 60) : 0;
}

/**
 * Converte a narração crua da ESPN em lances com lado.
 * O time vem em `play.team.id` (quando existe) ou no nome — por isso o nome
 * também é comparado, normalizado.
 */
export function extrairLances(
  commentary: any[] | null | undefined,
  home: { id?: string | number; name: string },
  away: { id?: string | number; name: string },
): Lance[] {
  const hId = home?.id != null ? String(home.id) : "";
  const aId = away?.id != null ? String(away.id) : "";
  const hNome = norm(home?.name || "");
  const aNome = norm(away?.name || "");
  const out: Lance[] = [];
  for (const c of commentary || []) {
    const bruto = String(c?.play?.type?.type || c?.type?.type || "").toLowerCase();
    const tipo = TIPO_DE[bruto];
    if (!tipo) continue;
    const tId = c?.play?.team?.id != null ? String(c.play.team.id) : c?.team?.id != null ? String(c.team.id) : "";
    const tNome = norm(c?.play?.team?.displayName || c?.play?.team?.name || c?.team?.displayName || "");
    let lado: Lado | null = null;
    if (tId && (tId === hId || tId === aId)) lado = tId === hId ? "home" : "away";
    else if (tNome && (tNome === hNome || tNome === aNome)) lado = tNome === hNome ? "home" : "away";
    else if (tNome && hNome && (tNome.includes(hNome) || hNome.includes(tNome))) lado = "home";
    else if (tNome && aNome && (tNome.includes(aNome) || aNome.includes(tNome))) lado = "away";
    if (!lado) continue; // sem time identificado não entra na conta
    out.push({ minuto: minutoDoLance(c), tipo, lado });
  }
  return out.sort((a, b) => a.minuto - b.minuto);
}

export type Pressao = {
  /** Soma de peso por lado na janela. */
  casa: number;
  fora: number;
  total: number;
  /** 0..100. `null` quando não houve nenhum lance na janela. */
  pctCasa: number | null;
  pctFora: number | null;
  /** Lado dominante, ou null quando a janela está vazia/equilibrada. */
  dominante: Lado | null;
  /** Contagens cruas para a UI explicar de onde vem a barra. */
  golsCasa: number;
  golsFora: number;
  chutesCasa: number;
  chutesFora: number;
  escanteiosCasa: number;
  escanteiosFora: number;
  cartoesCasa: number;
  cartoesFora: number;
  janela: number;
  lances: number;
};

const vazio = (janela: number): Pressao => ({
  casa: 0,
  fora: 0,
  total: 0,
  pctCasa: null,
  pctFora: null,
  dominante: null,
  golsCasa: 0,
  golsFora: 0,
  chutesCasa: 0,
  chutesFora: 0,
  escanteiosCasa: 0,
  escanteiosFora: 0,
  cartoesCasa: 0,
  cartoesFora: 0,
  janela,
  lances: 0,
});

/**
 * Pressão ponderada com decaimento: um lance aos 80' ainda conta mais que um
 * aos 65' quando lemos a janela de 15 minutos.
 */
export function pressao(
  lances: Lance[],
  opts: { minuto: number; janela?: number } = { minuto: 0 },
): Pressao {
  const janela = opts.janela ?? JANELA_GRAFICO;
  const ate = opts.minuto > 0 ? opts.minuto : lances.reduce((m, l) => Math.max(m, l.minuto), 0);
  const desde = Math.max(0, ate - janela);
  const dentro = lances.filter((l) => l.minuto > desde && l.minuto <= ate && l.minuto > 0);
  if (!dentro.length) return vazio(janela);

  let casa = 0, fora = 0;
  const p = vazio(janela);
  p.lances = dentro.length;
  for (const l of dentro) {
    const distancia = Math.max(0, ate - l.minuto);
    const decaimento = 1 - 0.5 * Math.min(1, distancia / janela); // 1.0 agora → 0.5 na borda
    const peso = PESOS[l.tipo] * decaimento;
    if (l.lado === "home") casa += peso; else fora += peso;
    const ehGol = l.tipo === "goal" || l.tipo === "pen" || l.tipo === "own";
    const ehChute = l.tipo === "shot-on-target" || l.tipo === "shot-blocked" || l.tipo === "shot-off-target";
    const ehCartao = l.tipo === "yellow" || l.tipo === "red";
    if (l.lado === "home") {
      if (ehGol) p.golsCasa++;
      if (ehChute) p.chutesCasa++;
      if (l.tipo === "corner") p.escanteiosCasa++;
      if (ehCartao) p.cartoesCasa++;
    } else {
      if (ehGol) p.golsFora++;
      if (ehChute) p.chutesFora++;
      if (l.tipo === "corner") p.escanteiosFora++;
      if (ehCartao) p.cartoesFora++;
    }
  }
  const total = casa + fora;
  p.casa = +casa.toFixed(2);
  p.fora = +fora.toFixed(2);
  p.total = +total.toFixed(2);
  if (total <= 0) return p;
  p.pctCasa = Math.round((casa / total) * 100);
  p.pctFora = 100 - p.pctCasa;
  p.dominante = p.pctCasa >= p.pctFora ? "home" : "away";
  return p;
}

export type NivelSinal = "fire" | "ball" | null;

export type SinalPressao = {
  nivel: NivelSinal;
  lado: Lado | null;
  /** 0..100 do lado mais forte. */
  pct: number | null;
  rotulo: string;
};

/**
 * Selo do topo: FIRE acima de 80%, BALL entre 60% e 80%. Abaixo disso, nada —
 * selo que aparece sempre não informa nada.
 */
export function sinalPressao(p: Pressao | null | undefined): SinalPressao {
  if (!p || p.pctCasa == null || p.pctFora == null) return { nivel: null, lado: null, pct: null, rotulo: "" };
  const lado: Lado = p.pctCasa >= p.pctFora ? "home" : "away";
  const pct = Math.max(p.pctCasa, p.pctFora);
  if (pct > CORTE_FIRE) return { nivel: "fire", lado, pct, rotulo: "FIRE" };
  if (pct >= CORTE_BALL) return { nivel: "ball", lado, pct, rotulo: "BALL" };
  return { nivel: null, lado, pct, rotulo: "" };
}

export type BucketPressao = { min: number; casa: number; fora: number };

/** Série para o gráfico: peso por lado em fatias de `passo` minutos. */
export function seriePressao(
  lances: Lance[],
  opts: { minuto: number; janela?: number; passo?: number },
): BucketPressao[] {
  const janela = opts.janela ?? JANELA_GRAFICO;
  const passo = opts.passo ?? 3;
  const ate = opts.minuto > 0 ? opts.minuto : lances.reduce((m, l) => Math.max(m, l.minuto), 0);
  const desde = Math.max(0, ate - janela);
  const dentroDaJanela = lances.filter((l) => l.minuto > desde && l.minuto <= ate && l.minuto > 0);
  if (!dentroDaJanela.length) return [];
  const buckets: BucketPressao[] = [];
  for (let fim = desde + passo; fim <= ate; fim += passo) {
    const ini = fim - passo;
    const dentro = dentroDaJanela.filter((l) => l.minuto > ini && l.minuto <= fim);
    let casa = 0, fora = 0;
    for (const l of dentro) {
      const peso = PESOS[l.tipo];
      if (l.lado === "home") casa += peso; else fora += peso;
    }
    buckets.push({ min: fim, casa: +casa.toFixed(2), fora: +fora.toFixed(2) });
  }
  return buckets;
}
