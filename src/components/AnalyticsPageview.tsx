"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { track } from "@/lib/analytics";

/**
 * Pageview do App Router.
 *
 * O GA carregado no layout conta apenas o primeiro carregamento. Navegação
 * interna (landing → cadastro → planos) é client-side e NÃO gera `page_view`
 * sozinha — sem isto o funil aparece com uma visita e zero páginas seguintes.
 *
 * `useSearchParams` fica em Suspense porque a página é estática em boa parte
 * das rotas; o wrapper cuida disso.
 */
export default function AnalyticsPageview() {
  const pathname = usePathname();
  const params = useSearchParams();
  const anterior = useRef<string | null>(null);

  useEffect(() => {
    const busca = params?.toString() || "";
    const destino = busca ? `${pathname}?${busca}` : pathname || "/";
    if (anterior.current === destino) return;
    anterior.current = destino;
    track("page_view", {
      page_path: destino,
      page_location: typeof window !== "undefined" ? window.location.href : destino,
      page_title: typeof document !== "undefined" ? document.title : "",
    });
  }, [pathname, params]);

  return null;
}
