import type { MetadataRoute } from "next";

/**
 * robots.txt (gerado pelo Next em /robots.txt).
 *
 * Fecha o que não deve ser indexado e nunca deve aparecer no Google:
 *  - /api/*   rotas internas e webhooks
 *  - /admin   painel
 *  - /config  conta, push e dados pessoais
 *  - /login, /cadastro  telas de formulário (conteúdo duplicado/thin)
 *
 * O resto é aberto: o conteúdo público é o que traz tráfego orgânico.
 */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://greenscore.app").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin", "/config", "/login", "/cadastro"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
