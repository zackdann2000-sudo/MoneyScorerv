"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";

/**
 * Botão "Instalar App" (PWA).
 *
 * Só aparece quando o Chrome/Edge dispara `beforeinstallprompt`, ou seja,
 * quando o app REALMENTE é instalável (manifest válido + service worker
 * controlando a página com handler de `fetch`). Se o evento não vem, o
 * componente não renderiza nada — nunca oferecemos um botão que não funciona,
 * e no app já instalado o navegador simplesmente não dispara o evento.
 *
 * iOS/Safari não implementa o evento: lá a instalação é manual
 * (Compartilhar → "Adicionar à Tela de Início"), caso coberto pelo `InstallApp`.
 */

type PromptEvento = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

/** Já está rodando instalado (standalone) ou no iOS em modo app? */
function jaInstalado() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || iosStandalone;
}

export default function InstallPWA({ className = "" }: { className?: string }) {
  const [evento, setEvento] = useState<PromptEvento | null>(null);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    // Em app já instalado o navegador não dispara o evento: nem escutamos.
    if (jaInstalado()) return;

    // `preventDefault` evita o mini-infobar nativo do Chrome; usamos o botão.
    const aoPrompt = (e: Event) => {
      e.preventDefault();
      setEvento(e as PromptEvento);
    };
    const aoInstalar = () => setEvento(null);

    window.addEventListener("beforeinstallprompt", aoPrompt);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoPrompt);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) return;
    setInstalando(true);
    try {
      await evento.prompt();
      await evento.userChoice;
    } catch {
      /* prompt expirado ou já usado: só esconde o botão */
    } finally {
      setEvento(null);
      setInstalando(false);
    }
  }, [evento]);

  if (!evento) return null;

  return (
    <button
      type="button"
      onClick={instalar}
      disabled={instalando}
      aria-label="Instalar App"
      title="Instalar App"
      className={
        "h-10 shrink-0 rounded-xl border border-acc/50 bg-acc/10 px-2 sm:px-3 text-acc font-display font-bold text-xs flex items-center gap-1.5 hover:bg-acc/20 disabled:opacity-60 " +
        className
      }
    >
      <Download size={15} />
      <span className="hidden sm:inline">{instalando ? "INSTALANDO…" : "INSTALAR APP"}</span>
    </button>
  );
}
