"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { Crest } from "@/components/ui";
import type { Resultado } from "@/lib/searchIndex";

/* =============================================================================
   Busca global (time · liga · jogo).

   `inline`   → barra fixa (usada em /jogos, logo acima das abas).
   sem inline → campo que abre em painel (header do app + Ctrl/⌘K).

   A busca consulta /api/search, que NÃO fala com fornecedor nenhum: ligas
   estáticas + times do Hub + placar que já está em cache. 1 letra não busca.
   ========================================================================== */

function Linha({ r, ativo, onClick }: { r: Resultado; ativo: boolean; onClick: () => void }) {
  const cor = r.tipo === "time" ? "text-acc" : r.tipo === "liga" ? "text-ink" : "text-mut";
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left ${ativo ? "bg-panel2" : "hover:bg-panel"}`}
    >
      {r.tipo === "time" && r.logo ? <Crest src={r.logo} size={24} /> : <span className={`text-[9px] font-black uppercase tracking-wide w-8 shrink-0 ${cor}`}>{r.tipo}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold truncate">{r.nome}</span>
        {r.sub && <span className="block text-[10px] text-mut truncate">{r.sub}</span>}
      </span>
      <span className="text-[10px] text-mut">→</span>
    </button>
  );
}

export default function BuscaGlobal({
  inline = false,
  onClose,
  autoFocus = false,
}: {
  inline?: boolean;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<{ q: string; dados: { grupos: { times: Resultado[]; ligas: Resultado[]; jogos: Resultado[] } } | null } | null>(null);
  /* Busca e "carregando" são DERIVADOS da consulta atual: a resposta guarda o
     termo a que pertence, então digitar de novo já mostra o spinner sem
     precisar de `setState` síncrono no corpo do efeito. */
  const termo = q.trim();
  const atual = estado?.q === termo ? estado : null;
  const dados = termo.length >= 2 ? (atual?.dados ?? null) : null;
  const carregando = termo.length >= 2 && atual === null;
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) return; // abaixo do mínimo: nada a buscar (sem setState no efeito)
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(t)}`)
        .then((r) => r.json())
        .then((j) => setEstado({ q: t, dados: j?.grupos ? j : null }))
        .catch(() => setEstado({ q: t, dados: null }));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const lista = useMemo(() => {
    if (!dados) return [];
    return [...dados.grupos.times, ...dados.grupos.ligas, ...dados.grupos.jogos];
  }, [dados]);

  const abrir = useCallback(
    (r?: Resultado) => {
      const alvo = r || lista[ativo];
      if (!alvo) return;
      onClose?.();
      router.push(alvo.href);
    },
    [lista, ativo, onClose, router]
  );

  const campo = (
    <div className="flex items-center gap-2 bg-panel border border-line rounded-xl px-3 h-11">
      <Search size={16} className="text-mut shrink-0" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setAtivo(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((i) => Math.min(i + 1, Math.max(0, lista.length - 1)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            abrir();
          } else if (e.key === "Escape") {
            onClose?.();
          }
        }}
        placeholder="Buscar time, liga ou jogo…"
        aria-label="Buscar time, liga ou jogo"
        className="flex-1 bg-transparent text-sm text-ink placeholder:text-mut outline-none min-w-0"
      />
      {carregando && <Loader2 size={14} className="text-mut animate-spin shrink-0" />}
      {!!q && !carregando && (
        <button onClick={() => setQ("")} aria-label="Limpar busca" className="text-mut">
          <X size={14} />
        </button>
      )}
      {!inline && (
        <button onClick={() => onClose?.()} aria-label="Fechar busca" className="text-mut">
          <X size={16} />
        </button>
      )}
    </div>
  );

  const resultados = dados && (
    <div className="mt-2">
      {lista.length === 0 && !carregando && <p className="text-center text-xs text-mut py-4">Nada encontrado para “{q}”.</p>}
      {(["times", "ligas", "jogos"] as const).map((g) =>
        dados.grupos[g].length ? (
          <div key={g} className="mb-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-mut px-3 py-1">{g === "times" ? "Times" : g === "ligas" ? "Ligas" : "Jogos"}</p>
            {dados.grupos[g].map((r) => (
              <Linha key={`${r.tipo}:${r.id}`} r={r} ativo={lista.indexOf(r) === ativo} onClick={() => abrir(r)} />
            ))}
          </div>
        ) : null
      )}
    </div>
  );

  if (inline) return <div className="mb-2">{campo}{resultados}</div>;

  return (
    <div className="fixed inset-0 z-[80] bg-bg/80 backdrop-blur-sm flex items-start justify-center p-3 pt-16">
      <div className="w-full max-w-lg bg-panel border border-line rounded-2xl p-3 shadow-2xl">
        {campo}
        {resultados}
        <p className="text-[9px] text-mut text-center mt-2">↑↓ navega · Enter abre · Esc fecha</p>
      </div>
    </div>
  );
}
