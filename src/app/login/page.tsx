"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUser } = useApp();
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, pass }) });
      const j = await r.json();
      if (j.error) { setErr(j.error); setLoading(false); return; }
      await refreshUser();
      router.push(j.user?.isAdmin ? "/admin" : "/");
    } catch { setErr("Falha de conexão."); setLoading(false); }
  };

  return (
    <div className="max-w-sm mx-auto pt-8">
      <div className="text-center mb-5">
        <img src="/icon.png" alt="GreenScore" className="w-16 h-16 rounded-2xl mx-auto mb-2" />
        <h1 className="font-display font-bold text-3xl uppercase">Entrar</h1>
        <p className="text-xs text-mut">Acesse sua conta GreenScore</p>
      </div>
      <form onSubmit={submit} className="bg-panel border border-line rounded-2xl p-4 space-y-3">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" className="w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-sm" />
        <input type="password" required value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Sua senha" className="w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-sm" />
        {err && <p className="text-xs text-danger bg-danger/10 rounded-lg p-2">{err}</p>}
        <button disabled={loading} className="w-full py-3 rounded-xl bg-acc text-black font-extrabold text-sm disabled:opacity-60">{loading ? "ENTRANDO…" : "ENTRAR ⚡"}</button>
      </form>
      <p className="text-center text-xs text-mut mt-4">Não tem conta? <Link href="/cadastro" className="text-acc font-bold">Criar agora — 2 dias de acesso, sem assinatura</Link></p>
    </div>
  );
}