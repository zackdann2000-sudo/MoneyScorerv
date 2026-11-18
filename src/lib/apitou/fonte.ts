/**
 * Leitura das fontes públicas do apitou.com.br.
 *
 * ============================ ENGENHARIA REVERSA ============================
 * O site não expõe API JSON. Ele serve dois arquivos JS estáticos que apenas
 * atribuem objetos globais:
 *
 *   GET https://apitou.com.br/dados.js   -> window.SC_SEMANA (≈22 MB)
 *                                          + window.SC_ASSETS (fotos/escudos)
 *   GET https://apitou.com.br/linhas.js  -> window.SC_LINHAS (≈186 KB)
 *
 * Não há autenticação. O arquivo grande é o problema: 22 MB não podem ser
 * baixados no request de um usuário (timeout). Por isso `parseDados` roda em um
 * job protegido que grava apenas o resumo na tabela `apitou_cache`.
 *
 * Estratégia de parse: NÃO usamos os 22 MB inteiros. O texto é `window.X={...}`
 * e o JSON é grande demais para eval/JSON.parse confortável em serverless, mas o
 * formato é válido. Fazemos o split das atribuições e parseamos cada uma.
 */

const BASE = "https://apitou.com.br";

/** Headers necessários: sem eles o site devolve o HTML da SPA (HTTP 200). */
const HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  Accept: "application/javascript, text/javascript, */*; q=0.01",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Referer: `${BASE}/`,
  Origin: BASE,
};

export class ApitouFetchError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApitouFetchError";
  }
}

/** Baixa um dos arquivos JS como texto. Valida que veio JS, e não o HTML da SPA. */
async function baixar(nome: "dados.js" | "linhas.js", timeoutMs = 120_000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${nome}`, { headers: HEADERS, signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new ApitouFetchError(`HTTP ${res.status} ao baixar ${nome}`, res.status);

    const texto = await res.text();
    // Armadilha conhecida: sem os headers certos o servidor devolve o HTML da
    // página (200 OK) em vez do JS. Detectamos pelo início do conteúdo.
    if (!texto.trimStart().startsWith("window.")) {
      throw new ApitouFetchError(
        `${nome} veio como HTML (${texto.length} bytes) em vez de JS — headers recusados`,
      );
    }
    return texto;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extrai todas as atribuições `window.X=valor;` de um arquivo e devolve os
 * valores já parseados. O parser percorre o texto contando chaves/colchetes para
 * não confundir `}` dentro de strings com o fim do objeto.
 */
export function parseGlobais(js: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const marcador = /window\.([A-Z_][A-Z0-9_]*)\s*=/g;
  let m: RegExpExecArray | null;

  while ((m = marcador.exec(js)) !== null) {
    const nome = m[1];
    let i = m.index + m[0].length;
    // Pula espaços até o valor.
    while (i < js.length && /\s/.test(js[i])) i++;

    const inicio = i;
    let profundidade = 0;
    let emString = false;
    let escape = false;

    for (; i < js.length; i++) {
      const c = js[i];
      if (emString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') emString = false;
        continue;
      }
      if (c === '"') {
        emString = true;
        continue;
      }
      if (c === "{" || c === "[") profundidade++;
      else if (c === "}" || c === "]") {
        profundidade--;
        if (profundidade === 0) {
          i++;
          break;
        }
      }
    }

    const bruto = js.slice(inicio, i).trim();
    try {
      out[nome] = JSON.parse(bruto);
    } catch {
      out[nome] = null; // bloco ilegível: não derruba o resto do arquivo
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tipos das fontes                                                   */
/* ------------------------------------------------------------------ */

export type JogadorSemana = {
  playerId: number;
  name: string;
  team: string;
  pos: string;
  isHome: boolean;
  media: number;
  apps: number;
  minutosMedios: number;
  multAdversario: number;
  mediaOn: number;
  gols: number;
};

export type FixtureSemana = {
  id: number;
  competicao: string;
  ligaId: number;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
  kickoff: string;
  players: JogadorSemana[];
};

type Semana = {
  geradoEm: string;
  fonte: string;
  ligas: Record<string, { nome: string; tipo: string; grupo: string; tier: number }>;
  fixtures: FixtureSemana[];
  elencos: Record<string, unknown[]>;
  raioxRaw: Record<string, unknown>;
  h2h: Record<string, unknown[]>;
  jogHist: Record<string, unknown>;
  escalacoes: { ultimas?: Record<string, unknown> };
  arbitros: Record<string, unknown>;
  catalogoTimes?: Record<string, unknown>;
};

type Linhas = {
  geradoEm: string;
  jogos: Record<string, JogoLinhas>;
};

export type JogoLinhas = {
  kickoff: string;
  jogador?: Record<string, Record<string, PropMercado>>;
  time?: Record<string, TimeMercado>;
} & Record<string, unknown>;

type PropMercado = {
  p?: number;
  c?: string;
  l?: Record<string, number>;
  cl?: Record<string, string>;
  lp?: Record<string, number>;
};

type TimeMercado = {
  total?: Record<string, number>;
  t1?: Record<string, number>;
  t2?: Record<string, number>;
};

/* ------------------------------------------------------------------ */
/* Resumo enxuto gravado no banco                                     */
/* ------------------------------------------------------------------ */

export type ResumoJogo = {
  id: number;
  competicao: string;
  ligaId: number;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
  kickoff: string;
  /** Só os jogadores que têm alguma linha de mercado (evita peso morto). */
  jogadores: ResumoJogador[];
  /** Escalação mais recente de cada lado, quando disponível. */
  escHome: EscalacaoResumo | null;
  escAway: EscalacaoResumo | null;
  arbitro: ArbitroResumo | null;
  /** Média das estatísticas do time no raio-X (últimos jogos). */
  statsHome: StatsTime | null;
  statsAway: StatsTime | null;
  h2hResumo: H2HResumo[];
  /** Props de time (gols/escanteios etc.) já normalizadas por seleção. */
  mercados: MercadoResumo[];
};

export type ResumoJogador = {
  playerId: number;
  nome: string;
  time: string;
  pos: string;
  isHome: boolean;
  media: number;
  mediaOn: number;
  gols: number;
  apps: number;
  minutosMedios: number;
  multAdversario: number;
  /** Estatísticas por tipo de prop (do elenco). */
  stats: {
    faltasCom?: number;
    faltasSof?: number;
    defesas?: number;
    desarmes?: number;
    passes?: number;
  };
  /** Props individuais disponíveis: mercado -> linhas e odds. */
  props: Record<string, OddsResumo[]>;
};

export type OddsResumo = { linha: number; odd: number; casa?: string };

export type EscalacaoResumo = {
  ts: string;
  adversario: string;
  formacao: string;
  tecnico: string;
  xi: { nome: string; num: number; pos: string }[];
};

export type ArbitroResumo = {
  nome: string;
  jogos: number;
  amarelos: number;
  vermelhos: number;
  faltas: number;
  penaltis: number;
};

/**
 * Últimos jogos do time, do mais recente para o mais antigo (até 10).
 *
 * Existe para o peso da forma recente: as médias de `StatsTime` são da
 * temporada inteira e puxam o dado para trás. Com a série, o motor pondera
 * 1.5 / 1.0 / 0.5 por faixa (ver lib/formaRecente).
 */
export type SerieTime = {
  gols: number[];
  golsSof: number[];
  faltas: number[];
  faltasSof: number[];
  amarelos: number[];
  amarelosSof: number[];
  impedimentos: number[];
  impedimentosSof: number[];
};

export type StatsTime = {
  jogos: number;
  /** Série dos últimos 10 jogos (mais recente primeiro). */
  serie?: SerieTime;
  gols: number;
  golsSof: number;
  cantos: number;
  cantosSof: number;
  fin: number;
  finSof: number;
  faltas: number;
  faltasSof: number;
  amarelos: number;
  amarelosSof: number;
  impedimentos: number;
  impedimentosSof: number;
  posse: number;
  chutesGol: number;
};

export type H2HResumo = {
  ts: string;
  comp: string;
  casa: string;
  fora: string;
  golsCasa: number;
  golsFora: number;
};

export type MercadoResumo = {
  mercado: string; // "gols" | "cantos" | ...
  periodos: Record<string, OddsResumo[]>; // "total" | "t1" | "t2" -> linhas
};

/* ------------------------------------------------------------------ */
/* Conversores                                                        */
/* ------------------------------------------------------------------ */

/** Extrai `mediaTemporadaAnterior` etc. do raio-X do time (média dos jogos). */
function mediaStats(raiox: unknown): StatsTime | null {
  const geral = (raiox as { geral?: Record<string, unknown>[] })?.geral;
  if (!Array.isArray(geral) || geral.length === 0) return null;

  const acc = {
    gols: 0, golsSof: 0, cantos: 0, cantosSof: 0, fin: 0, finSof: 0,
    faltas: 0, faltasSof: 0, amarelos: 0, amarelosSof: 0,
    impedimentos: 0, impedimentosSof: 0, posse: 0, chutesGol: 0,
  };

  for (const j of geral) {
    const own = (j.own ?? {}) as Record<string, number>;
    const adv = (j.adv ?? {}) as Record<string, number>;
    acc.gols += Number(j.gols) || 0;
    acc.golsSof += Number(j.golsSof) || 0;
    acc.cantos += own.cantos || 0;
    acc.cantosSof += adv.cantos || 0;
    acc.fin += own.fin || 0;
    acc.finSof += adv.fin || 0;
    acc.faltas += own.faltas || 0;
    acc.faltasSof += adv.faltas || 0;
    acc.amarelos += own.amarelos || 0;
    acc.amarelosSof += adv.amarelos || 0;
    acc.impedimentos += own.impedimentos || 0;
    acc.impedimentosSof += adv.impedimentos || 0;
    acc.posse += own.posse || 0;
    acc.chutesGol += own.chutesGol || 0;
  }

  const n = geral.length;
  const r = (v: number) => Math.round((v / n) * 100) / 100;

  /* Série dos últimos 10 jogos, do mais recente para o mais antigo. A fonte já
     entrega `geral` em ordem decrescente de data; ordenamos por `ts` de novo
     porque é barato e protege contra mudança de ordem na origem. */
  const recentes = [...geral]
    .sort((a, b) => String((b as { ts?: string }).ts ?? "").localeCompare(String((a as { ts?: string }).ts ?? "")))
    .slice(0, 10);
  const serie: SerieTime = {
    gols: [], golsSof: [], faltas: [], faltasSof: [],
    amarelos: [], amarelosSof: [], impedimentos: [], impedimentosSof: [],
  };
  for (const j of recentes) {
    const own = (j.own ?? {}) as Record<string, number>;
    const adv = (j.adv ?? {}) as Record<string, number>;
    serie.gols.push(Number(j.gols) || 0);
    serie.golsSof.push(Number(j.golsSof) || 0);
    serie.faltas.push(own.faltas || 0);
    serie.faltasSof.push(adv.faltas || 0);
    serie.amarelos.push(own.amarelos || 0);
    serie.amarelosSof.push(adv.amarelos || 0);
    serie.impedimentos.push(own.impedimentos || 0);
    serie.impedimentosSof.push(adv.impedimentos || 0);
  }

  return {
    serie,
    jogos: n,
    gols: r(acc.gols),
    golsSof: r(acc.golsSof),
    cantos: r(acc.cantos),
    cantosSof: r(acc.cantosSof),
    fin: r(acc.fin),
    finSof: r(acc.finSof),
    faltas: r(acc.faltas),
    faltasSof: r(acc.faltasSof),
    amarelos: r(acc.amarelos),
    amarelosSof: r(acc.amarelosSof),
    impedimentos: r(acc.impedimentos),
    impedimentosSof: r(acc.impedimentosSof),
    posse: r(acc.posse),
    chutesGol: r(acc.chutesGol),
  };
}

/**
 * Normaliza as odds de um jogador.
 *
 * Na fonte, `l` traz {linha: odd} e `cl` o nome da casa. Odds inválidas
 * (<= 1) são descartadas para não contaminar o cálculo de valor.
 */
function propsDoJogador(mercados: Record<string, PropMercado> | undefined): Record<string, OddsResumo[]> {
  const out: Record<string, OddsResumo[]> = {};
  if (!mercados) return out;

  for (const [mercado, dados] of Object.entries(mercados)) {
    const linhas = dados?.l ?? {};
    const casas = dados?.cl ?? {};
    const arr: OddsResumo[] = [];
    for (const [linhaStr, odd] of Object.entries(linhas)) {
      const linha = Number(linhaStr);
      const valor = Number(odd);
      if (!Number.isFinite(linha) || !Number.isFinite(valor) || valor <= 1) continue;
      arr.push({ linha, odd: valor, casa: casas[linhaStr] });
    }
    if (arr.length) {
      // Ordena pela linha: a UI e o QI leem da menor para a maior.
      arr.sort((a, b) => a.linha - b.linha);
      out[mercado] = arr;
    }
  }
  return out;
}

/** Props de time: mesmas para total/1T/2T. */
function mercadosDoTime(time: Record<string, TimeMercado> | undefined): MercadoResumo[] {
  if (!time) return [];
  const out: MercadoResumo[] = [];
  for (const [mercado, periodos] of Object.entries(time)) {
    const norm: Record<string, OddsResumo[]> = {};
    for (const [periodo, linhas] of Object.entries(periodos ?? {})) {
      const arr: OddsResumo[] = [];
      for (const [linhaStr, odd] of Object.entries(linhas ?? {})) {
        const linha = Number(linhaStr);
        const valor = Number(odd);
        if (!Number.isFinite(linha) || !Number.isFinite(valor) || valor <= 1) continue;
        arr.push({ linha, odd: valor });
      }
      if (arr.length) {
        arr.sort((a, b) => a.linha - b.linha);
        norm[periodo] = arr;
      }
    }
    if (Object.keys(norm).length) out.push({ mercado, periodos: norm });
  }
  return out;
}

/** Escalação mais recente de um time, se o site tiver cedido. */
function escalacaoDe(esc: Semana["escalacoes"], idTime: number): EscalacaoResumo | null {
  const raw = esc?.ultimas?.[String(idTime)] as
    | { ts: string; adv: string; formacao: string; tecnico: string; xi: { nome: string; num: number; pos: string }[] }
    | undefined;
  if (!raw) return null;
  return {
    ts: raw.ts,
    adversario: raw.adv,
    formacao: raw.formacao,
    tecnico: raw.tecnico,
    xi: (raw.xi ?? []).map((p) => ({ nome: p.nome, num: p.num, pos: p.pos })),
  };
}

function arbitroDe(arb: Semana["arbitros"], fixtureId: number): ArbitroResumo | null {
  const raw = arb?.[String(fixtureId)] as
    | { nome: string; jogos: number; amarelos: number; vermelhos: number; faltas: number; penaltis: number }
    | undefined;
  if (!raw) return null;
  return {
    nome: raw.nome,
    jogos: raw.jogos,
    amarelos: raw.amarelos,
    vermelhos: raw.vermelhos,
    faltas: raw.faltas,
    penaltis: raw.penaltis,
  };
}

function h2hDe(h2h: Semana["h2h"], fixtureId: number): H2HResumo[] {
  const arr = h2h?.[String(fixtureId)] as
    | { ts: string; comp: string; nH: string; nA: string; gH: number; gA: number }[]
    | undefined;
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, 6).map((j) => ({
    ts: j.ts,
    comp: j.comp,
    casa: j.nH,
    fora: j.nA,
    golsCasa: j.gH,
    golsFora: j.gA,
  }));
}

/* ------------------------------------------------------------------ */
/* Pipeline principal                                                 */
/* ------------------------------------------------------------------ */

export type ParseResultado = {
  geradoEm: string;
  fonte: string;
  jogos: ResumoJogo[];
  /** Avisos de dados faltantes, para o job reportar. */
  avisos: string[];
};

/**
 * Transforma os 22 MB em um resumo enxuto.
 *
 * Só os jogos com odds de jogador ou de time entram — são os únicos em que há
 * o que calcular. Jogos sem mercado não aparecem no radar.
 */
export function parseDados(dadosJs: string, linhasJs: string): ParseResultado {
  const g = parseGlobais(dadosJs);
  const sem = g.SC_SEMANA as Semana | null;
  if (!sem?.fixtures) throw new ApitouFetchError("SC_SEMANA ausente ou sem fixtures em dados.js");

  const gl = parseGlobais(linhasJs);
  const lin = gl.SC_LINHAS as Linhas | null;
  const linhasPorJogo = lin?.jogos ?? {};

  /** Extrai número de um valor misto; undefined se não for numérico. */
  const num = (v: string | number | undefined): number | undefined =>
    typeof v === "number" && Number.isFinite(v) ? v : undefined;

  const avisos: string[] = [];
  const jogos: ResumoJogo[] = [];

  for (const f of sem.fixtures) {
    const lj = linhasPorJogo[String(f.id)];
    if (!lj) {
      avisos.push(`jogo ${f.id} sem linhas`);
      continue;
    }

    const propsJogador = lj.jogador ?? {};
    const temPropsTime = Object.keys(lj.time ?? {}).length > 0;
    if (Object.keys(propsJogador).length === 0 && !temPropsTime) continue;

    // Indexa o elenco por nome. Guardar o time de origem é essencial: o
    // mesmo jogador pode aparecer só aqui (fora da lista `players`), e sem isso
    // a UI mostrava a prop sem time nem posição.
    // Tipo do elenco: mistura números (médias) e strings (nome/posição), então
    // usamos um registro de valor desconhecido e estreitamos na leitura.
    type ItemElenco = Record<string, string | number | undefined>;
    const porNome = new Map<string, { dados: ItemElenco; time: string; isHome: boolean }>();
    for (const [idTime, isHome] of [
      [f.homeId, true],
      [f.awayId, false],
    ] as [number, boolean][]) {
      const lista = (sem.elencos[String(idTime)] as ItemElenco[] | undefined) ?? [];
      const nomeTime = isHome ? f.home : f.away;
      for (const e of lista) {
        const nome = typeof e.name === "string" ? e.name : undefined;
        if (nome) porNome.set(nome, { dados: e, time: nomeTime, isHome });
      }
    }

    const jogadores: ResumoJogador[] = [];
    for (const [nome, mercados] of Object.entries(propsJogador)) {
      const props = propsDoJogador(mercados as Record<string, PropMercado>);
      if (Object.keys(props).length === 0) continue;

      // O jogador pode não estar na lista de `players`; preferimos ela, que
      // traz minutos/multAdversario, e caímos no elenco como alternativa.
      const base = f.players.find((p) => p.name === nome);
      const ref = porNome.get(nome);
      const st = ref?.dados;
      jogadores.push({
        playerId: base?.playerId ?? Number(st?.id ?? 0),
        nome,
        time: base?.team ?? ref?.time ?? "",
        pos: base?.pos ?? String(st?.pos ?? ""),
        isHome: base?.isHome ?? ref?.isHome ?? false,
        media: base?.media ?? Number(st?.media ?? 0),
        mediaOn: base?.mediaOn ?? Number(st?.mediaOn ?? 0),
        gols: base?.gols ?? 0,
        apps: base?.apps ?? Number(st?.apps ?? 0),
        minutosMedios: base?.minutosMedios ?? 0,
        multAdversario: base?.multAdversario ?? 1,
        // `stats` é só numérico: converte explicitamente, descartando o que não
        // for número (o elenco mistura campos string no mesmo objeto).
        stats: {
          faltasCom: num(st?.faltasCom),
          faltasSof: num(st?.faltasSof),
          defesas: num(st?.defesas),
          desarmes: num(st?.desarmes),
          passes: num(st?.passes),
        },
        props,
      });
    }

    jogos.push({
      id: f.id,
      competicao: f.competicao,
      ligaId: f.ligaId,
      home: f.home,
      away: f.away,
      homeId: f.homeId,
      awayId: f.awayId,
      kickoff: f.kickoff,
      jogadores,
      escHome: escalacaoDe(sem.escalacoes, f.homeId),
      escAway: escalacaoDe(sem.escalacoes, f.awayId),
      arbitro: arbitroDe(sem.arbitros, f.id),
      statsHome: mediaStats(sem.raioxRaw[String(f.homeId)]),
      statsAway: mediaStats(sem.raioxRaw[String(f.awayId)]),
      h2hResumo: h2hDe(sem.h2h, f.id),
      mercados: mercadosDoTime(lj.time),
    });
  }

  jogos.sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  return {
    geradoEm: sem.geradoEm ?? new Date().toISOString(),
    fonte: sem.fonte ?? "sportmonks",
    jogos,
    avisos,
  };
}

/** Baixa e parseia as duas fontes. Usado apenas pelo job protegido. */
export async function sincronizar(): Promise<ParseResultado> {
  // Em paralelo: são arquivos independentes e o grande domina o tempo.
  const [dadosJs, linhasJs] = await Promise.all([baixar("dados.js"), baixar("linhas.js")]);
  return parseDados(dadosJs, linhasJs);
}
