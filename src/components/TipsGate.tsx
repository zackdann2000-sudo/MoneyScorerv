"use client";
import { useApp } from "@/context/AppContext";
import PaywallCard from "@/components/PaywallCard";

/**
 * Guarda de abas pagas do jogo. Mantido como wrapper para os chamadores
 * existentes (`<TipsGate>...</TipsGate>`), mas o visual agora vem do
 * `PaywallCard` — antes havia aqui um texto próprio falando de PIX e de
 * "administrador" que contradizia o Stripe.
 */
export function useTipsAccess() {
  const { user, vip } = useApp();
  if (vip) return { ok: true as const };
  if (!user) return { ok: false as const, reason: "login" as const };
  return { ok: false as const, reason: "expired" as const, days: user.access.daysLeft };
}

export default function TipsGate({ children }: { children: React.ReactNode }) {
  const access = useTipsAccess();
  if (access.ok) return children;
  return <PaywallCard reason={access.reason} />;
}
