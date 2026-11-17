"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
  useState,
} from "react";

/**
 * BetSlip (bilhete de combinada) do módulo /apitou.
 *
 * Escopo: guarda as seleções em memória + localStorage, porque um bilhete que
 * some ao recarregar a página é inútil na prática — o usuário costuma montar a
 * múltipla olhando vários jogos.
 *
 * Implementação como "external store" (useSyncExternalStore) em vez de
 * useState+useEffect: ler localStorage dentro de um efeito e chamar setState ali
 * dispara a regra react-hooks/set-state-in-effect e provoca um render extra.
 * Com um store externo o React lê o valor e assina mudanças sem efeito, e o
 * getServerSnapshot resolve o mismatch de hidratação (servidor não tem bilhete).
 *
 * Fica separado do AppContext de propósito: o AppContext é do app inteiro e
 * carrega auth/tema/favoritos; misturar o bilhete lá faria o estado do módulo
 * vazar para todo lugar.
 */

export type Selecao = {
  /** id estável: fixture:mercado:jogador:linha (igual ao `chave` das props). */
  chave: string;
  fixtureId: number;
  jogador: string;
  mercado: string; // rótulo humano, ex.: "Finalizações"
  linha: number;
  odd: number;
  probModelo: number; // 0..1
  home: string;
  away: string;
};

type Ctx = {
  selecoes: Selecao[];
  /** Quantos itens estão no bilhete (para o badge do carrinho). */
  total: number;
  tem: (chave: string) => boolean;
  alternar: (s: Selecao) => void;
  remover: (chave: string) => void;
  limpar: () => void;
  /** Produto das odds. */
  oddTotal: number;
  /** Produto das probabilidades do modelo (assume independência). */
  probCombinada: number;
  aberto: boolean;
  setAberto: (v: boolean) => void;
};

const STORAGE_KEY = "apitou.betslip.v1";

/* ----------------------------- store externo ----------------------------- */

/** Referência estável para o snapshot vazio (servidor e primeiro render). */
const VAZIO: Selecao[] = [];

let estado: Selecao[] = VAZIO;
let inicializado = false;
const ouvintes = new Set<() => void>();

function emitir() {
  for (const fn of ouvintes) fn();
}

/** Lê do localStorage com validação defensiva (dado antigo/corrompido não quebra). */
function lerDoStorage(): Selecao[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return VAZIO;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return VAZIO;
    const limpo = arr.filter((x): x is Selecao => {
      const s = x as Partial<Selecao>;
      return (
        typeof s.chave === "string" &&
        typeof s.odd === "number" &&
        s.odd > 1 &&
        typeof s.probModelo === "number" &&
        typeof s.jogador === "string"
      );
    });
    return limpo;
  } catch {
    return VAZIO;
  }
}

function garantirInit() {
  if (inicializado) return;
  inicializado = true;
  if (typeof window !== "undefined") estado = lerDoStorage();
}

function persistir() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  } catch {
    // Modo privado / cota cheia: seguir sem persistir é aceitável.
  }
}

function definir(novo: Selecao[]) {
  estado = novo;
  persistir();
  emitir();
}

function assinar(cb: () => void) {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

function snapshot() {
  garantirInit();
  return estado;
}

/** No servidor o bilhete é sempre vazio (não há localStorage). */
function snapshotServidor(): Selecao[] {
  return VAZIO;
}

/* ---------------------------------- UI ---------------------------------- */

const BetSlipCtx = createContext<Ctx | null>(null);

export function BetSlipProvider({ children }: { children: React.ReactNode }) {
  const selecoes = useSyncExternalStore(assinar, snapshot, snapshotServidor);

  // Estado puramente visual do drawer: setState em handler é legítimo.
  const [aberto, setAberto] = useState(false);

  const tem = useCallback(
    (chave: string) => selecoes.some((s) => s.chave === chave),
    [selecoes],
  );

  const alternar = useCallback((s: Selecao) => {
    garantirInit();
    const existe = estado.some((x) => x.chave === s.chave);
    definir(existe ? estado.filter((x) => x.chave !== s.chave) : [...estado, s]);
  }, []);

  const remover = useCallback((chave: string) => {
    garantirInit();
    definir(estado.filter((s) => s.chave !== chave));
  }, []);

  const limpar = useCallback(() => {
    definir(VAZIO);
  }, []);

  const { oddTotal, probCombinada } = useMemo(() => {
    if (selecoes.length === 0) return { oddTotal: 0, probCombinada: 0 };
    let odd = 1;
    let prob = 1;
    for (const s of selecoes) {
      odd *= s.odd;
      prob *= s.probModelo;
    }
    return { oddTotal: odd, probCombinada: prob };
  }, [selecoes]);

  const valor = useMemo<Ctx>(
    () => ({
      selecoes,
      total: selecoes.length,
      tem,
      alternar,
      remover,
      limpar,
      oddTotal,
      probCombinada,
      aberto,
      setAberto,
    }),
    [selecoes, tem, alternar, remover, limpar, oddTotal, probCombinada, aberto],
  );

  return <BetSlipCtx.Provider value={valor}>{children}</BetSlipCtx.Provider>;
}

export function useBetSlip(): Ctx {
  const ctx = useContext(BetSlipCtx);
  if (!ctx) throw new Error("useBetSlip precisa estar dentro de <BetSlipProvider>");
  return ctx;
}
