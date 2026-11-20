"use client";
import { Suspense } from "react";
import GamesBoard from "@/components/flash/GamesBoard";

export default function AoVivo() {
  return <Suspense fallback={<div className="py-10 text-center text-sm text-mut">Carregando…</div>}><GamesBoard mode="live" /></Suspense>;
}