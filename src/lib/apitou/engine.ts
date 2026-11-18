/* Peso da forma recente: pesos compartilhados com o resto do app, para não
   existirem duas escalas de decaimento diferentes no mesmo produto. */
import { mediaPonderada } from "../formaRecente";

/**
 * Motor de probabilidades do módulo /apitou.
 *
 * ============================ ENGENHARIA REVERSA ============================
 * As fórmulas abaixo foram portadas das funções públicas do site apitou.com.br
 * (JS inline servido ao navegador — não há ofuscação). Nomes originais mantidos
 * em comentário para auditoria, mas reescritos em TypeScript tipado, sem herdar
 * as variáveis de uma letra só do original.
 *
 *   calcularLambda   = base × multMinutos × multAdversario × multMando
 *                      × multForma × multConfronto
 *   base             = média dos últimos 10 jogos com PESO DE FORMA
 *                      (1.5 / 1.0 / 0.5) quando a série existe; senão a
 *                      média de temporada como antes
 *   probOver         = 1 - soma(Poisson(k; lambda), k=0..linha)
 *   calcularQI       = sigmoide sobre desvio normalizado
 *   calcularConfianca= escalação(40) + amostra(30) + estabilidade(20) + consenso(10)
 *   calcularValor    = prob vs odd, mapeado para 0..100
 *
 * Ponto importante: o modelo é de CONTAGEM (Poisson). Ele estima a média
 * esperada do evento (lambda) e a probabilidade de passar de uma linha. Os
 * multiplicadores corrigem a média por contexto — não são heurística solta,
 * cada um tem um efeito limitado e documentado.
 */

/* ------------------------------------------------------------------ */
/* Distribuição                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fatorial com memo.
 *
 * ATENÇÃO ao limite: antes eu ia até 40, mas somar a cauda da Poisson até
 * k=60 gerava `undefined` (fatorial fora da tabela) e o resultado virava NaN.
 * O teste unitário pegou isso. 170 cobre qualquer cauda realista: 170! ainda é
 * finito em double, e acima daí a probabilidade já é ~0.
 */
const FATORIAL: number[] = (() => {
  const f = [1];
  for (let i = 1; i <= 170; i++) f[i] = f[i - 1] * i;
  return f;
})();

/**
 * P(X = k) para X ~ Poisson(lambda).
 *
 * Para k acima da tabela usamos a forma logarítmica (lgamma), que não estoura
 * com fatorial grande — devolve o mesmo valor sem Infinity/NaN.
 */
export function poissonPMF(k: number, lambda: number): number {
  if (!Number.isFinite(k) || k < 0 || !Number.isFinite(lambda) || lambda < 0) return 0;
  if (lambda === 0) return k === 0 ? 1 : 0;
  const logP = -lambda + k * Math.log(lambda) - logFatorial(k);
  const p = Math.exp(logP);
  return Number.isFinite(p) ? p : 0;
}

/** ln(k!) estável para k grande (soma de logs em vez de fatorial gigante). */
function logFatorial(k: number): number {
  if (k <= 170) return Math.log(FATORIAL[k]);
  let s = 0;
  for (let i = 2; i <= k; i++) s += Math.log(i);
  return s;
}

/**
 * P(X > linha) — "sobrevivência" da Poisson. Equivale a poissonSF do original.
 * `Math.floor(linha)` é essencial: com linha 2.5 somamos até 2, senão
 * arredondaríamos para cima e a probabilidade ficaria errada.
 */
export function poissonSF(linha: number, lambda: number): number {
  const teto = Math.floor(linha);
  if (teto < 0) return 1;
  let acumulado = 0;
  for (let k = 0; k <= teto; k++) acumulado += poissonPMF(k, lambda);
  return Math.max(0, Math.min(1, 1 - acumulado));
}

/* ------------------------------------------------------------------ */
/* Multiplicadores                                                    */
/* ------------------------------------------------------------------ */

/**
 * Média base: mistura a temporada atual com a anterior conforme a amostra.
 * Com <= 10 jogos pesa a anterior para não superajustar a amostra pequena.
 *
 * NOTA DE FIDELIDADE: o original usa a média anterior *como ela veio*, inclusive
 * zero. Eu havia adicionado um fallback (`|| mediaAtual`) que parecia razoável,
 * mas mudava o resultado em jogadores sem temporada anterior — o teste de
 * paridade com o site pegou isso. Sem fallback.
 */
export function mediaBase(atual: number, mediaAtual: number, mediaAnterior: number): number {
  const peso = Math.min((atual || 0) / 10, 1);
  return peso * (mediaAtual || 0) + (1 - peso) * (mediaAnterior || 0);
}

/**
 * Média ponderada pela forma recente (1.5 nos 3 últimos jogos, 1.0 do 4º ao
 * 7º, 0.5 do 8º ao 10º). A série vem do mais recente para o mais antigo.
 *
 * Devolve `null` quando não há número — quem chama decide o fallback. É de
 * propósito que a função não "conserta" série vazia com zero: zero é medição.
 */
export function mediaComDecaimento(ultimosJogos: readonly (number | null | undefined)[]): number | null {
  return mediaPonderada(ultimosJogos).media;
}

/**
 * Minutos: quem joga menos minutos produz menos. Nunca acima de 1 — não
 * premiamos quem joga mais que a própria média de titular.
 */
export function multMinutos(minutosProjetados: number, minutosMedios: number): number {
  if (!minutosMedios) return 1;
  return Math.min((minutosProjetados || 0) / minutosMedios, 1);
}

/** Mando: em casa +12%, fora -7%, campo neutro 1. */
export function multMando(isHome: boolean, sedeNeutra: boolean): number {
  if (sedeNeutra) return 1;
  return isHome ? 1.12 : 0.93;
}

/**
 * Forma: 0,8 + 0,2 × (últimos5 / temporada). Limita o impacto da fase recente
 * a +/-20% — evita que um jogo bom distorça a projeção.
 */
export function multForma(mediaUltimos5: number, mediaTemporada: number): number {
  if (!mediaTemporada) return 1;
  return 0.8 + ((mediaUltimos5 || 0) / mediaTemporada) * 0.2;
}

/**
 * Confronto direto: aproxima o histórico H2H da média da temporada com peso
 * crescente na amostra (n/(n+8)). Com 8 jogos o H2H vale 50% do ajuste.
 */
export function multConfronto(
  mediaVsAdversario: number,
  mediaTemporada: number,
  nJogos: number,
): number {
  if (!mediaTemporada || !nJogos) return 1;
  return 1 + (nJogos / (nJogos + 8)) * ((mediaVsAdversario || 0) / mediaTemporada - 1);
}

/* ------------------------------------------------------------------ */
/* Lambda                                                             */
/* ------------------------------------------------------------------ */

export type LambdaInput = {
  /** Jogos na temporada atual (define o peso contra a anterior). */
  jogosTemporadaAtual: number;
  mediaTemporadaAtual: number;
  mediaTemporadaAnterior: number;
  /** Minutos esperados e média de minutos do jogador. */
  minutosProjetados: number;
  minutosMediosTitular: number;
  multAdversario: number;
  isHome: boolean;
  sedeNeutra: boolean;
  mediaUltimos5: number;
  mediaVsAdversario: number;
  nJogosConfrontoDireto: number;
  /**
   * Série dos últimos jogos (mais recente primeiro). Quando presente, a base
   * deixa de ser a média de temporada e passa a ser a média ponderada pela
   * forma — é o que evita a média velha puxando o número para trás.
   */
  ultimosJogos?: readonly (number | null | undefined)[];
};

/** Média esperada do evento no jogo (o "lambda" da Poisson). */
export function calcularLambda(p: LambdaInput): number {
  // Forma recente primeiro: a média ponderada dos últimos jogos já embute a
  // queda de peso do 8º ao 10º jogo. Sem série, mantém o comportamento antigo.
  const ponderada = p.ultimosJogos?.length ? mediaComDecaimento(p.ultimosJogos) : null;
  const base =
    ponderada != null && ponderada > 0
      ? ponderada
      : mediaBase(p.jogosTemporadaAtual, p.mediaTemporadaAtual, p.mediaTemporadaAnterior);
  const minutos = multMinutos(p.minutosProjetados, p.minutosMediosTitular);
  const adversario = Number.isFinite(p.multAdversario) && p.multAdversario > 0 ? p.multAdversario : 1;
  const mando = multMando(p.isHome, p.sedeNeutra);
  const forma = multForma(p.mediaUltimos5, p.mediaTemporadaAtual);
  const confronto = multConfronto(p.mediaVsAdversario, p.mediaTemporadaAtual, p.nJogosConfrontoDireto);

  const lambda = base * minutos * adversario * mando * forma * confronto;
  return Number.isFinite(lambda) && lambda > 0 ? lambda : 0;
}

/* ------------------------------------------------------------------ */
/* Índices                                                            */
/* ------------------------------------------------------------------ */

/**
 * QI (índice de qualidade da linha) — quão longe a lambda está da linha,
 * em unidades de desvio, com correção para amostra pequena.
 * Resultado 0..100 (50 = exatamente na linha).
 */
export function calcularQI(lambda: number, linha: number, desvioPadrao: number): number {
  const sd = desvioPadrao && desvioPadrao > 0 ? desvioPadrao : 1;
  const z = (lambda - linha) / sd;
  // O fator 1/(1+sd/lambda) reduz a confiança quando a dispersão é grande
  // frente à própria média — típico de amostra curta.
  const escala = lambda > 0 ? 1 / (1 + sd / lambda) : 0;
  const bruto = z * escala;
  const sigmoide = 1 / (1 + Math.exp(-1.5 * bruto));
  return Math.round(sigmoide * 1000) / 10;
}

export type ConfiancaInput = {
  escalacaoConfirmada: boolean;
  nJogosHistorico: number;
  /** 0..1 — quanto a linha/odd se manteve estável. */
  estabilidadeLinha: number;
  dadosConflitantes: boolean;
};

/** Confiança do palpite em 0..100. Soma das quatro fontes. */
export function calcularConfianca(p: ConfiancaInput): number {
  let total = 0;
  total += p.escalacaoConfirmada ? 40 : 10;
  total += 30 * Math.min((p.nJogosHistorico || 0) / 20, 1);
  total += 20 * Math.max(0, Math.min(1, p.estabilidadeLinha || 0));
  total += p.dadosConflitantes ? 0 : 10;
  return Math.round(total * 10) / 10;
}

/**
 * Valor esperado normalizado (0..100) comparando a probabilidade do modelo com
 * a odd oferecida. Odd justa = 1/prob. Desvio de 15% na odd vale 50 pontos, daí
 * a escala `(prob - 1/odd) / 0.15 * 50`, centrada em 50.
 */
export function calcularValor(prob: number, odd: number): number {
  if (!odd || odd <= 1) return 0;
  const justa = 1 / odd;
  const bruto = 50 + ((prob - justa) / 0.15) * 50;
  return Math.round(Math.max(0, Math.min(100, bruto)) * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* Análise de uma prop                                                */
/* ------------------------------------------------------------------ */

export type OddsLinha = { line: number; price: number };

export type AnaliseProp = {
  line: number;
  price: number;
  /** Probabilidade do modelo (0..1). */
  probModelo: number;
  /** Probabilidade implícita na odd (0..1). */
  probMercado: number;
  /** Vantagem percentual do modelo sobre o mercado. */
  edge: number;
  qi: number;
  valor: number;
  confianca: number;
};

/** Odd de referência usada pelo site para escolher o "destaque". */
export const ODD_LINHA_PRINCIPAL = 1.85;

/**
 * Analisa todas as linhas de uma prop e elege o destaque (linha mais próxima
 * da odd 1.85, que é a referência de mercado).
 */
export function analisarProp(
  entrada: LambdaInput,
  odds: OddsLinha[],
  desvioPadrao: number,
  sedeNeutra: boolean,
): { lambda: number; analises: AnaliseProp[]; destaque: AnaliseProp | null; confianca: number } {
  const lambda = calcularLambda({ ...entrada, sedeNeutra });
  const confianca = calcularConfianca({
    escalacaoConfirmada: (entrada as LambdaInput & { escalacaoConfirmada?: boolean }).escalacaoConfirmada ?? false,
    nJogosHistorico: entrada.jogosTemporadaAtual,
    estabilidadeLinha: 1,
    dadosConflitantes: false,
  });

  const analises: AnaliseProp[] = odds.map((o) => {
    const probModelo = poissonSF(o.line, lambda);
    const probMercado = o.price > 1 ? 1 / o.price : 0;
    return {
      line: o.line,
      price: o.price,
      probModelo,
      probMercado,
      edge: probMercado > 0 ? probModelo / probMercado - 1 : 0,
      qi: calcularQI(lambda, o.line, desvioPadrao),
      valor: calcularValor(probModelo, o.price),
      confianca,
    };
  });

  const destaque =
    analises.length > 0
      ? analises.reduce((melhor, atual) =>
          Math.abs(atual.price - ODD_LINHA_PRINCIPAL) < Math.abs(melhor.price - ODD_LINHA_PRINCIPAL)
            ? atual
            : melhor,
        )
      : null;

  return { lambda, analises, destaque, confianca };
}

/* ------------------------------------------------------------------ */
/* Desajustes (mercado × modelo)                                      */
/* ------------------------------------------------------------------ */

export type Desajuste = {
  /** Nome do mercado (ex.: "Escanteios"). */
  mercado: string;
  linha: number;
  /** Odd oferecida. */
  odd: number;
  probModelo: number;
  probMercado: number;
  /** Vantagem do modelo sobre o mercado (fração). Positivo = mercado pagando a mais. */
  edge: number;
  qi: number;
  valor: number;
  /** Classificação visual. */
  nivel: "quente" | "bom" | "neutro";
};

/**
 * Compara modelo e mercado e devolve o nível do desajuste.
 *
 * Limiares conservadores de propósito: edge > 8% com prob razoável só aparece
 * quando o mercado está claramente fora da linha. Evita "oportunidade" em
 * evento improvável que paga bem mas raramente acontece.
 */
export function classificarDesajuste(edge: number, probModelo: number, valor: number): Desajuste["nivel"] {
  if (edge >= 0.08 && probModelo >= 0.45 && valor >= 60) return "quente";
  if (edge >= 0.03 && probModelo >= 0.35) return "bom";
  return "neutro";
}

/** Texto curto para exibir a vantagem sem poluir a tela. */
export function fmtEdge(edge: number): string {
  const pct = edge * 100;
  const sinal = pct >= 0 ? "+" : "";
  return `${sinal}${pct.toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/* Mapeamento mercado -> estatística                                  */
/* ------------------------------------------------------------------ */

/**
 * Cada mercado de prop é uma CONTAGEM de um evento diferente. Usar a mesma
 * média para todos dava erro grosseiro (ex.: cartões calculados com média de
 * finalizações). Aqui traduzimos o mercado para o campo de estatística que o
 * alimenta.
 *
 * Derivado observando os dados: `media` é finalizações, `mediaOn` é finalizações
 * no gol, `defesas` é defesa de goleiro, e cartões só faz sentido com faltas
 * cometidas (o mercado oferece apenas linha 0.5, típico de cartão).
 */
export const MERCADO_STAT: Record<string, { campo: string; rotulo: string; fator?: number }> = {
  fin: { campo: "media", rotulo: "Finalizações" },
  chutesGol: { campo: "mediaOn", rotulo: "Chutes a gol" },
  defesas: { campo: "defesas", rotulo: "Defesas" },
  /**
   * CARTÕES: a fonte só dá FALTAS, não cartões. Usar faltas direto como lambda
   * superestima grosseiramente (0,67 faltas/jogo dava 49%, quando a odd de 3,80
   * implica ~26%). O fator 0,12 vem de calibrar contra o próprio mercado: a
   * chance de um cartão em um jogo é ~1/8 das faltas cometidas, coerente com a
   * odd mediana de 3,33 (30%) observada nas 640 linhas de cartão.
   */
  cartoes: { campo: "faltasCom", rotulo: "Cartões", fator: 0.12 },
  desarmes: { campo: "desarmes", rotulo: "Desarmes" },
  passes: { campo: "passes", rotulo: "Passes" },
  faltasSof: { campo: "faltasSof", rotulo: "Faltas sofridas" },
};

/** Estatística efetiva do mercado: aplica o fator de calibração, se houver. */
export function statEfetiva(mercado: string, valorBruto: number): number {
  const f = MERCADO_STAT[mercado]?.fator;
  return valorBruto * (typeof f === "number" ? f : 1);
}

/** Rótulo humano do mercado, com fallback para o próprio código. */
export function rotuloMercado(mercado: string): string {
  return MERCADO_STAT[mercado]?.rotulo ?? mercado;
}
