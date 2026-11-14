"use client";
import { useEffect, useState } from "react";

export default function Noticias() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    fetch("/api/news").then((r) => r.json()).then(setData).catch(() => setErr("Falha ao carregar notícias."));
  }, []);
  return (
    <div>
      <h1 className="font-display font-bold text-[22px] mb-2">Notícias</h1>
      {data === null && !err && <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-16" />)}</div>}
      {err && <p className="text-sm text-danger">{err}</p>}
      {(data?.articles || []).map((a: any) => (
        <a key={a.id} href={a.link || "#"} target="_blank" rel="noreferrer" className="block py-3 border-b border-line">
          <p className="text-sm font-bold leading-snug">{a.title}</p>
          {a.description && <p className="text-[12px] text-mut mt-1 line-clamp-2">{a.description}</p>}
          <p className="text-[10px] text-mut mt-1">Fonte: ESPN{a.published ? ` · ${new Date(a.published).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
        </a>
      ))}
      {data && data.articles?.length === 0 && <p className="text-sm text-mut py-8 text-center">A ESPN não publicou notícias nestas ligas agora.</p>}
    </div>
  );
}