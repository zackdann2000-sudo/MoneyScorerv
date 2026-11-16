"use client";

import { useCallback, useEffect, useState } from "react";
import type { PropRowUI } from "./types";

export type PinnedProp = {
  id: number;
  propKey: string;
  market: string;
  marketLabel: string;
  selection: string;
  line: number | null;
  odd: number | null;
  bookmaker: string;
  subjectName: string;
  subjectPhoto: string;
  homeName: string;
  awayName: string;
  leagueName: string;
  fixtureId: string;
  kickoffUtc: string;
  hitRateL10: number | null;
  score: number | null;
};

/**
 * Estado das props fixadas.
 *
 * Otimista: a estrela muda na hora e a gravação acontece em segundo plano, com
 * rollback se o servidor recusar. Sem login a rota devolve `anon`, e nesse caso
 * o estado fica só na sessão — deixamos isso explícito para a UI avisar.
 */
export function usePins() {
  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [anon, setAnon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/gameread/pinned")
      .then((r) => r.json())
      .then((d: { pinned?: PinnedProp[]; anon?: boolean; error?: string }) => {
        if (!alive) return;
        setKeys(new Set((d.pinned ?? []).map((p) => p.propKey)));
        setAnon(d.anon === true);
        if (d.error) setError(d.error);
      })
      .catch(() => {
        /* rede instável: a tela segue sem pins */
      });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = useCallback(
    async (prop: PropRowUI) => {
      const isPinned = keys.has(prop.id);
      setError(null);

      // Otimista
      setKeys((prev) => {
        const next = new Set(prev);
        if (isPinned) next.delete(prop.id);
        else next.add(prop.id);
        return next;
      });

      try {
        const res = await fetch("/api/gameread/pinned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prop, on: !isPinned }),
        });
        const json = await res.json();
        if (json.anon) {
          setAnon(true);
          return;
        }
        if (!res.ok || json.error) throw new Error(json.error ?? `HTTP ${res.status}`);
      } catch (e) {
        // Rollback
        setKeys((prev) => {
          const next = new Set(prev);
          if (isPinned) next.add(prop.id);
          else next.delete(prop.id);
          return next;
        });
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [keys],
  );

  return { keys, toggle, anon, error };
}
