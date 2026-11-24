"use client";

import Link from "next/link";
import { LogIn, Sparkles } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { MODELO_ATUAL } from "@/lib/vendas";

/**
 * CTA usado onde antes havia "assinar" / "ver planos".
 *
 * Com a venda pausada, o único caminho de conversão é o cadastro (que dá 24h
 * completas). Quem já tem conta e está fora do trial recebe a verdade em vez de
 * um botão que não leva a lugar nenhum: a análise grátis do dia já foi usada e
 * o contador zera à meia-noite.
 */
export default function CtaTrial({
  titulo = "Teste 24h grátis",
  compacto = false,
}: {
  titulo?: string;
  compacto?: boolean;
}) {
  const { user } = useApp();
  if (!user) {
    return (
      <div
        className={`rounded-2xl border border-acc/40 bg-gradient-to-br from-acc/10 via-panel to-panel ${
          compacto ? "px-3 py-2.5" : "p-4"
        }`}
      >
        <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-ink">
          <Sparkles size={13} className="text-acc" /> {titulo}
        </p>
        <p className="mt-1 text-[11px] leading-snug text-mut">{MODELO_ATUAL}</p>
        <Link
          href="/cadastro"
          className="mt-2 inline-flex h-9 items-center justify-center rounded-xl bg-acc px-3 text-[11px] font-extrabold text-black"
        >
          Criar conta grátis
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border border-line bg-panel ${
        compacto ? "px-3 py-2.5" : "p-4"
      }`}
    >
      <p className="text-[12px] font-extrabold text-ink">Sua análise grátis do dia já foi usada</p>
      <p className="mt-1 text-[11px] leading-snug text-mut">
        O contador zera à meia-noite (horário de Brasília). Placares, ligas e estatísticas de
        partida continuam abertos o dia inteiro.
      </p>
      <Link
        href="/login?next=/jogos"
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-acc underline"
      >
        <LogIn size={12} /> Entrar com outra conta
      </Link>
    </div>
  );
}
