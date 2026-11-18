"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Fetch com estado, cancelamento e "revalidar" (fura o cache de 15 min).
 * Compartilhado pelas abas do módulo /nerdytips.
 */
export type ApiState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: (revalidate?: boolean) => void;
};

export function useApi<T>(url: string | null, deps: unknown[] = []): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const revalidateRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback((revalidate = false) => {
    revalidateRef.current = revalidate;
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    // Sem URL não há o que buscar. Não mexemos no estado de forma síncrona aqui:
    // setState dentro do corpo do effect dispara renders em cascata (regra do
    // React Compiler). O componente já trata `data === null` enquanto isso.
    if (!url) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const finalUrl = revalidateRef.current
      ? `${url}${url.includes("?") ? "&" : "?"}revalidate=1`
      : url;
    revalidateRef.current = false;

    // setState de loading/erro entra no microtask do fetch, não no corpo
    // síncrono do effect (evita renders em cascata).
    Promise.resolve()
      .then(() => {
        if (ctrl.signal.aborted) return;
        setLoading(true);
        setError(null);
      })
      .then(() => fetch(finalUrl, { signal: ctrl.signal }))
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json?.error ?? `HTTP ${r.status}`);
        return json as T;
      })
      .then((json) => {
        if (!ctrl.signal.aborted) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, nonce, ...deps]);

  return { data, loading, error, refresh };
}
