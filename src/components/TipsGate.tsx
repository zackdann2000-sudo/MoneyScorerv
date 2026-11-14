"use client";
import Link from "next/link";
import { useApp } from "@/context/AppContext";

export function useTipsAccess() {
  const { user } = useApp();
  if (user?.isAdmin || user?.email === "admin@greenscore.app" || user?.access.active) return { ok: true as const };
  if (!user) return { ok: false as const, reason: "login" as const };
  return { ok: false as const, reason: "expired" as const, days: user.access.daysLeft };
}

export default function TipsGate({ children }: { children: React.ReactNode }) {
  const access = useTipsAccess();
  if (access.ok) return children;
  return (
    <div className="rounded-lg border border-line bg-panel p-5 text-center">
      <p className="font-display font-bold text-xl uppercase">Oportunidades bloqueadas</p>
      {access.reason === "login" ? (
        <p className="text-sm text-mut mt-2">Crie uma conta com e-mail e use 2 dias de acesso às melhores oportunidades, dicas e estratégias. Não há assinatura.</p>
      ) : (
        <>
          <p className="text-sm text-mut mt-2">Seus 2 dias terminaram. Placares, ligas e estatísticas continuam abertos. O palpite fica com o selo Top Pick até o administrador liberar o VIP.</p>
          <Link href="/config#planos" className="inline-flex items-center h-11 px-4 mt-3 rounded-full bg-live text-white text-sm font-bold">Ver acesso VIP</Link>
        </>
      )}
      {access.reason === "login" && (
        <div className="flex justify-center gap-2 mt-4">
          <Link href="/login" className="h-11 px-4 rounded-full border border-line text-sm font-bold inline-flex items-center">Entrar</Link>
          <Link href="/cadastro" className="h-11 px-4 rounded-full bg-live text-white text-sm font-bold inline-flex items-center">Criar conta</Link>
        </div>
      )}
    </div>
  );
}