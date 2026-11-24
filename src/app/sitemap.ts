import type { MetadataRoute } from "next";
import { caminhoDaLiga, ligasParaListagem } from "@/lib/seoLigas";
import { ultimaAtualizacaoPorLiga } from "@/lib/seoLigaDados";

/**
 * sitemap.xml (gerado pelo Next em /sitemap.xml).
 *
 * Lista estática para as rotas fixas: as páginas com id (jogo/time) dependem do
 * banco e mudam a cada sync. Gerar milhares de URLs desatualizadas a cada build
 * só gasta crawl budget; o importante agora é o Google achar o funil
 * (landing → planos → metodologia) e o conteúdo perene.
 *
 * As páginas de liga (`/palpites/{liga}`) são a exceção: elas são poucas, têm
 * URL própria e ganham `lastModified` REAL, vindo de `hub_analysis.created_at`.
 * Nas rotas fixas a data é a do build — data inventada em tudo faz o Google
 * desconfiar do arquivo inteiro.
 */
export const revalidate = 3600;
const SITE = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://greenscore.app").replace(/\/$/, "");

type Rota = {
  caminho: string;
  prioridade: number;
  freq: "daily" | "weekly" | "monthly";
};

const ROTAS: Rota[] = [
  // Funil principal
  { caminho: "/", prioridade: 1, freq: "daily" },
  // /planos fica fora do sitemap: a venda está pausada e a página é noindex.
  { caminho: "/metodologia", prioridade: 0.8, freq: "monthly" },
  // Conteúdo que atualiza todo dia
  { caminho: "/hub", prioridade: 0.8, freq: "daily" },
  { caminho: "/hub/classificacao", prioridade: 0.7, freq: "daily" },
  { caminho: "/ao-vivo", prioridade: 0.7, freq: "daily" },
  { caminho: "/noticias", prioridade: 0.6, freq: "daily" },
  { caminho: "/desempenho", prioridade: 0.7, freq: "daily" },
  // Bases e ferramentas
  { caminho: "/times", prioridade: 0.6, freq: "weekly" },
  { caminho: "/jogadores", prioridade: 0.6, freq: "weekly" },
  { caminho: "/ligas", prioridade: 0.6, freq: "weekly" },
  { caminho: "/rankings", prioridade: 0.5, freq: "weekly" },
  { caminho: "/palpites-ia", prioridade: 0.6, freq: "daily" },
  { caminho: "/apitou", prioridade: 0.8, freq: "daily" },
  { caminho: "/palpites", prioridade: 0.9, freq: "daily" },
  { caminho: "/ev", prioridade: 0.6, freq: "daily" },
  { caminho: "/edge", prioridade: 0.5, freq: "daily" },
  { caminho: "/money-tips", prioridade: 0.5, freq: "daily" },
  // Legal (confiança + exigência de anúncios/gateways)
  { caminho: "/termos", prioridade: 0.3, freq: "monthly" },
  { caminho: "/privacidade", prioridade: 0.3, freq: "monthly" },
  { caminho: "/jogo-responsavel", prioridade: 0.3, freq: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = new Date();
  const fixas: MetadataRoute.Sitemap = ROTAS.map((r) => ({
    url: `${SITE}${r.caminho}`,
    lastModified: data,
    changeFrequency: r.freq,
    priority: r.prioridade,
  }));

  /* Liga entra no sitemap mesmo em noindex: o `noindex` decide indexação, não
     rastreamento. Deixar a URL fora do sitemap é o que atrasa em semanas a
     descoberta da página quando os dados reais chegarem. */
  const atualizacoes = await ultimaAtualizacaoPorLiga();
  const ligas: MetadataRoute.Sitemap = ligasParaListagem().map((l) => ({
    url: `${SITE}${caminhoDaLiga(l)}`,
    lastModified: atualizacoes[l.slug] ? new Date(atualizacoes[l.slug]) : data,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...fixas, ...ligas];
}
