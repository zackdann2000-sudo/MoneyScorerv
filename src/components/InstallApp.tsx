"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Botão "Instalar app" (PWA).
 *
 * O Chrome/Android dispara `beforeinstallprompt` só quando o app é instalável
 * (manifest válido + service worker ativo). Sem esse evento o componente não
 * renderiza nada — nada de banner pedindo instalação em navegador que não
 * suporta ou quando já está instalado.
 *
 * iOS não tem o evento: lá o usuário instala por Compartilhar → "Adicionar à
 * Tela de Início", então mostramos a instrução escrita uma única vez.
 */

type PromptEvento = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const CHAVE_DISPENSA = "gs_pwa_install_dispensado";

function estaInstalado() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  // iOS Safari expõe navigator.standalone em vez de display-mode
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

export default function InstallApp() {
  const [evento, setEvento] = useState<PromptEvento | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [ios, setIos] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (estaInstalado()) return;
    try {
      if (localStorage.getItem(CHAVE_DISPENSA) === "1") return;
    } catch {
      /* modo privado sem storage: segue mostrando */
    }

    const ua = window.navigator.userAgent;
    const ehIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const ehSafari = ehIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

    const aoPrompt = (e: Event) => {
      e.preventDefault(); // impede o mini-infobar do Chrome; usamos botão próprio
      setEvento(e as PromptEvento);
      setVisivel(true);
    };
    const aoInstalar = () => {
      setVisivel(false);
      setEvento(null);
    };

    window.addEventListener("beforeinstallprompt", aoPrompt);
    window.addEventListener("appinstalled", aoInstalar);

    // iOS puro: não existe evento, mostramos a dica depois de 3s de uso
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (ehSafari) {
      timer = setTimeout(() => {
        setIos(true);
        setVisivel(true);
      }, 3000);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", aoPrompt);
      window.removeEventListener("appinstalled", aoInstalar);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const instalar = useCallback(async () => {
    if (!evento) return;
    setInstalando(true);
    try {
      await evento.prompt();
      const escolha = await evento.userChoice;
      if (escolha.outcome === "accepted") setVisivel(false);
      setEvento(null);
      setVisivel(false);
    } catch {
      setVisivel(false);
    } finally {
      setInstalando(false);
    }
  }, [evento]);

  const dispensar = useCallback(() => {
    setVisivel(false);
    try {
      localStorage.setItem(CHAVE_DISPENSA, "1");
    } catch {
      /* sem storage, apenas esconde nesta sessão */
    }
  }, []);

  if (!visivel) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-[75] px-3">
      <div className="mx-auto max-w-3xl rounded-xl border border-acc/40 bg-panel/95 p-2.5 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 shrink-0 text-acc" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold leading-tight text-txt">Instalar o Money Sênior</p>
            <p className="text-[9px] leading-snug text-mut">
              {ios
                ? "Toque em Compartilhar e depois em “Adicionar à Tela de Início”."
                : "Abre em tela cheia, sem barra do navegador."}
            </p>
          </div>
          {!ios && (
            <button
              onClick={instalar}
              disabled={instalando}
              className="shrink-0 rounded-full bg-acc px-3 py-1 text-[10px] font-extrabold text-black disabled:opacity-60"
            >
              {instalando ? "..." : "INSTALAR"}
            </button>
          )}
          <button
            onClick={dispensar}
            aria-label="Dispensar"
            className="shrink-0 rounded-full p-1 text-mut hover:text-txt"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
