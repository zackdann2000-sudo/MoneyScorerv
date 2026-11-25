"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/context/AppContext";

/* DORMENTE (modo gratuito): ver src/lib/vendas.ts. Só age no retorno de um
   checkout que hoje não acontece (?assinou nunca é gerado). */
/**
 * Ponte de retorno do Stripe.
 *
 * O `success_url` do checkout aponta para a MESMA página onde o usuário bateu no
 * paywall, com `?assinou=1`. Este componente:
 *  1. chama `refreshUser()` para o VIP aparecer sem reload manual (antes o
 *     AppContext só lia `/api/auth/me` no mount);
 *  2. avisa por toast (sucesso ou cancelamento);
 *  3. remove o parâmetro da URL para o aviso não se repetir ao voltar/atualizar.
 *
 * Lê a query de `window.location` em vez de `useSearchParams()` de propósito:
 * este componente vive no Shell, que aparece em páginas estáticas, e
 * `useSearchParams` exigiria Suspense em todas elas.
 */
export default function StripeReturn() {
  const { refreshUser, addToast } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const sp = new URLSearchParams(window.location.search);
    const assinou = sp.get("assinou");
    const cancelada = sp.get("assinatura");
    if (!assinou && !cancelada) return;

    let vivo = true;

    (async () => {
      if (assinou) {
        await refreshUser();
        if (vivo) {
          addToast({
            title: "VIP ativo ✅",
            body: "Pagamento confirmado. Seu acesso já está liberado.",
          });
        }
      } else if (vivo) {
        addToast({
          title: "Checkout cancelado",
          body: "Nada foi cobrado. Você pode assinar quando quiser.",
        });
      }

      // Limpa só os parâmetros que controlam o aviso.
      sp.delete("assinou");
      sp.delete("assinatura");
      const resto = sp.toString();
      const limpa = `${window.location.pathname}${resto ? `?${resto}` : ""}${window.location.hash}`;
      if (vivo) router.replace(limpa, { scroll: false });
    })();

    return () => {
      vivo = false;
    };
  }, [refreshUser, addToast, router]);

  return null;
}
