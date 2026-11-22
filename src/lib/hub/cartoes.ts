/**
 * Extração de cartões do resumo da partida.
 *
 * Fica num módulo próprio porque tem DOIS leitores com vidas diferentes:
 *   - o sync (`cascade.ts`), que grava o resultado em `hub_fixture`
 *     (`yellow_cards` / `red_cards`) uma única vez por coleta;
 *   - qualquer job futuro de reconciliação.
 *
 * Nenhuma chamada de rede: recebe o JSON de estatística já baixado.
 *
 * Por que a busca é por TEXTO na chave: os fornecedores gravam rótulos
 * diferentes para o mesmo dado — a Bzzoiro manda `yellow_cards`, a ESPN manda
 * o rótulo traduzido (\"Cartões amarelos\"). O JSON de contexto foi desenhado
 * para não reinterpretar o fornecedor, então a normalização mora aqui, e não
 * na tela.
 */

export type Cartoes = {
  /** Amarelos do jogo (mandante + visitante). `null` = chave ausente. */
  yellow: number | null;
  /** Vermelhos do jogo (mandante + visitante). `null` = chave ausente. */
  red: number | null;
};

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Chave de estatística -> cartão. `red` antes de `yellow`: "red_cards" não é amarelo. */
function tipoDaChave(chave: string): keyof Cartoes | null {
  const k = semAcento(chave);
  if (k.includes("vermelho") || k.includes("red_card") || k === "red" || k.includes("red card")) return "red";
  if (k.includes("amarelo") || k.includes("yellow") || k === "yellow") return "yellow";
  // "Cards (Time)" e afins: é o total de cartões, não separa cor — não serve.
  return null;
}

/**
 * Soma os dois lados quando os dois valores são numéricos.
 *
 * Um lado nulo não vira 0: somar `null` como 0 subestima o jogo em silêncio.
 * Se só um lado veio, o cartão existe mas o total é desconhecido => `null`.
 */
function totalDoPar(valor: unknown): number | null {
  const par = valor as { home?: unknown; away?: unknown } | null;
  if (!par || typeof par !== "object") return null;
  const casa = Number(par.home);
  const fora = Number(par.away);
  if (!Number.isFinite(casa) || !Number.isFinite(fora)) return null;
  return casa + fora;
}

/**
 * Cartões de um JSON de estatística de partida (`Record<chave, {home, away}>`).
 *
 * Devolve `null` para a cor que não apareceu — nunca 0 por omissão.
 */
export function extrairCartoes(stats: unknown): Cartoes | null {
  if (!stats || typeof stats !== "object") return null;

  const out: Cartoes = { yellow: null, red: null };
  for (const [chave, valor] of Object.entries(stats as Record<string, unknown>)) {
    const tipo = tipoDaChave(chave);
    if (!tipo) continue;
    const total = totalDoPar(valor);
    if (total == null) continue;
    // Duas chaves da mesma cor (fornecedor mandou "yellow_cards" e "Cartões
    // amarelos"): fica o maior, que é o mais completo dos dois.
    if (out[tipo] == null || total > (out[tipo] as number)) out[tipo] = total;
  }

  return out.yellow == null && out.red == null ? null : out;
}
