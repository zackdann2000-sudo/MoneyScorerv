/* =======================================================================
   MÓDULO ÁRBITROS — LÓGICA PURA (sem rede, sem banco, sem Next).
   -----------------------------------------------------------------------
   O que este arquivo faz: transforma duas fontes de dados do árbitro numa
   lista única e ordenável, com médias por jogo sempre acompanhadas da base
   ("quantos jogos essa média representa").

   Regras que valem aqui e não mudam:

   1. NUNCA inventar número. Sem total ou sem contagem, a média é `null`, não
      0. Um árbitro com 0 jogos não tem média 0 — não tem média.
   2. Toda média carrega `jogos` e `base`. Quem exibe precisa poder dizer
      "3,8 amarelos/jogo em 21 jogos" e não só "3,8".
   3. O agregado do feed (`feed`) vence a contagem das nossas aparições
      (`aparicoes`) porque cobre mais jogos; quando não existe agregado, a
      média é calculada sobre o que nós realmente vimos, sem extrapolar.
   4. Datas comparadas com `agora` explícito (testável; nada de Date.now()
      escondido no meio do cálculo).
   ======================================================================= */

export type Aparencia = {
  /** Nome do árbitro como a fonte entregou. */
  arbitro: string;
  /** ISO 8601 do apito inicial. */
  data: string;
  liga: string;
  home: string;
  away: string;
  homeScore?: number | null;
  awayScore?: number | null;
  /** Cartões/faltas DO JOGO apitado por ele. `null` = fonte não informou. */
  amarelos?: number | null;
  vermelhos?: number | null;
  faltas?: number | null;
  penaltis?: number | null;
  /** "apitou" | "banco" | nome do fornecedor. */
  fonte: string;
  /** Id do jogo na fonte — chave de idempotência da gravação. */
  fonteRef?: string;
};

/** Agregado que a fonte publica (carreira/temporada). `jogos` é o divisor. */
export type Snapshot = {
  nome: string;
  jogos: number;
  amarelos?: number | null;
  vermelhos?: number | null;
  faltas?: number | null;
  penaltis?: number | null;
  fonte?: string;
  vistoEm?: string;
};

export type Medias = {
  amarelos: number | null;
  vermelhos: number | null;
  faltas: number | null;
  penaltis: number | null;
  /** (amarelos + vermelhos) / jogos — a métrica que o mercado de disciplina usa. */
  cartoes: number | null;
};

export type ArbitroAgregado = {
  /** Nome de exibição (o mais "completo" que apareceu). */
  nome: string;
  /** Identificador estável derivado do nome normalizado (usado na URL). */
  slug: string;
  /** Divisor de todas as médias. */
  jogos: number;
  /** De onde vieram os totais: agregado do feed ou nossas aparições. */
  base: "feed" | "aparicoes";
  medias: Medias;
  totais: { amarelos: number | null; vermelhos: number | null; faltas: number | null; penaltis: number | null };
  /** % de jogos com cartão vermelho (só quando a base tem o dado). */
  vermelhoPct: number | null;
  /** Próximo jogo apitado por ele (futuro mais próximo), se houver. */
  proximoJogo: Aparencia | null;
  /** Última aparição registrada (<= agora). */
  ultimoJogo: string | null;
  /** Quantas aparições nós temos dele (histórico próprio). */
  aparicoes: number;
  /** Amostra curta: menos de 5 jogos na base da média. */
  amostraCurta: boolean;
};

export const MIN_AMOSTRA = 5;

/* ------------------------------- nomes ------------------------------- */

/**
 * Normaliza o nome do árbitro para agrupar a mesma pessoa entre fontes.
 *
 * "Juiz  João   P. Sá" -> "juiz joao p. sa". Sem acento, sem caixa, sem
 * espaço duplo, sem espaço nas pontas. Não remove iniciais: "João Sá" e
 * "João P. Sá" continuam distintos de propósito — juntar errado é pior do
 * que duplicar, porque some histórico de um árbitro real dentro de outro.
 */
export function normNome(nome: string): string {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Slug de URL a partir do nome normalizado ("joao sa" -> "joao-sa"). */
export function slugArbitro(nome: string): string {
  return normNome(nome).replace(/\s+/g, "-");
}

/** Caminho inverso: slug da URL -> chave de agrupamento. */
export function nomeDeSlug(slug: string): string {
  return normNome(decodeURIComponent(String(slug ?? "")).replace(/-/g, " "));
}

/* ------------------------------ médias ------------------------------- */

/** Divisão protegida: sem divisor (ou divisor 0) devolve null, nunca 0. */
export function media(total: number | null | undefined, jogos: number | null | undefined): number | null {
  /* `null` precisa ser barrado ANTES do Number(): Number(null) é 0, e um
     total ausente viraria "média 0" — exatamente o número inventado que a
     regra 1 proíbe. */
  if (total == null || jogos == null) return null;
  const t = Number(total);
  const n = Number(jogos);
  if (!Number.isFinite(t) || !Number.isFinite(n) || n <= 0) return null;
  return t / n;
}

/** Arredonda para exibição (2 casas), preservando null. */
export function arredondar(v: number | null, casas = 2): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const f = 10 ** casas;
  return Math.round(v * f) / f;
}

/** Soma só dos valores informados + quantos informaram (para média honesta). */
function somar(valores: (number | null | undefined)[]): { total: number | null; n: number } {
  let total = 0;
  let n = 0;
  for (const v of valores) {
    const x = Number(v);
    if (v == null || !Number.isFinite(x)) continue;
    total += x;
    n += 1;
  }
  return n ? { total, n } : { total: null, n: 0 };
}

const futuro = (iso: string, agora: number) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > agora;
};
const passado = (iso: string, agora: number) => {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= agora;
};

/* ---------------------------- agregação ------------------------------ */

/**
 * Consolida snapshots + aparições numa lista de árbitros.
 *
 * `agora` é injetado (ms) para o cálculo de "próximo jogo" ser determinístico
 * nos testes e no servidor.
 */
export function agregar(snapshots: Snapshot[], aparicoes: Aparencia[], agora: number): ArbitroAgregado[] {
  type Acumulado = { nome: string; snapshot: Snapshot | null; aparicoes: Aparencia[] };
  const mapa = new Map<string, Acumulado>();

  const pegar = (nome: string): Acumulado => {
    const k = normNome(nome);
    let a = mapa.get(k);
    if (!a) {
      a = { nome: String(nome ?? "").trim(), snapshot: null, aparicoes: [] };
      mapa.set(k, a);
    }
    if (String(nome ?? "").trim().length > a.nome.length) a.nome = String(nome).trim();
    return a;
  };

  for (const s of snapshots) {
    if (!s || !s.nome) continue;
    const a = pegar(s.nome);
    /* Snapshot mais recente vence (o feed pode republicar a temporada). */
    if (!a.snapshot) a.snapshot = s;
    else {
      const tNovo = Date.parse(String(s.vistoEm ?? "")) || 0;
      const tVelho = Date.parse(String(a.snapshot.vistoEm ?? "")) || 0;
      if (tNovo >= tVelho) a.snapshot = s;
    }
  }

  for (const ap of aparicoes) {
    if (!ap || !ap.arbitro) continue;
    pegar(ap.arbitro).aparicoes.push(ap);
  }

  const out: ArbitroAgregado[] = [];
  for (const [chave, a] of mapa) {
    const snap = a.snapshot;
    const comCartao = a.aparicoes.filter((x) => x.amarelos != null || x.vermelhos != null);
    const amber = somar(a.aparicoes.map((x) => x.amarelos));
    const verm = somar(a.aparicoes.map((x) => x.vermelhos));
    const faltas = somar(a.aparicoes.map((x) => x.faltas));
    const pens = somar(a.aparicoes.map((x) => x.penaltis));

    /* Base da média: agregado do feed quando existe e tem jogos; senão o que
       nós vimos. Nunca misturar as duas contagens na mesma divisão. */
    const doFeed = !!snap && Number(snap.jogos) > 0;
    const jogos = doFeed ? Number(snap!.jogos) : comCartao.length;

    const totais = doFeed
      ? {
          amarelos: num(snap!.amarelos),
          vermelhos: num(snap!.vermelhos),
          faltas: num(snap!.faltas),
          penaltis: num(snap!.penaltis),
        }
      : {
          amarelos: amber.total,
          vermelhos: verm.total,
          faltas: faltas.total,
          penaltis: pens.total,
        };

    const medias: Medias = {
      amarelos: media(totais.amarelos, jogos),
      vermelhos: media(totais.vermelhos, jogos),
      faltas: media(totais.faltas, jogos),
      penaltis: media(totais.penaltis, jogos),
      cartoes: null,
    };
    if (totais.amarelos != null || totais.vermelhos != null) {
      medias.cartoes = media((totais.amarelos ?? 0) + (totais.vermelhos ?? 0), jogos);
    }

    const ordenadas = [...a.aparicoes].sort((x, y) => Date.parse(y.data) - Date.parse(x.data));
    const proximo =
      [...a.aparicoes]
        .filter((x) => futuro(x.data, agora))
        .sort((x, y) => Date.parse(x.data) - Date.parse(y.data))[0] ?? null;
    const ultima = ordenadas.find((x) => passado(x.data, agora)) ?? ordenadas[0] ?? null;

    out.push({
      nome: a.nome,
      slug: slugArbitro(chave),
      jogos,
      base: doFeed ? "feed" : "aparicoes",
      medias,
      totais,
      vermelhoPct:
        totais.vermelhos != null && jogos > 0 ? Math.min(1, Number(totais.vermelhos) / jogos) : null,
      proximoJogo: proximo,
      ultimoJogo: ultima ? ultima.data : null,
      aparicoes: a.aparicoes.length,
      amostraCurta: jogos < MIN_AMOSTRA,
    });
  }

  return out;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ----------------------------- histórico ----------------------------- */

/** Histórico de um árbitro (mais recente primeiro), opcionalmente filtrado. */
export function historico(aparicoes: Aparencia[], nomeOuSlug: string, limite?: number): Aparencia[] {
  const alvo = normNome(nomeOuSlug.replace(/-/g, " "));
  const rows = aparicoes
    .filter((a) => normNome(a.arbitro) === alvo)
    .sort((x, y) => Date.parse(y.data) - Date.parse(x.data));
  return limite && limite > 0 ? rows.slice(0, limite) : rows;
}

/**
 * Distribuição de cartões por jogo (faixas) — só sobre aparições em que o
 * total de cartões é conhecido. Serve para ver se o árbitro é constante ou
 * alterna jogo limpo com jogo de 8 cartões.
 */
export function distribuicaoCartoes(
  aparicoes: Aparencia[],
  nomeOuSlug: string,
): { faixa: string; jogos: number }[] {
  const alvo = normNome(nomeOuSlug.replace(/-/g, " "));
  const faixas = [
    { faixa: "0-2", min: 0, max: 2, jogos: 0 },
    { faixa: "3-4", min: 3, max: 4, jogos: 0 },
    { faixa: "5-6", min: 5, max: 6, jogos: 0 },
    { faixa: "7+", min: 7, max: Number.POSITIVE_INFINITY, jogos: 0 },
  ];
  for (const a of aparicoes) {
    if (normNome(a.arbitro) !== alvo) continue;
    if (a.amarelos == null && a.vermelhos == null) continue;
    const total = Number(a.amarelos ?? 0) + Number(a.vermelhos ?? 0);
    const f = faixas.find((x) => total >= x.min && total <= x.max);
    if (f) f.jogos += 1;
  }
  return faixas.map((f) => ({ faixa: f.faixa, jogos: f.jogos }));
}

/* ------------------------------ filtros ------------------------------ */

export type OrdemArbitro = "cartoes" | "amarelos" | "vermelhos" | "faltas" | "penaltis" | "jogos" | "nome";

export type FiltroArbitros = {
  q?: string;
  soComProximoJogo?: boolean;
  liga?: string;
  ordem?: OrdemArbitro;
  dir?: "asc" | "desc";
  /** Corte de amostra: esconde quem tem menos que N jogos na base. */
  minJogos?: number;
};

/** Aplica busca/filtros e ordena. `null` sempre vai para o fim. */
export function filtrarArbitros(lista: ArbitroAgregado[], f: FiltroArbitros = {}): ArbitroAgregado[] {
  const q = normNome(f.q ?? "");
  const liga = normNome(f.liga ?? "");
  let out = lista.filter((a) => {
    if (q && !normNome(a.nome).includes(q)) return false;
    if (f.soComProximoJogo && !a.proximoJogo) return false;
    if (liga && !normNome(a.proximoJogo?.liga ?? "").includes(liga)) return false;
    if (f.minJogos && a.jogos < f.minJogos) return false;
    return true;
  });

  const campo = f.ordem ?? "cartoes";
  const dir = f.dir ?? "desc";
  const valor = (a: ArbitroAgregado): number | string | null => {
    switch (campo) {
      case "nome":
        return normNome(a.nome);
      case "jogos":
        return a.jogos;
      case "cartoes":
        return a.medias.cartoes;
      case "amarelos":
        return a.medias.amarelos;
      case "vermelhos":
        return a.medias.vermelhos;
      case "faltas":
        return a.medias.faltas;
      case "penaltis":
        return a.medias.penaltis;
      default:
        return a.medias.cartoes;
    }
  };

  out = [...out].sort((x, y) => {
    const vx = valor(x);
    const vy = valor(y);
    if (vx == null && vy == null) return normNome(x.nome).localeCompare(normNome(y.nome));
    if (vx == null) return 1; /* null no fim, independente da direção */
    if (vy == null) return -1;
    const cmp = typeof vx === "string" ? vx.localeCompare(String(vy)) : Number(vx) - Number(vy);
    return dir === "asc" ? cmp : -cmp;
  });
  return out;
}

/** Resumo do que a tabela está mostrando (usado no cabeçalho da tela). */
export function resumoLista(lista: ArbitroAgregado[]): {
  total: number;
  comProximoJogo: number;
  comMedia: number;
  jogosNaBase: number;
} {
  return {
    total: lista.length,
    comProximoJogo: lista.filter((a) => !!a.proximoJogo).length,
    comMedia: lista.filter((a) => a.medias.cartoes != null).length,
    jogosNaBase: lista.reduce((s, a) => s + (a.base === "feed" ? a.jogos : 0), 0),
  };
}

/* ------------------------ dedupe de aparições ------------------------ */

/**
 * Remove aparições repetidas (mesma fonte + mesmo jogo) mantendo a versão com
 * mais dados. Usado antes de gravar: o cron roda várias vezes por dia e o
 * mesmo jogo aparece em leituras sucessivas do feed.
 */
export function semDuplicatas(aparicoes: Aparencia[]): Aparencia[] {
  const mapa = new Map<string, Aparencia>();
  for (const a of aparicoes) {
    const chave = `${normNome(a.arbitro)}|${a.fonte}|${a.fonteRef ?? `${a.data}|${a.home}|${a.away}`}`;
    const atual = mapa.get(chave);
    if (!atual) {
      mapa.set(chave, a);
      continue;
    }
    const pontos = (x: Aparencia) =>
      [x.amarelos, x.vermelhos, x.faltas, x.penaltis, x.homeScore].filter((v) => v != null).length;
    if (pontos(a) > pontos(atual)) mapa.set(chave, a);
  }
  return [...mapa.values()];
}
