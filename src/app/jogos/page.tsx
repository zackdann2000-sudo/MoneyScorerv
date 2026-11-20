"use client";
import { Suspense } from "react";
import GamesBoard from "@/components/flash/GamesBoard";

/* Aba Jogos do app (usuário logado). A landing de vendas fica em "/". */
export default function JogosPage() {
  return <Suspense fallback={<div className="py-10 text-center text-sm text-mut">Carregando…</div>}><GamesBoard mode="all" /></Suspense>;
}
