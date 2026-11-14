"use client";
import { useState } from "react";
import Link from "next/link";
import GamesBoard from "@/components/flash/GamesBoard";
import { useApp } from "@/context/AppContext";
import { Crest } from "@/components/ui";

const TABS = ["Jogos", "Equipes", "Jogadores", "Notícias"] as const;

export default function Favoritos() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Jogos");
  const { favorites } = useApp();
  return (
    <div>
      <div className="flex gap-4 border-b border-line mb-3 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`shrink-0 pb-2 text-[12px] font-bold ${tab === t ? "text-live border-b-2 border-live" : "text-mut"}`}>{t.toUpperCase()}</button>
        ))}
      </div>
      {tab === "Jogos" && <GamesBoard mode="favorites" />}
      {tab === "Equipes" && (
        favorites.length === 0 ? <p className="text-sm text-mut py-8 text-center">Nenhuma equipe favorita. Toque na estrela de um jogo.</p> : (
          <div>{favorites.map((t) => (
            <Link key={t.id} href={`/times/${t.id}?league=${t.league}`} className="flex items-center gap-3 h-14 border-b border-line">
              <Crest src={t.logo} size={24} alt={t.name} />
              <span className="font-bold text-sm">{t.name}</span>
            </Link>
          ))}</div>
        )
      )}
      {tab === "Jogadores" && <p className="text-sm text-mut py-8 text-center">A fonte não guarda uma lista pessoal de jogadores. Os rankings públicos estão em Estatísticas.</p>}
      {tab === "Notícias" && <p className="text-sm text-mut py-8 text-center">Notícias das equipes favoritas aparecem quando a fonte publica um feed ligado a esses clubes. Veja o feed geral em Notícias.</p>}
    </div>
  );
}