"use client";

import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useSyncExternalStore,
  useState,
} from "react";
import { correlacaoDoConjunto, evDe, type Perna } from "@/lib/comboBuilder";

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

export type OrigemSelecao = "prop" | "mercado";

export type Selecao = {
  /** id estável: fixture:mercado:jogador:linha (igual ao `chave` das props). */
  chave: string;
  fixtureId: number;
  /** De onde veio a perna: prop de jogador ou mercado de jogo. */
  origem: OrigemSelecao;
  /** "Palmeiras × Flamengo" — legível no bilhete. */
  matchLabel: string;
  jogador?: string;
  mercado: string; // rótulo humano, ex.: "Finalizações"
  linha?: number;
  /** `gols` | `gols_1t` | `escanteios` — régua de correlação. */
  grupo?: string;
  /** Código da liga na fonte (necessário para montar combo pela API). */
  league?: string;
  /** Odd exibida. 0 quando não há odd nenhuma. */
  odd: number;
  /**
   * Odd da Pinnacle (âncora do EV). `null` quando a casa não cotou — nesse caso
   * o EV é omitido, nunca trocado pela odd de uma casa menor.
   */
  oddPinnacle: number | null;
  probModelo: number; // 0..1
  /** Métrica derivada (ex.: cantos do 1º tempo). */
  estimado?: boolean;
};

type Ctx = {
  selecoes: Selecao[];
  /** Quantos itens estão no bilhete (para o badge do carrinho). */
  total: number;
  tem: (chave: string) => boolean;
  alternar: (s: Selecao) => void;
  /** Troca o bilhete inteiro de uma vez (usado ao aplicar um combo). */
  substituir: (novas: Selecao[]) => void;
  remover: (chave: string) => void;
  limpar: () => void;
  /** Produto das odds exibidas. */
  oddTotal: number;
  /** Produto das probabilidades do modelo (assume independência). */
  probCombinada: number;
  /** EV do bilhete na âncora Pinnacle. `null` se faltar âncora ou houver correlação. */
  evCombinado: number | null;
  /** Motivo da correlação entre pernas, quando existe. */
  correlacao: string | null;
  /** Quantas seleções estão sem odd da Pinnacle. */
  semAncora: number;
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
    const limpo = arr
      .filter((x): x is Partial<Selecao> & { chave: string; odd: number; probModelo: number } => {
        const s = x as Partial<Selecao>;
        return (
          typeof s.chave === "string" &&
          typeof s.odd === "number" &&
          typeof s.probModelo === "number"
        );
      })
      .map(migrar);
    return limpo;
  } catch {
    return VAZIO;
  }
}

/**
 * Bilhete antigo (v1) → v2.
 *
 * v1 guardava `home`/`away` soltos e não dizia a origem nem a casa da odd. Na
 * migração tratamos tudo como prop, montamos o rótulo do jogo e deixamos
 * `oddPinnacle = null` — sem saber a casa, o EV fica oculto em vez de mentir.
 */
function migrar(s: Partial<Selecao> & { home?: string; away?: string }): Selecao {
  const origem: OrigemSelecao = s.origem === "mercado" ? "mercado" : "prop";
  const matchLabel =
    s.matchLabel ||
    (s.home && s.away ? `${s.home} × ${s.away}` : s.mercado || "Seleção");
  return {
    chave: String(s.chave),
    fixtureId: Number(s.fixtureId) || 0,
    origem,
    matchLabel,
    jogador: s.jogador,
    mercado: String(s.mercado || ""),
    linha: typeof s.linha === "number" ? s.linha : undefined,
    grupo: s.grupo,
    league: s.league,
    odd: Number(s.odd) > 1 ? Number(s.odd) : 0,
    oddPinnacle: typeof s.oddPinnacle === "number" && s.oddPinnacle > 1 ? s.oddPinnacle : null,
    probModelo: Math.min(0.999, Math.max(0.001, Number(s.probModelo) || 0)),
    estimado: Boolean(s.estimado),
  };
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

  const substituir = useCallback((novas: Selecao[]) => {
    garantirInit();
    // Dedupe por chave: aplicar duas vezes o mesmo combo não duplica perna.
    const porChave = new Map<string, Selecao>();
    for (const s of novas) porChave.set(s.chave, s);
    definir([...porChave.values()]);
  }, []);

  const limpar = useCallback(() => {
    definir(VAZIO);
  }, []);

  const { oddTotal, probCombinada, evCombinado, correlacao, semAncora } = useMemo(() => {
    if (selecoes.length === 0) {
      return { oddTotal: 0, probCombinada: 0, evCombinado: null as number | null, correlacao: null as string | null, semAncora: 0 };
    }
    let odd = 1;
    let prob = 1;
    let oddPinnacle = 1;
    let sem = 0;
    for (const s of selecoes) {
      if (s.odd > 1) odd *= s.odd;
      prob *= s.probModelo;
      if (s.oddPinnacle != null && s.oddPinnacle > 1) oddPinnacle *= s.oddPinnacle;
      else sem++;
    }

    const pernas: Perna[] = selecoes.map((s) => ({
      chave: s.chave,
      fixtureId: s.fixtureId,
      origem: s.origem,
      matchLabel: s.matchLabel,
      rotulo: s.mercado,
      mercadoId: s.origem === "mercado" ? s.chave.split(":").pop() : undefined,
      grupo: s.grupo,
      jogador: s.jogador,
      prob: s.probModelo,
      odd: s.oddPinnacle,
    }));
    const motivo = correlacaoDoConjunto(pernas);

    // EV só existe com TODAS as pernas ancoradas na Pinnacle e sem correlação:
    // o produto de probabilidades marginais não vale para eventos dependentes.
    const ev = sem === 0 && !motivo ? evDe(prob, oddPinnacle) : null;

    return { oddTotal: odd, probCombinada: prob, evCombinado: ev, correlacao: motivo, semAncora: sem };
  }, [selecoes]);

  const valor = useMemo<Ctx>(
    () => ({
      selecoes,
      total: selecoes.length,
      tem,
      alternar,
      substituir,
      remover,
      limpar,
      oddTotal,
      probCombinada,
      evCombinado,
      correlacao,
      semAncora,
      aberto,
      setAberto,
    }),
    [selecoes, tem, alternar, substituir, remover, limpar, oddTotal, probCombinada, evCombinado, correlacao, semAncora, aberto],
  );

  return <BetSlipCtx.Provider value={valor}>{children}</BetSlipCtx.Provider>;
}

export function useBetSlip(): Ctx {
  const ctx = useContext(BetSlipCtx);
  if (!ctx) throw new Error("useBetSlip precisa estar dentro de <BetSlipProvider>");
  return ctx;
}
