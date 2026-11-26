/**
 * MOTIVO CONGELADO — o retrato da decisão no instante em que o pick nasce.
 *
 * Módulo PURO (sem DB, sem rede). É o que `registrarOportunidadesDoDia` grava
 * em `value_bet_history.motivo` e o que a tela `/desempenho` mostra em
 * "Ver detalhes".
 *
 * ## Por que congelar
 *
 * Depois do apito, tudo muda: a odd fecha, o xG é recalculado com o jogo que
 * acabou de entrar na amostra, o modelo ganha mais jogos e a probabilidade que
 * publicamos deixa de existir. Sem um snapshot, "por que esse pick foi
 * publicado?" só teria resposta inventada — e auditoria que se reescreve não é
 * auditoria.
 *
 * ## O que congela e o que não congela
 *
 * Congela **o que o sistema sabia na hora**: probabilidade, odd, odd justa,
 * edge, EV, stake, TRUST, amostra, λ e xG usados, e a frase `porque` que o
 * próprio motor escreveu. Não congela nada que não existia: campo sem dado vira
 * `null` e a tela mostra "—", nunca zero.
 */

/** Versão do snapshot. Se o formato mudar, o consumidor sabe o que esperar. */
export const MOTIVO_VERSAO = 1;

export type MotivoPick = {
  v: number;
  /** ISO do instante do registro (a pick está congelada aqui). */
  registradoEm: string;
  mercado: string;
  rotulo: string;
  linha: number | null;
  /** Probabilidade do modelo (0..1) no instante do registro. */
  prob: number | null;
  /** Probabilidade implícita na odd (1/odd). */
  probImplicita: number | null;
  odd: number | null;
  oddJusta: number | null;
  /** Edge = prob modelo − prob implícita (pontos percentuais, 0..1). */
  edge: number | null;
  /** EV em % de stake. */
  evPct: number | null;
  /** Fração de Kelly usada (% da banca, 0..5). */
  stake: number | null;
  /** Nota TRUST 0–10 e seu rótulo ("Excelente" | "Boa" | "Cautela"). */
  trust: number | null;
  trustRotulo: string | null;
  confianca: string | null;
  faixa: string | null;
  /** Jogos de histórico que sustentavam o cálculo. */
  amostra: number | null;
  fonteOdd: string | null;
  /** Gols esperados pelo modelo (λ) de cada lado. */
  lambdaCasa: number | null;
  lambdaFora: number | null;
  /** xG médio por time que entrou no λ, e de onde veio. */
  xgCasa: number | null;
  xgFora: number | null;
  xgFonte: string | null;
  xgCobertura: number | null;
  /** Probabilidades do modelo no jogo (1X2, over 2.5, ambas marcam). */
  probs: { casa: number | null; empate: number | null; fora: number | null; over25: number | null; btts: number | null } | null;
  /** Frase de transparência escrita pelo motor no momento do pick. */
  porque: string | null;
};

/** Entrada do pick (o que `avaliarOportunidades` devolve). Só o necessário. */
export type EntradaMotivo = {
  mercado: string;
  rotulo: string;
  linha?: number | null;
  probModelo?: number | null;
  probImplicita?: number | null;
  odd?: number | null;
  oddJusta?: number | null;
  valor?: number | null;
  evPct?: number | null;
  stake?: number | null;
  trust?: number | null;
  trustRotulo?: string | null;
  confianca?: string | null;
  faixa?: string | null;
  amostra?: number | null;
  fonteOdd?: string | null;
  porque?: string | null;
};

/** Contexto do jogo no instante do pick (λ/xG/probs do motor). */
export type ContextoMotivo = {
  lambdaHome?: number | null;
  lambdaAway?: number | null;
  xgHome?: number | null;
  xgAway?: number | null;
  xgFonte?: string | null;
  xgCoverage?: number | null;
  probs?: { home?: number | null; draw?: number | null; away?: number | null; over25?: number | null; btts?: number | null } | null;
};

const num = (v: unknown, casas = 4): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
};

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
};

/**
 * Monta o snapshot. Nunca lança: campo estranho vira `null` em vez de derrubar
 * o registro do pick (o pick é mais importante que o motivo dele).
 */
export function montarMotivo(
  o: EntradaMotivo,
  ctx: ContextoMotivo = {},
  agora: string = new Date().toISOString(),
): MotivoPick {
  const p = ctx.probs ?? null;
  const temProbs =
    p != null && [p.home, p.draw, p.away, p.over25, p.btts].some((v) => num(v) != null);
  return {
    v: MOTIVO_VERSAO,
    registradoEm: agora,
    mercado: texto(o.mercado) ?? "desconhecido",
    rotulo: texto(o.rotulo) ?? texto(o.mercado) ?? "desconhecido",
    linha: num(o.linha, 2),
    prob: num(o.probModelo),
    probImplicita: num(o.probImplicita),
    odd: num(o.odd, 3),
    oddJusta: num(o.oddJusta, 3),
    edge: num(o.valor),
    evPct: num(o.evPct, 2),
    stake: num(o.stake, 4),
    trust: num(o.trust, 2),
    trustRotulo: texto(o.trustRotulo),
    confianca: texto(o.confianca),
    faixa: texto(o.faixa),
    amostra: num(o.amostra, 0),
    fonteOdd: texto(o.fonteOdd),
    lambdaCasa: num(ctx.lambdaHome, 3),
    lambdaFora: num(ctx.lambdaAway, 3),
    xgCasa: num(ctx.xgHome, 3),
    xgFora: num(ctx.xgAway, 3),
    xgFonte: texto(ctx.xgFonte),
    xgCobertura: num(ctx.xgCoverage, 2),
    probs: temProbs
      ? {
          casa: num(p!.home),
          empate: num(p!.draw),
          fora: num(p!.away),
          over25: num(p!.over25),
          btts: num(p!.btts),
        }
      : null,
    porque: texto(o.porque),
  };
}

const pct1 = (v: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const pctSinal = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`);
const pontos = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")} pts`);
const dec = (v: number | null, casas = 2) => (v == null ? "—" : v.toFixed(casas).replace(".", ","));
const par = (a: number | null, b: number | null, casas = 2) =>
  a == null && b == null ? "—" : `${dec(a, casas)} / ${dec(b, casas)}`;

/** "26/11/2026 20:04" em horário de Brasília — o instante do congelamento. */
export function quandoCongelou(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  // `formatToParts` + montagem manual: `toLocaleString` muda a pontuação entre
  // builds do Node/ICU (vírgula ou espaço), e o teste quebraria em outra máquina.
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${v("hour")}:${v("minute")}`;
}

export type CampoMotivo = { chave: string; rotulo: string; valor: string };

/**
 * Lista pronta para a tela (rótulo + valor formatado). Campos sem dado ficam
 * com "—": a UI nunca precisa decidir o que mostrar, e o snapshot antigo/nulo
 * devolve lista vazia em vez de quebrar.
 */
export function camposDoMotivo(m: MotivoPick | null | undefined): CampoMotivo[] {
  if (!m || typeof m !== "object") return [];
  const campos: CampoMotivo[] = [
    { chave: "mercado", rotulo: "Mercado", valor: m.linha != null ? `${m.rotulo} (linha ${dec(m.linha, 2)})` : m.rotulo },
    { chave: "prob", rotulo: "Probabilidade do modelo", valor: pct1(m.prob) },
    { chave: "probImplicita", rotulo: "Probabilidade da odd", valor: pct1(m.probImplicita) },
    { chave: "edge", rotulo: "Edge sobre o mercado", valor: pontos(m.edge) },
    { chave: "evPct", rotulo: "EV esperado", valor: pctSinal(m.evPct) },
    { chave: "odds", rotulo: "Odd / odd justa", valor: par(m.odd, m.oddJusta, 2) },
    { chave: "stake", rotulo: "Stake (Kelly)", valor: m.stake == null ? "—" : `${(m.stake * 100).toFixed(2).replace(".", ",")}% da banca` },
    {
      chave: "trust",
      rotulo: "TRUST",
      valor: m.trust == null ? "—" : `${dec(m.trust, 1)}${m.trustRotulo ? ` · ${m.trustRotulo}` : ""}`,
    },
    { chave: "confianca", rotulo: "Confiança do modelo", valor: m.confianca ?? "—" },
    { chave: "amostra", rotulo: "Amostra usada", valor: m.amostra == null ? "—" : `${m.amostra} jogo${m.amostra === 1 ? "" : "s"}` },
    { chave: "lambda", rotulo: "λ do modelo (casa / fora)", valor: par(m.lambdaCasa, m.lambdaFora, 2) },
    {
      chave: "xg",
      rotulo: "xG usado (casa / fora)",
      valor:
        par(m.xgCasa, m.xgFora, 2) === "—"
          ? "—"
          : `${par(m.xgCasa, m.xgFora, 2)}${m.xgFonte ? ` · ${m.xgFonte}` : ""}`,
    },
    { chave: "probs", rotulo: "Modelo no jogo (1 · X · 2)", valor: m.probs ? `${pct1(m.probs.casa)} · ${pct1(m.probs.empate)} · ${pct1(m.probs.fora)}` : "—" },
    { chave: "fonteOdd", rotulo: "Fonte da odd", valor: m.fonteOdd ?? "—" },
    { chave: "registradoEm", rotulo: "Congelado em", valor: quandoCongelou(m.registradoEm) },
  ];
  if (m.porque) campos.push({ chave: "porque", rotulo: "Leitura do motor", valor: m.porque });
  return campos;
}

/** Resumo de uma linha para o cabeçalho do pick: "71,0% · odd 2,05 · EV +12,3%". */
export function motivoEmUmaLinha(m: MotivoPick | null | undefined): string {
  if (!m) return "Motivo não gravado";
  const partes = [
    `prob ${pct1(m.prob)}`,
    `odd ${dec(m.odd, 2)}`,
    `EV ${pctSinal(m.evPct)}`,
    m.trust != null ? `TRUST ${dec(m.trust, 1)}` : null,
  ].filter(Boolean) as string[];
  return partes.join(" · ");
}
