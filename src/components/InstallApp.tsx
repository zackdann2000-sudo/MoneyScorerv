"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Convite de instalação do PWA — ÚNICO componente de instalação do app.
 *
 * Antes existiam dois (`InstallApp` e `shared/InstallPWA`) escutando o mesmo
 * evento, com lógicas diferentes: só este tratava iOS (onde não existe
 * `beforeinstallprompt`) e só este lembrava a dispensa do usuário. O outro era
 * um botão compacto de header sem nenhuma dessas regras. Agora há um estado só e
 * a diferença de layout é um PROP (`variante`), não um segundo componente:
 *
 *   variante="banner" (padrão) → faixa no rodapé, com instrução escrita no iOS;
 *   variante="botao"           → botão compacto do header (Android/desktop).
 *
 * Regras que valem para as duas variantes:
 *  • **Nunca oferecer instalação que não funciona**: no Android/desktop só
 *    aparecemos quando o navegador dispara `beforeinstallprompt` (manifest
 *    válido + service worker controlando a página); no iOS, onde o evento não
 *    existe, a faixa mostra o caminho manual (Compartilhar → Adicionar à Tela de
 *    Início) depois de alguns segundos de uso.
 *  • **App já instalado**: `display-mode: standalone` (ou `navigator.standalone`
 *    no iOS) desliga tudo — nada de convidar quem já instalou.
 *  • **Dispensa lembrada**: o X grava em localStorage; o convite não volta.
 *  • **O prompt é de uso único**: `beforeinstallprompt` só pode ser chamado uma
 *    vez por carregamento. As duas variantes compartilham a flag de módulo
 *    `promptConsumido`, então clicar em uma esconde a outra em vez de tentar
 *    reusar um evento já gasto.
 */

type PromptEvento = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

type Variante = "banner" | "botao";

const CHAVE_DISPENSA = "gs_pwa_install_dispensado";

/**
 * `true` depois que alguma variante chamou `prompt()`.
 *
 * Vive no módulo (não no componente) porque as duas instâncias do Shell são
 * componentes separados: sem isto, a segunda tentaria reusar o mesmo evento e o
 * navegador rejeitaria (o `catch` esconde, mas o usuário clicaria num botão que
 * "não faz nada").
 */
let promptConsumido = false;

function estaInstalado() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
  // iOS Safari expõe navigator.standalone em vez de display-mode
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(standalone || iosStandalone);
}

export default function InstallApp({ variante = "banner", className = "" }: { variante?: Variante; className?: string }) {
  const [evento, setEvento] = useState<PromptEvento | null>(null);
  const [visivel, setVisivel] = useState(false);
  const [ios, setIos] = useState(false);
  const [instalando, setInstalando] = useState(false);

  useEffect(() => {
    if (estaInstalado()) return;
    try {
      // Dispensa lembrada vale para as DUAS variantes: sai antes de registrar o
      // listener, então nem a faixa nem o botão do header voltam.
      if (localStorage.getItem(CHAVE_DISPENSA) === "1") return;
    } catch {
      /* modo privado sem storage: segue mostrando */
    }

    const ua = window.navigator.userAgent;
    const ehIOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    const ehSafari = ehIOS && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);

    const aoPrompt = (e: Event) => {
      if (promptConsumido) return;
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
    if (!evento || promptConsumido) return;
    setInstalando(true);
    try {
      promptConsumido = true;
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
    /* Zera o evento também: é o que apaga o botão do header na mesma sessão
       (ele só renderiza com `evento`). Sem isto, o X escondia a faixa e deixava
       o botão — a dispensa parecia não ter funcionado. */
    setEvento(null);
    try {
      localStorage.setItem(CHAVE_DISPENSA, "1");
    } catch {
      /* sem storage, apenas esconde nesta sessão */
    }
  }, []);

  /* Botão do header: iOS não tem prompt programático, então lá ele não aparece
     (a faixa inferior é que explica o caminho manual). */
  if (variante === "botao") {
    if (!evento || ios || promptConsumido) return null;
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

  if (!visivel) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-[75] px-3">
      <div className="mx-auto max-w-3xl rounded-xl border border-acc/40 bg-panel/95 p-2.5 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 shrink-0 text-acc" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-extrabold leading-tight text-txt">Instalar o GreenScore</p>
            <p className="text-[9px] leading-snug text-mut">
              {ios
                ? "Toque em Compartilhar e depois em “Adicionar à Tela de Início”."
                : "Abre em tela cheia, sem barra do navegador."}
            </p>
          </div>
          {!ios && !promptConsumido && (
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
