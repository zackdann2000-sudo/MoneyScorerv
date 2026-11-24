"use client";
import { Suspense } from "react";
import GamesBoard from "@/components/flash/GamesBoard";
import StatusAcesso from "@/components/StatusAcesso";

/* Aba Jogos do app (usuário logado). A landing de vendas fica em "/". */
export default function JogosPage() {
  return (
    <>
      <StatusAcesso />
      <Suspense fallback={<div className="py-10 text-center text-sm text-mut">Carregando…</div>}>
        <GamesBoard mode="all" />
      </Suspense>
    </>
  );
}
