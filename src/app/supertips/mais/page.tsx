"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, Star, ShieldCheck, Bell, Sun, Moon } from "lucide-react";
import { useApp } from "@/context/AppContext";

export default function Mais() {
  const { user, theme, toggleTheme, favorites } = useApp();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);

  const search = async (v: string) => {
    setQ(v);
    if (v.trim().length < 2) { setRes(null); return; }
    const r = await fetch(`/api/supertips/search?q=${encodeURIComponent(v)}`);
    setRes(await r.json());
  };

  return (
    <div className="space-y-3">
      <h1 className="font-display font-bold text-2xl uppercase">Mais</h1>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
        <input value={q} onChange={(e) => search(e.target.value)} placeholder="Buscar time, liga ou jogador" className="w-full bg-[#141820] border border-white/10 rounded-xl pl-8 pr-3 py-3 text-sm" />
      </div>
      {res && (
        <div className="bg-[#141820] rounded-2xl p-3 space-y-1">
          {(res.leagues || []).map((l: any) => <Link key={l.code} href={`/supertips?liga=${l.code}`} className="block text-[12px] font-bold py-1">{l.flag} {l.name}</Link>)}
          {(res.hits || []).map((h: any, i: number) => <p key={i} className="text-[12px] py-1 border-t border-white/5">{h.name} <span className="text-mut">{h.league}</span></p>)}
          {!res.leagues?.length && !res.hits?.length && <p className="text-xs text-mut">Nada encontrado.</p>}
        </div>
      )}
      <div className="bg-[#141820] rounded-2xl p-3">
        <p className="text-[11px] font-extrabold uppercase text-mut mb-2 flex items-center gap-1"><Star size={12} className="text-warn" /> Favoritos</p>
        {favorites.length === 0 && <p className="text-xs text-mut">Marque a estrela num time na Home do GreenScore.</p>}
        {favorites.map((t) => <Link key={t.id} href={`/times/${t.id}?league=${t.league}`} className="block text-[12px] font-bold py-1">{t.name}</Link>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link href="/config#alertas" className="bg-[#141820] rounded-2xl p-3 flex items-center gap-2 text-xs font-bold"><Bell size={14} className="text-warn" /> Alertas</Link>
        <button onClick={toggleTheme} className="bg-[#141820] rounded-2xl p-3 flex items-center gap-2 text-xs font-bold">{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />} Tema</button>
        <Link href="/desempenho" className="bg-[#141820] rounded-2xl p-3 text-xs font-bold">Track Record</Link>
        <Link href="/" className="bg-[#141820] rounded-2xl p-3 text-xs font-bold">GreenScore</Link>
        {user?.isAdmin && <Link href="/admin" className="bg-[#141820] border border-warn/40 rounded-2xl p-3 flex items-center gap-2 text-xs font-bold col-span-2"><ShieldCheck size={14} className="text-warn" /> Painel admin</Link>}
      </div>
      <p className="text-[10px] text-mut leading-relaxed">SuperTips cobre futebol, NBA e tênis com dados ESPN. Probabilidade não é garantia. Proibido para menores de 18 anos. O botão de discussão fica em cada jogo; o Telegram recebe o texto da múltipla, sem bot automático.</p>
    </div>
  );
}