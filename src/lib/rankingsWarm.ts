/* Pré-aquecimento dos RANKINGS: monta a base das 6 ligas e grava no Neon.
   Roda no cron diário (06:00 BRT). Sem o Neon isto não teria efeito, porque o
   cache em memória morre com a lambda — o banco é o que sobrevive. */

import { cacheBust } from "./cache";
import { LIGAS_RANKING, montarLigaRanking } from "./rankingsData";
import { gravarRankingsCache } from "./rankingsStore";
import { leagueInfo } from "./espn";

export type ResultadoLiga = {
  liga: string;
  nome: string;
  times: number;
  jogos: number;
  salvo: boolean;
  erro?: string;
  duracaoMs: number;
};

export type ResultadoAquecimento = {
  ligas: ResultadoLiga[];
  salvos: number;
  falhas: number;
  puladas: string[];
  duracaoMs: number;
};

/** Orçamento padrão do aquecimento inteiro (o teto da função é 300s). */
export const ORCAMENTO_PADRAO_MS = 240_000;

/**
 * Aquece as ligas informadas (padrão: as 6 do seletor) e grava cada uma no Neon.
 *
 * Regras:
 *  - recalcula de verdade (`cacheBust`) para não gravar base velha de memória;
 *  - para antes do orçamento e devolve o que faltou em `puladas` — o próximo run
 *    pega o resto, e a tela calcula na hora quem ainda não estiver no banco;
 *  - falha de uma liga não derruba as outras.
 */
export async function aquecerRankings(opts: {
  ligas?: string[];
  orcamentoMs?: number;
} = {}): Promise<ResultadoAquecimento> {
  const inicio = Date.now();
  const orcamento = opts.orcamentoMs ?? ORCAMENTO_PADRAO_MS;
  const ligas = (opts.ligas?.length ? opts.ligas : [...LIGAS_RANKING]).filter((c) =>
    (LIGAS_RANKING as readonly string[]).includes(c),
  );

  const resultados: ResultadoLiga[] = [];
  const puladas: string[] = [];

  for (const code of ligas) {
    const gasto = Date.now() - inicio;
    if (gasto > orcamento) {
      puladas.push(code);
      continue;
    }
    const t0 = Date.now();
    const nome = leagueInfo(code).name;
    try {
      cacheBust(`rankings-liga-${code}`);
      const times = await montarLigaRanking(code);
      const jogos = times.reduce((n, t) => n + t.jogos.length, 0);
      if (!times.length) {
        resultados.push({ liga: code, nome, times: 0, jogos: 0, salvo: false, erro: "ESPN sem times", duracaoMs: Date.now() - t0 });
        continue;
      }
      const salvo = await gravarRankingsCache(code, times);
      resultados.push({
        liga: code,
        nome,
        times: times.length,
        jogos,
        salvo,
        erro: salvo ? undefined : "falha ao gravar no Neon",
        duracaoMs: Date.now() - t0,
      });
    } catch (e: any) {
      resultados.push({
        liga: code,
        nome,
        times: 0,
        jogos: 0,
        salvo: false,
        erro: String(e?.message || e).slice(0, 160),
        duracaoMs: Date.now() - t0,
      });
    }
  }

  return {
    ligas: resultados,
    salvos: resultados.filter((r) => r.salvo).length,
    falhas: resultados.filter((r) => !r.salvo).length,
    puladas,
    duracaoMs: Date.now() - inicio,
  };
}
