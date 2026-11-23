/**
 * Diagnóstico de indexabilidade das páginas `/palpites/{liga}`.
 *
 * Roda o MESMO portão que a página usa (`carregarLiga` → `indexavel`) e diz,
 * por liga, qual das três condições falhou:
 *   1. jogos futuros na janela < MIN_JOGOS_INDEXAVEIS (3)
 *   2. nenhuma análise gerada (totalAnalisados = 0)
 *   3. `revisao` = todas as análises com o mesmo resumo (análise degenerada)
 *
 * Só lê o banco — não faz build, não chama API, não escreve nada.
 *
 *   npx tsx scripts/seo-check.ts
 *   npm run seo:check
 */
import "dotenv/config";
import { SEO_LIGAS, MIN_JOGOS_INDEXAVEIS } from "@/lib/seoLigas";
import { carregarLiga } from "@/lib/seoLigaDados";

type Linha = {
  slug: string;
  indexavel: boolean;
  jogos: number;
  analisados: number;
  revisao: boolean;
  motivo: string;
};

function motivo(jogos: number, analisados: number, revisao: boolean): string {
  if (jogos < MIN_JOGOS_INDEXAVEIS && analisados === 0) return `sem jogos (<${MIN_JOGOS_INDEXAVEIS}) e sem análise`;
  if (jogos < MIN_JOGOS_INDEXAVEIS) return `só ${jogos} jogo(s) futuro(s) na janela`;
  if (analisados === 0) return "nenhuma análise gerada";
  if (revisao) return "análises degeneradas (resumo repetido)";
  return "ok";
}

async function main() {
  const linhas: Linha[] = [];
  for (const l of SEO_LIGAS) {
    const d = await carregarLiga(l);
    linhas.push({
      slug: l.slug,
      indexavel: d.indexavel,
      jogos: d.jogosFuturos,
      analisados: d.totalAnalisados,
      revisao: d.revisao,
      motivo: d.indexavel ? "ok" : motivo(d.jogosFuturos, d.totalAnalisados, d.revisao),
    });
  }

  const larg = Math.max(...linhas.map((l) => l.slug.length));
  for (const l of linhas) {
    const marca = l.indexavel ? "index" : "noindex";
    console.log(
      `${l.slug.padEnd(larg)}  ${marca.padEnd(8)} jogos=${String(l.jogos).padStart(2)}  analises=${String(l.analisados).padStart(2)}  revisao=${l.revisao ? "sim" : "não"}  ${l.motivo}`,
    );
  }

  const ok = linhas.filter((l) => l.indexavel).length;
  console.log("─".repeat(60));
  console.log(`indexáveis: ${ok}/${linhas.length}`);
  if (ok === 0) {
    console.log("Nenhuma liga passa o portão: o problema é dado (sync/análise), não o gate.");
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});
