"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Share2, TriangleAlert } from "lucide-react";
import {
  ATRIBUTO_SEM_IMAGEM,
  capturarCard,
  compartilharOuBaixar,
  nomeArquivo,
} from "@/lib/shareImage";

/**
 * Botão "Compartilhar" de um card: captura o nó apontado por `targetRef` e
 * entrega como PNG (Web Share no celular, download no desktop).
 *
 * Regras que este componente garante:
 *  • **Nunca captura a si mesmo**: o próprio botão tem `data-noshare`, e o
 *    `onclone` de `capturarCard` remove tudo que carrega esse atributo.
 *  • **Não captura se o card não existe**: `targetRef.current` nulo vira erro
 *    visível, não imagem em branco.
 *  • **Cancelar não é erro**: `AbortError` da folha nativa volta para `idle` em
 *    silêncio (o usuário desistiu, não falhou).
 *  • **Feedback com prazo**: o "pronto" some sozinho em 2,4s e o timeout é
 *    limpo no unmount (nada de setState em componente desmontado).
 */
export default function ShareCardButton({
  targetRef,
  baseName,
  rotulo = "Compartilhar",
  className = "",
}: {
  targetRef: React.RefObject<HTMLElement | null>;
  /** Base do nome do arquivo (vira slug ASCII). */
  baseName: string;
  rotulo?: string;
  className?: string;
}) {
  const [estado, setEstado] = useState<"idle" | "gerando" | "ok" | "erro">("idle");
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const agendarVolta = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setEstado("idle");
      setMsg("");
    }, 2400);
  };

  const aoClicar = async () => {
    if (estado === "gerando") return;
    const alvo = targetRef.current;
    if (!alvo) {
      setEstado("erro");
      setMsg("Card não encontrado na tela.");
      agendarVolta();
      return;
    }

    setEstado("gerando");
    setMsg("");
    try {
      const blob = await capturarCard(alvo);
      const resultado = await compartilharOuBaixar(blob, nomeArquivo(baseName));
      setEstado("ok");
      setMsg(
        resultado === "compartilhado" ? "Enviado" : resultado === "copiado" ? "Copiado" : "Imagem salva",
      );
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setEstado("idle");
        setMsg("");
        return;
      }
      setEstado("erro");
      setMsg((e as Error)?.message || "Não foi possível gerar a imagem.");
    }
    agendarVolta();
  };

  const Icone = estado === "gerando" ? Loader2 : estado === "ok" ? Check : estado === "erro" ? TriangleAlert : Share2;
  const cor =
    estado === "erro" ? "border-danger/50 text-danger" : estado === "ok" ? "border-acc/60 text-acc" : "border-line text-mut";

  return (
    <div className={`flex items-center gap-1.5 ${className}`} {...{ [ATRIBUTO_SEM_IMAGEM]: "" }}>
      <button
        type="button"
        onClick={aoClicar}
        disabled={estado === "gerando"}
        aria-label={rotulo}
        className={`inline-flex items-center gap-1 rounded-lg border bg-panel2 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-60 ${cor}`}
      >
        <Icone size={11} className={estado === "gerando" ? "animate-spin" : ""} />
        {estado === "gerando" ? "Gerando" : rotulo}
      </button>
      <span role="status" aria-live="polite" className="text-[9px] text-mut leading-none">
        {msg}
      </span>
    </div>
  );
}
