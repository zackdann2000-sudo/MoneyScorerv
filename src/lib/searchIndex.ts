/* =============================================================================
   BUSCA GLOBAL — índice puro (sem fetch, sem banco, sem Date.now).

   O que ele resolve: hoje a única busca do app filtra a lista de jogos já
   carregada ("Buscar time ou liga" no GamesBoard). Quem procura um time que não
   joga hoje não acha nada. Esta lib pontua e ordena candidatos que vêm de três
   fontes (ligas estáticas, times do Hub e jogos do dia) e devolve um contrato
   único para a UI.

   Regras:
   • 1 caractere não busca (custo sem retorno); 2 é o mínimo.
   • Prefixo > palavra inteira > substring. Acento e caixa não contam.
   • Ordem final: time → liga → jogo (o destino mais provável primeiro).
   ========================================================================== */

export type TipoResultado = "time" | "liga" | "jogo";

export type Candidato = {
  tipo: TipoResultado;
  id: string;
  nome: string;
  /** Linha de apoio: país, liga, "hoje 21:30"… */
  sub?: string;
  logo?: string;
  /** Caminho final no app. */
  href: string;
  /** Texto extra para casar a busca (país, apelido, liga do jogo). */
  aliases?: string[];
};

export type Resultado = Candidato & { score: number };

export const MIN_BUSCA = 2;
const LIMITE_PADRAO = 12;

/** minúsculas e sem acento — "São Paulo" e "sao paulo" casam igual. */
export function normalizar(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pontuação de um candidato contra a consulta.
 * 100 = nome começa com a consulta · 70 = alguma palavra começa com ela
 * 45 = aparece no meio do nome · 30 = apareceu só nos aliases · 0 = não casa.
 */
export function pontuar(consulta: string, alvo: string): number {
  const q = normalizar(consulta);
  const t = normalizar(alvo);
  if (!q || !t) return 0;
  if (t === q) return 120;
  if (t.startsWith(q)) return 100;
  const palavras = t.split(/[\s\-–—/.,()]+/).filter(Boolean);
  if (palavras.some((p) => p.startsWith(q))) return 70;
  if (t.includes(q)) return 45;
  return 0;
}

const PESO_TIPO: Record<TipoResultado, number> = { time: 15, liga: 10, jogo: 5 };

/**
 * Filtra, pontua e ordena. Nunca devolve vazio por exceção: array vazio é a
 * resposta honesta para "nada encontrado".
 */
export function buscar(
  consulta: string,
  candidatos: Candidato[],
  opts: { limite?: number } = {}
): Resultado[] {
  const q = normalizar(consulta);
  if (q.length < MIN_BUSCA) return [];
  const limite = Math.max(1, opts.limite ?? LIMITE_PADRAO);

  const saida: Resultado[] = [];
  for (const c of candidatos) {
    let score = pontuar(q, c.nome);
    if (!score && c.sub) score = Math.max(0, pontuar(q, c.sub) - 10);
    if (!score && c.aliases?.length) {
      const melhor = Math.max(...c.aliases.map((a) => pontuar(q, a)));
      score = melhor ? Math.max(0, melhor - 25) : 0;
    }
    if (!score) continue;
    saida.push({ ...c, score: score + PESO_TIPO[c.tipo] });
  }
  saida.sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR"));
  return saida.slice(0, limite);
}

/** Agrupa preservando a ordem global já pontuada (sem reordenar por tipo). */
export function agrupar(resultados: Resultado[]): { times: Resultado[]; ligas: Resultado[]; jogos: Resultado[] } {
  return {
    times: resultados.filter((r) => r.tipo === "time"),
    ligas: resultados.filter((r) => r.tipo === "liga"),
    jogos: resultados.filter((r) => r.tipo === "jogo"),
  };
}
