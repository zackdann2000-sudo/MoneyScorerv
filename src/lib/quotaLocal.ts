/**
 * Controle LOCAL do que já foi consumido hoje (um "cache" da quota).
 *
 * A verdade é do servidor (`/api/quota`). O localStorage só existe para não
 * gastar a quota duas vezes ao reabrir a MESMA partida no mesmo dia — e para o
 * guard de clique saber, sem rede, se aquele jogo já foi "pago".
 *
 * Chave: `gs_q_<YYYY-MM-DD em Brasília>_<matchId>`. O dia entra na chave, então
 * não há limpeza a fazer: chave de ontem simplesmente nunca é lida.
 */

const FUSO = "America/Sao_Paulo";

/** Data de hoje (YYYY-MM-DD) no fuso de Brasília — a mesma regra do servidor. */
export function diaBrasilia(agora: Date = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: FUSO });
}

export function chaveQuota(matchId: string, dia: string = diaBrasilia()): string {
  return `gs_q_${dia}_${matchId}`;
}

/** true = a partida já foi aberta (e a quota já foi debitada) hoje. */
export function jaConsumiuHoje(matchId: string, dia?: string): boolean {
  try {
    return localStorage.getItem(chaveQuota(matchId, dia)) !== null;
  } catch {
    // storage bloqueado: assume que não consumiu (o servidor ainda barra).
    return false;
  }
}

export function marcarConsumido(matchId: string, dia?: string): void {
  try {
    localStorage.setItem(chaveQuota(matchId, dia), "1");
  } catch {
    /* sem storage: o servidor continua sendo a verdade */
  }
}

/**
 * Extrai o id da partida de um caminho `/jogos/<id>...`.
 * Retorna null para a lista (`/jogos`) e para qualquer outra rota.
 */
export function matchIdDeCaminho(caminho: string): string | null {
  const m = /^\/jogos\/([^/?#]+)/.exec(caminho);
  if (!m) return null;
  const id = decodeURIComponent(m[1]).trim();
  return id.length > 0 ? id : null;
}
