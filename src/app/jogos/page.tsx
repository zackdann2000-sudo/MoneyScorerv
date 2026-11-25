"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import GamesBoard from "@/components/flash/GamesBoard";
import StatusAcesso from "@/components/StatusAcesso";
import ScreenerPanel from "@/components/ScreenerPanel";
import BuscaGlobal from "@/components/BuscaGlobal";

/* Aba Jogos do app (usuário logado). A landing de vendas fica em "/".
   Duas abas na mesma rota: a lista do dia e o Screener. A âncora da Home
   aponta para /jogos?aba=screener, então a URL manda no estado inicial. */
function Conteudo() {
  const sp = useSearchParams();
  const [aba, setAba] = useState<"jogos" | "screener">(sp.get("aba") === "screener" ? "screener" : "jogos");

  return (
    <>
      <StatusAcesso />
      <BuscaGlobal inline />

      <div className="flex gap-1.5 mb-3">
        {(
          [
            ["jogos", "Jogos"],
            ["screener", "🔎 Screener"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            aria-current={aba === id ? "page" : undefined}
            className={`flex-1 h-9 rounded-xl text-[11px] font-extrabold border transition-colors ${aba === id ? "bg-acc text-black border-acc" : "bg-panel border-line text-mut"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "jogos" ? <GamesBoard mode="all" /> : <ScreenerPanel />}
    </>
  );
}

export default function JogosPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-mut">Carregando…</div>}>
      <Conteudo />
    </Suspense>
  );
}
