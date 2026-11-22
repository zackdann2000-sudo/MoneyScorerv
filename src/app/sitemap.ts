import type { MetadataRoute } from "next";

/**
 * sitemap.xml (gerado pelo Next em /sitemap.xml).
 *
 * Lista estática de propósito: as páginas com id (jogo/time/liga) dependem do
 * banco e mudam a cada sync. Gerar milhares de URLs desatualizadas a cada build
 * só gasta crawl budget; o importante agora é o Google achar o funil
 * (landing → planos → metodologia) e o conteúdo perene.
 *
 * `lastModified` fixo no build evita "tudo mudou" em cada deploy — o Google
 * ignora sitemaps que mentem sobre a data.
 */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://greenscore.app").replace(/\/$/, "");

type Rota = {
  caminho: string;
  prioridade: number;
  freq: "daily" | "weekly" | "monthly";
};

const ROTAS: Rota[] = [
  // Funil principal
  { caminho: "/", prioridade: 1, freq: "daily" },
  { caminho: "/planos", prioridade: 0.9, freq: "weekly" },
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
  { caminho: "/ev", prioridade: 0.6, freq: "daily" },
  { caminho: "/edge", prioridade: 0.5, freq: "daily" },
  { caminho: "/money-tips", prioridade: 0.5, freq: "daily" },
  // Legal (confiança + exigência de anúncios/gateways)
  { caminho: "/termos", prioridade: 0.3, freq: "monthly" },
  { caminho: "/privacidade", prioridade: 0.3, freq: "monthly" },
  { caminho: "/jogo-responsavel", prioridade: 0.3, freq: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const data = new Date();
  return ROTAS.map((r) => ({
    url: `${SITE}${r.caminho}`,
    lastModified: data,
    changeFrequency: r.freq,
    priority: r.prioridade,
  }));
}
