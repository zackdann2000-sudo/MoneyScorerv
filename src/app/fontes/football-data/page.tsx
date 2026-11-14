"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function FootballDataPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetch("/api/admin/test?provider=footballdata").then((r) => r.json()).then(setData).catch(() => setData({ ok: false, message: "Faça login como administrador para testar a chave." }));
  }, []);
  const comps = Array.isArray(data?.sample) ? data.sample : [];
  return (
    <div>
      <p className="text-[10px] font-bold tracking-widest text-mut">FONTE SECUNDÁRIA</p>
      <h1 className="font-display font-bold text-3xl">Football-Data.org</h1>
      <p className="text-sm text-mut mt-1">Competições, jogos e artilheiros da chave salva no servidor. Nada é exibido sem resposta da API.</p>
      <p className={`mt-3 text-sm font-bold ${data?.ok ? "text-acc" : "text-mut"}`}>{data ? data.message : "Consultando..."}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line p-3"><p className="text-[10px] text-mut">COMPETIÇÕES</p><p className="font-display font-bold text-3xl">{comps.length || "—"}</p></div>
        <div className="rounded-xl border border-line p-3"><p className="text-[10px] text-mut">FONTE</p><p className="font-display font-bold text-xl">FD.org</p></div>
      </div>
      <div className="mt-4 space-y-2">
        {comps.map((c: any) => (
          <div key={c.code || c.name} className="rounded-xl border border-line p-3">
            <p className="font-bold">{c.name}</p>
            <p className="text-[11px] text-mut">{c.country || ""} {c.code ? `· ${c.code}` : ""}</p>
          </div>
        ))}
      </div>
      {!data?.ok && <Link href="/admin" className="inline-block mt-4 text-sm font-bold text-acc">Abrir admin para colar a chave</Link>}
    </div>
  );
}