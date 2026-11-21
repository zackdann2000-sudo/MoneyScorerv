/**
 * Veredito — cruza o raio-X dos dois times e recomenda UM mercado.
 *
 * Regra do produto: uma leitura por jogo, não um mural de estatísticas. A
 * função recebe os últimos jogos do mandante e do visitante (o `last`/`games`
 * de `/api/teams/[id]`, ou o `HistGame` do ESPN direto) e devolve o mercado com
 * a maior probabilidade, o percentual de acerto, um nível de confiança e o
 * texto que explica de onde saiu o número.
 *
 * Duas leituras independentes, sempre as duas citadas na explicação:
 *
 *   1) MODELO — Poisson com os gols esperados do confronto. O ataque de um
 *      time é cruzado com a defesa do outro (`(pró_A + contra_B) / 2`), com um
 *      ajuste pequeno de mando (+8% no mandante, −8% no visitante).
 *   2) OBSERVADO — quantas vezes o mercado teria batido nos jogos que os dois
 *      times realmente jogaram. É o que impede o modelo de virar adivinhação.
 *
 * A nota final é uma média ponderada das duas, com peso maior para o observado
 * quando há amostra. Amostra curta é encolhida em direção a 50% (nunca
 * inflamos um veredito em cima de 6 jogos) e a confiança cai.
 *
 * Módulo puro: sem I/O, sem rede, sem relógio. Os mesmos números de entrada dão
 * sempre o mesmo veredito — dá para testar com placares escritos à mão.
 */

import { JANELA_FORMA, mediaPonderada, mediaSimples, ajusteH2H, type AjusteH2H } from "./formaRecente";

/** O mínimo que a função precisa de cada jogo. O `HistGame` do ESPN serve. */
export type JogoRaiox = {
  gf?: number | null;
  ga?: number | null;
  htGf?: number | null;
  htGa?: number | null;
  home?: boolean;
  date?: string;
};

/**
 * Aceita tanto o time como string ("Flamengo") quanto o objeto que o app já
 * tem em mãos (`{ id, nome }`, `{ id, name }`, `{ short }`).
 */
export type TimeVeredito = string | { id?: string; nome?: string; name?: string; short?: string } | null | undefined;

/**
 * Raio-X: a lista de jogos direto, ou o envelope que as rotas devolvem
 * (`{ games }`, `{ jogos }`, `{ last }`).
 */
export type RaioxInput =
  | readonly JogoRaiox[]
  | { jogos?: readonly JogoRaiox[]; games?: readonly JogoRaiox[]; last?: readonly JogoRaiox[] }
  | null
  | undefined;

export type NivelConfianca = "Alta" | "Média" | "Baixa";

export type MercadoId = "over15" | "over25" | "under35" | "btts";

export type TaxaMercado = {
  id: MercadoId;
  mercado: string;
  /** 0..100 — probabilidade só do modelo Poisson */
  modelo: number;
  /** 0..100 — taxa nos jogos reais; `null` quando não deu para medir */
  observado: number | null;
  /** 0..100 — a nota final, depois do peso e do encolhimento */
  final: number;
};

export type Veredito = {
  /** Ex.: "Over 1.5" — rótulo curto, pronto para o card */
  mercadoRecomendado: string;
  /** Chave estável do mercado (para ícones, cores, testes) */
  mercadoId: MercadoId;
  /** 0..100. Zero significa "sem base" (nenhum placar no raio-X). */
  porcentagemAcerto: number;
  nivelConfianca: NivelConfianca;
  explicacao: string;
  /**
   * `true` quando a base é fraca: nenhum placar, ou menos de 8 jogos somados.
   * A UI deve mostrar o card com aviso em vez de destaque.
   */
  dadosInsuficientes: boolean;
  /** Jogos com placar usados, somando os dois times (máx. 2 × 10). */
  amostra: number;
  /** Médias ponderadas pela forma recente, em gols por jogo. */
  mediaGols: { timeA: number | null; timeB: number | null; confronto: number | null };
  /** Gols esperados do confronto (o que alimenta o Poisson). */
  golsEsperados: { timeA: number; timeB: number; total: number };
  /** Todos os mercados avaliados, do mais provável para o menos. */
  taxas: TaxaMercado[];
  /**
   * Veredito 2.0 — cruzamento do H2H com a forma recente. `null` quando a rota
   * não mandou H2H (quem só tem o raio-X continua funcionando igual).
   */
  ajusteH2H: AjusteH2H | null;
  /**
   * Veredito 2.0 — o palpite único do confronto, montado das mesmas três
   * leituras (forma recente, H2H, modelo × observado), com as razões em
   * separado para a UI mostrar *por que*, não só o número.
   */
  melhorPalpite: MelhorPalpite | null;
};

export type MelhorPalpite = {
  mercado: string;
  mercadoId: MercadoId;
  /** 0..100 — a MESMA nota de `taxas[]`; não existe número novo para o card. */
  porcentagem: number;
  nivelConfianca: NivelConfianca;
  /** Razões em ordem de peso: forma → H2H → concordância modelo × observado. */
  porque: string[];
  /** Média de gols por jogo na janela de 10 de cada lado (a base do cruzamento). */
  forma: { timeA: number | null; timeB: number | null; jogosA: number; jogosB: number };
  h2h: { jogos: number; mediaGols: number | null; fator: number } | null;
};

/**
 * H2H aceito pelo veredito: os confrontos diretos no mesmo formato do raio-X
 * (`gf`/`ga` do ponto de vista do mandante), ou o resumo que `h2hEngine` monta
 * (`{ jogos, mediaGols }`), ou só a contagem quando a média já foi calculada.
 */
export type H2HInput =
  | readonly JogoRaiox[]
  | { jogos?: readonly JogoRaiox[] | number | null; mediaGols?: number | null }
  | null
  | undefined;

/* ------------------------------------------------------------------ */
/* Aritmética                                                          */
/* ------------------------------------------------------------------ */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Arredonda para 0..100 sem passar dos limites. */
const emPorcento = (p: number) => clamp(Math.round(p * 100), 0, 100);

/** Duas casas, para as médias que a explicação cita. */
const duasCasas = (v: number) => Math.round(v * 100) / 100;

/** Converte qualquer coisa em número; vazio e texto inválido viram null. */
function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : null;
}

function totalDeGols(g: JogoRaiox): number | null {
  const gf = num(g.gf);
  const ga = num(g.ga);
  if (gf == null || ga == null) return null;
  return gf + ga;
}

/** P(X ≤ k) de uma Poisson — soma dos termos até k, estável para λ pequeno. */
function poissonAte(k: number, lambda: number): number {
  if (k < 0) return 0;
  let termo = Math.exp(-lambda);
  let soma = termo;
  for (let i = 1; i <= k; i++) {
    termo *= lambda / i;
    soma += termo;
  }
  return clamp(soma, 0, 1);
}

/** Média dos dois lados quando existem; se só um lado tem número, usa ele. */
function combinar(x: number | null, y: number | null, padrao: number): number {
  if (x != null && y != null) return (x + y) / 2;
  if (x != null) return x;
  if (y != null) return y;
  return padrao;
}

/* ------------------------------------------------------------------ */
/* Entrada                                                             */
/* ------------------------------------------------------------------ */

function normalizarJogos(input: RaioxInput): JogoRaiox[] {
  if (!input) return [];
  let bruto: readonly JogoRaiox[];
  if (Array.isArray(input)) {
    bruto = input as readonly JogoRaiox[];
  } else {
    const envelope = input as { jogos?: readonly JogoRaiox[]; games?: readonly JogoRaiox[]; last?: readonly JogoRaiox[] };
    bruto = envelope.jogos ?? envelope.games ?? envelope.last ?? [];
  }

  const validos = bruto.filter((g): g is JogoRaiox => !!g && typeof g === "object");
  /* Só reordena quando todos os jogos têm data — o formato `HistGame` já vem
     do mais recente para o mais antigo e a média ponderada depende disso. */
  const todosComData = validos.length > 0 && validos.every((g) => typeof g.date === "string" && g.date);
  const ordenados = todosComData
    ? [...validos].sort((a, b) => String(b.date).localeCompare(String(a.date)))
    : validos;

  return ordenados.slice(0, JANELA_FORMA);
}

/**
 * Normaliza o H2H nos formatos que a rota pode entregar: lista de jogos (com
 * data e placar), resumo do `h2hEngine` (`{ jogos, mediaGols }`) ou só a
 * contagem. Nunca inventa média: sem placar, `media` é `null` e o ajuste
 * devolve fator 1 — o veredito não pode fingir confronto.
 */
function normalizarH2H(input: H2HInput): { media: number | null; contagem: number } {
  if (!input) return { media: null, contagem: 0 };
  if (Array.isArray(input)) {
    const jogos = normalizarJogos(input as readonly JogoRaiox[]);
    return { media: mediaSimples(jogos.map(totalDeGols)), contagem: jogos.length };
  }
  const env = input as { jogos?: readonly JogoRaiox[] | number | null; mediaGols?: number | null };
  if (Array.isArray(env.jogos)) {
    const jogos = normalizarJogos(env.jogos);
    return { media: mediaSimples(jogos.map(totalDeGols)), contagem: jogos.length };
  }
  const contagem = typeof env.jogos === "number" && Number.isFinite(env.jogos) ? Math.max(0, Math.floor(env.jogos)) : 0;
  return { media: contagem > 0 ? num(env.mediaGols) : null, contagem };
}

function nomeDoTime(t: TimeVeredito, padrao: string): string {
  if (typeof t === "string") return t.trim() || padrao;
  if (!t) return padrao;
  const nome = t.nome ?? t.name ?? t.short;
  return typeof nome === "string" && nome.trim() ? nome.trim() : padrao;
}

/* ------------------------------------------------------------------ */
/* Perfil de cada time                                                 */
/* ------------------------------------------------------------------ */

type Perfil = {
  nome: string;
  /** jogos com placar (os sem gf/ga ficam de fora das médias) */
  jogos: number;
  golsPro: number | null;
  golsContra: number | null;
  /** 0..1 — em que fração dos jogos o time marcou */
  taxaMarcou: number | null;
  vitorias: number;
  empates: number;
  derrotas: number;
};

function perfilDoTime(nome: string, jogos: readonly JogoRaiox[]): Perfil {
  const comPlacar = jogos.filter((g) => totalDeGols(g) != null);
  const pro = mediaPonderada(comPlacar.map((g) => num(g.gf))).media;
  const contra = mediaPonderada(comPlacar.map((g) => num(g.ga))).media;

  let marcou = 0;
  let vitorias = 0;
  let empates = 0;
  let derrotas = 0;
  for (const g of comPlacar) {
    const gf = num(g.gf) ?? 0;
    const ga = num(g.ga) ?? 0;
    if (gf > 0) marcou++;
    if (gf > ga) vitorias++;
    else if (gf === ga) empates++;
    else derrotas++;
  }

  return {
    nome,
    jogos: comPlacar.length,
    golsPro: pro,
    golsContra: contra,
    taxaMarcou: comPlacar.length ? marcou / comPlacar.length : null,
    vitorias,
    empates,
    derrotas,
  };
}

/* ------------------------------------------------------------------ */
/* Mercados                                                            */
/* ------------------------------------------------------------------ */

type Mercado = {
  id: MercadoId;
  /** rótulo curto, é o que vai no card */
  curto: string;
  /** rótulo por extenso, para a explicação */
  nome: string;
  /** desempate: menor = mercado mais "seguro"/informativo */
  prio: number;
  /** linha de gols; null nos mercados que não são de linha */
  linha: number | null;
  /** probabilidade pelo modelo Poisson */
  modelo: (lA: number, lB: number, lt: number) => number;
  /** o jogo passou na linha? `null` = não dá para medir esse mercado por jogo */
  passou: (g: JogoRaiox) => boolean | null;
};

/**
 * Só quatro mercados, e só os que a fonte de placar consegue provar. Ficam de
 * fora vitória/empate e handicape: com 10 amostras eles acertam por acaso com
 * frequência e virariam um veredito que não é veredito.
 */
const MERCADOS: Mercado[] = [
  {
    id: "over15",
    curto: "Over 1.5",
    nome: "Over 1.5 gols",
    prio: 1,
    linha: 1.5,
    modelo: (_lA, _lB, lt) => 1 - poissonAte(1, lt),
    passou: (g) => {
      const t = totalDeGols(g);
      return t == null ? null : t > 1;
    },
  },
  {
    id: "under35",
    curto: "Under 3.5",
    nome: "Under 3.5 gols",
    prio: 2,
    linha: 3.5,
    modelo: (_lA, _lB, lt) => poissonAte(3, lt),
    passou: (g) => {
      const t = totalDeGols(g);
      return t == null ? null : t <= 3;
    },
  },
  {
    id: "btts",
    curto: "Ambas marcam",
    nome: "Ambas marcam",
    prio: 3,
    linha: null,
    modelo: (lA, lB) => (1 - Math.exp(-lA)) * (1 - Math.exp(-lB)),
    /* BTTS é sobre dois times no mesmo jogo; o raio-X é uma lista de jogos
       separados. A taxa sai do produto das taxas de "marcou" (independência). */
    passou: () => null,
  },
  {
    id: "over25",
    curto: "Over 2.5",
    nome: "Over 2.5 gols",
    prio: 4,
    linha: 2.5,
    modelo: (_lA, _lB, lt) => 1 - poissonAte(2, lt),
    passou: (g) => {
      const t = totalDeGols(g);
      return t == null ? null : t > 2;
    },
  },
];

/** Taxa observada de cada mercado no conjunto de jogos dos dois times. */
function taxaObservada(m: Mercado, pool: readonly JogoRaiox[], pA: Perfil, pB: Perfil): number | null {
  if (m.id === "btts") {
    if (pA.taxaMarcou == null || pB.taxaMarcou == null) return null;
    return pA.taxaMarcou * pB.taxaMarcou;
  }
  let base = 0;
  let acertos = 0;
  for (const g of pool) {
    const passou = m.passou(g);
    if (passou == null) continue;
    base++;
    if (passou) acertos++;
  }
  return base >= 4 ? acertos / base : null;
}

/** Quanto o observado pesa contra o modelo. Amostra curta pesa pouco. */
function pesoDoObservado(amostra: number): number {
  if (amostra >= 18) return 0.45;
  if (amostra >= 13) return 0.35;
  if (amostra >= 8) return 0.22;
  return 0.12;
}

/** Encolhimento em direção a 50% quando a base é curta. */
function encolhimento(amostra: number): number {
  if (amostra >= 16) return 0;
  if (amostra >= 12) return 0.04;
  if (amostra >= 8) return 0.09;
  return 0.16;
}

/* ------------------------------------------------------------------ */
/* Veredito                                                            */
/* ------------------------------------------------------------------ */

export function gerarVeredito(
  timeA: TimeVeredito,
  timeB: TimeVeredito,
  raioxA: RaioxInput,
  raioxB: RaioxInput,
  /** Veredito 2.0: confronto direto. Opcional — sem ele o resultado é o de antes. */
  h2h?: H2HInput,
): Veredito {
  const jogosA = normalizarJogos(raioxA);
  const jogosB = normalizarJogos(raioxB);
  const pA = perfilDoTime(nomeDoTime(timeA, "Time da casa"), jogosA);
  const pB = perfilDoTime(nomeDoTime(timeB, "Visitante"), jogosB);
  const pool: JogoRaiox[] = [...jogosA, ...jogosB];

  const amostra = pA.jogos + pB.jogos;

  /* Sem nenhum placar não há cruzamento possível: devolvemos um veredito
     marcado, em vez de inventar número em cima de um prior. */
  if (amostra === 0) {
    return {
      mercadoRecomendado: "Over 1.5",
      mercadoId: "over15",
      porcentagemAcerto: 0,
      nivelConfianca: "Baixa",
      explicacao:
        `Sem placares no raio-X de ${pA.nome} e ${pB.nome}: os últimos jogos não vieram na resposta, ` +
        `então não há como cruzar gols marcados com gols sofridos. Veredito indisponível até a fonte carregar o histórico.`,
      dadosInsuficientes: true,
      amostra: 0,
      mediaGols: { timeA: null, timeB: null, confronto: null },
      golsEsperados: { timeA: 0, timeB: 0, total: 0 },
      taxas: [],
      ajusteH2H: null,
      melhorPalpite: null,
    };
  }

  /* Média de gols do pool serve de rede de segurança quando só um dos times
     trouxe números de ataque ou de defesa. */
  const totaisPool = pool.map(totalDeGols).filter((t): t is number => t != null);
  const mediaPool = totaisPool.length
    ? duasCasas(totaisPool.reduce((s, t) => s + t, 0) / totaisPool.length)
    : null;

  /* Gols esperados: ataque de um contra defesa do outro, na metade do caminho.
     O 2.6 é só ponto de partida quando não há nenhum dos dois lados. */
  const baseA = combinar(pA.golsPro, pB.golsContra, mediaPool != null ? mediaPool / 2 : 1.3);
  const baseB = combinar(pB.golsPro, pA.golsContra, mediaPool != null ? mediaPool / 2 : 1.1);

  const lA0 = baseA * 1.08;
  const lB0 = baseB * 0.92;

  /* ── Veredito 2.0: H2H × forma recente ────────────────────────────────
     O fator do H2H é limitado (0,85–1,10) e só entra com amostra mínima —
     confronto direto de 2 jogos não derruba a expectativa dos últimos 10. */
  const h2hDados = normalizarH2H(h2h);
  const ajuste = ajusteH2H(h2hDados.media, mediaPool, h2hDados.contagem);
  const fatorH2H = ajuste.aplicado ? ajuste.fator : 1;

  const lA = clamp(lA0 * fatorH2H, 0.25, 3.6);
  const lB = clamp(lB0 * fatorH2H, 0.25, 3.6);
  const lt = lA + lB;

  const pesoObs = pesoDoObservado(amostra);
  const encolhe = encolhimento(amostra);

  const taxas: TaxaMercado[] = MERCADOS.map((m) => {
    const modelo = clamp(m.modelo(lA, lB, lt), 0.01, 0.99);
    const observado = taxaObservada(m, pool, pA, pB);
    const bruto = observado == null ? modelo : pesoObs * observado + (1 - pesoObs) * modelo;
    const final = bruto - (bruto - 0.5) * encolhe;
    return {
      id: m.id,
      mercado: m.curto,
      modelo: emPorcento(modelo),
      observado: observado == null ? null : emPorcento(observado),
      final: emPorcento(clamp(final, 0.01, 0.99)),
    };
  }).sort((x, y) => {
    if (y.final !== x.final) return y.final - x.final;
    const px = MERCADOS.find((m) => m.id === x.id)?.prio ?? 99;
    const py = MERCADOS.find((m) => m.id === y.id)?.prio ?? 99;
    return px - py;
  });

  const melhor = taxas[0];
  const mercado = MERCADOS.find((m) => m.id === melhor.id)!;
  const porcentagemAcerto = melhor.final;

  /* Concordância entre as duas leituras: quanto maior, mais firme o veredito. */
  const desacordo = melhor.observado == null ? 0 : Math.abs(melhor.observado - melhor.modelo) / 100;
  const dadosInsuficientes = amostra < 8;

  let nivelConfianca: NivelConfianca;
  if (dadosInsuficientes) nivelConfianca = "Baixa";
  else if (porcentagemAcerto >= 72 && amostra >= 16 && desacordo <= 0.12) nivelConfianca = "Alta";
  else if (porcentagemAcerto >= 62 && amostra >= 12 && desacordo <= 0.2) nivelConfianca = "Média";
  else nivelConfianca = "Baixa";

  /* ---------------- texto ---------------- */

  const fmt = (v: number | null) => (v == null ? "?" : v.toFixed(1).replace(".", ","));
  const partes: string[] = [];

  partes.push(
    `Nos últimos ${pA.jogos} jogos, ${pA.nome} marcou ${fmt(pA.golsPro)} e sofreu ${fmt(pA.golsContra)} por partida ` +
      `(${pA.vitorias}V ${pA.empates}E ${pA.derrotas}D); ${pB.nome} marcou ${fmt(pB.golsPro)} e sofreu ${fmt(pB.golsContra)} ` +
      `em ${pB.jogos} jogos (${pB.vitorias}V ${pB.empates}E ${pB.derrotas}D).`,
  );

  partes.push(
    `Cruzando ataque de um com defesa do outro, o confronto projeta ${lt.toFixed(1).replace(".", ",")} gols ` +
      `(${lA.toFixed(1).replace(".", ",")} do mandante contra ${lB.toFixed(1).replace(".", ",")} do visitante).`,
  );

  if (melhor.observado != null) {
    partes.push(
      `O ${mercado.nome} bateu em ${melhor.observado}% dos ${amostra} jogos analisados, e o modelo Poisson ` +
        `estima ${melhor.modelo}% para a mesma linha.`,
    );
  } else {
    partes.push(`O modelo Poisson estima ${melhor.modelo}% para o ${mercado.nome}.`);
  }

  if (ajuste.aplicado) partes.push(ajuste.texto);

  if (desacordo > 0.15) {
    partes.push("As duas leituras divergem bastante, então o número final ficou no meio do caminho.");
  } else if (melhor.observado != null) {
    partes.push("As duas leituras concordam, o que sustenta a recomendação.");
  }

  if (dadosInsuficientes) {
    partes.push(`A base é curta (${amostra} jogos), então o veredito está puxado para perto de 50% e a confiança é baixa.`);
  } else if (amostra < 12) {
    /* 12 jogos é o piso para a confiança subir — abaixo disso ela fica baixa
       por regra, e a explicação precisa dizer o motivo. */
    partes.push(`Com ${amostra} jogos somados a amostra ainda é curta, e isso segura a confiança em baixa.`);
  }

  partes.push(`Veredito: ${mercado.curto} a ${porcentagemAcerto}% (confiança ${nivelConfianca.toLowerCase()}).`);

  /* ── Melhor palpite do confronto (Veredito 2.0) ───────────────────────
     Não é um número novo: é o topo de `taxas[]` com as três leituras que o
     produziram, separadas — a UI mostra a razão, não só a porcentagem. */
  const melhorPalpite: MelhorPalpite = {
    mercado: mercado.curto,
    mercadoId: mercado.id,
    porcentagem: porcentagemAcerto,
    nivelConfianca,
    porque: [
      `Forma (últimos ${pA.jogos}/${pB.jogos} jogos): ${pA.nome} marca ${fmt(pA.golsPro)} e sofre ${fmt(pA.golsContra)}; ` +
        `${pB.nome} marca ${fmt(pB.golsPro)} e sofre ${fmt(pB.golsContra)} por jogo.`,
      ajuste.aplicado
        ? ajuste.texto
        : `H2H com ${h2hDados.contagem} confronto(s) não mexeu no número: ${ajuste.texto}`,
      melhor.observado != null
        ? `O ${mercado.nome} bateu em ${melhor.observado}% dos ${amostra} jogos reais e o Poisson estima ${melhor.modelo}%.`
        : `Sem taxa observada para esta linha: o número vem só do Poisson (${melhor.modelo}%).`,
    ],
    forma: { timeA: pA.golsPro, timeB: pB.golsPro, jogosA: pA.jogos, jogosB: pB.jogos },
    h2h: h2hDados.contagem > 0 ? { jogos: h2hDados.contagem, mediaGols: h2hDados.media, fator: fatorH2H } : null,
  };

  return {
    mercadoRecomendado: mercado.curto,
    mercadoId: mercado.id,
    porcentagemAcerto,
    nivelConfianca,
    explicacao: partes.join(" "),
    dadosInsuficientes,
    amostra,
    mediaGols: {
      timeA: pA.golsPro,
      timeB: pB.golsPro,
      confronto: duasCasas(lt),
    },
    golsEsperados: { timeA: duasCasas(lA), timeB: duasCasas(lB), total: duasCasas(lt) },
    taxas,
    ajusteH2H: ajuste,
    melhorPalpite,
  };
}
