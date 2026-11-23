"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";
import { lerOuCriarDeviceId } from "@/lib/deviceId";

export default function Cadastro() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { refreshUser, addToast, deviceId } = useApp();
  const router = useRouter();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, pass, deviceId: deviceId || lerOuCriarDeviceId() }) });
      const j = await r.json();
      if (j.error) { setErr(j.error); setLoading(false); return; }
      await refreshUser();
      if (j.bonus) addToast({ title: "🎁 Bônus ativado!", body: j.bonus });
      router.push("/");
    } catch { setErr("Falha de conexão."); setLoading(false); }
  };

  return (
    <div className="max-w-sm mx-auto pt-8">
      <div className="text-center mb-5">
        <img src="/icon.png" alt="GreenScore" className="w-16 h-16 rounded-2xl mx-auto mb-2" />
        <h1 className="font-display font-bold text-3xl uppercase">Criar conta</h1>
        <p className="text-xs text-mut">Grátis todo dia: 1 análise. O contador zera à meia-noite.</p>
      </div>
      <div className="flex items-center gap-2 rounded-xl p-3 mb-3 border bg-panel border-line">
        <p className="text-[12px] font-semibold text-ink">Todo dia você tem 1 análise grátis para ver oportunidades, dicas e estratégias. Amanhã o contador zera. Placares e estatísticas continuam abertos sempre.</p>
      </div>
      <form onSubmit={submit} className="bg-panel border border-line rounded-2xl p-4 space-y-3">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className="w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-sm" />
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail" className="w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-sm text-ink" />
        <input type="password" required minLength={6} value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Senha (mín. 6 caracteres)" className="w-full bg-panel2 border border-line rounded-xl px-3 py-3 text-sm" />
        {err && <p className="text-xs text-danger bg-danger/10 rounded-lg p-2">{err}</p>}
        <button disabled={loading} className="w-full py-3 rounded-xl bg-acc text-black font-extrabold text-sm disabled:opacity-60">{loading ? "CRIANDO…" : "CRIAR CONTA ⚡"}</button>
        <p className="text-[11px] font-semibold text-acc text-center leading-snug">
          Crie sua conta e veja 1 análise por dia, grátis — sem cartão
        </p>
        <p className="text-[9px] text-mut text-center">Quer mais que 1 por dia? Os planos liberam 6, 20 ou ilimitado, no cartão, cancele quando quiser. Estatísticas básicas continuam gratuitas.</p>
      </form>
      <p className="text-center text-xs text-mut mt-4">Já tem conta? <Link href="/login" className="text-acc font-bold">Entrar</Link></p>
    </div>
  );
}