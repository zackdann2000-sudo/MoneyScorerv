"use client";
import { useEffect, useRef, useState } from "react";
import { BrainCircuit, TriangleAlert } from "lucide-react";
import type { NivelConfianca, Veredito } from "@/lib/veredito";
import ShareCardButton from "@/components/share/ShareCardButton";

/**
 * Card de destaque do Veredito — a primeira coisa que a pessoa vê na aba
 * IA Analista. Recebe o objeto pronto de `gerarVeredito` e não calcula nada:
 * toda a conta mora em `@/lib/veredito` e é testada em `veredito.test.cjs`.
 *
 * Regra visual: borda e brilho verdes (o mesmo `--acc` do app), mercado em
 * display grande, porcentagem do lado direito e a explicação embaixo. Se a
 * porcentagem vier 0, mostramos "--": é o sinal de "sem base", nunca um
 * "0% de acerto" que passaria a impressão errada.
 */

const SELO: Record<NivelConfianca, { classe: string; rotulo: string }> = {
  Alta: { classe: "bg-acc text-black", rotulo: "ALTA" },
  Média: { classe: "bg-warn text-black", rotulo: "MÉDIA" },
  Baixa: { classe: "bg-panel2 text-mut border border-line", rotulo: "BAIXA" },
};

const COR_PCT: Record<NivelConfianca, string> = {
  Alta: "text-acc",
  Média: "text-warn",
  Baixa: "text-ink",
};

/** "Over 1.5" → "Over 1.5 Gols"? Não: o rótulo já vem curto e legível da lib. */
export default function VereditoCard({ veredito }: { veredito: Veredito }) {
  const { mercadoRecomendado, porcentagemAcerto, nivelConfianca, explicacao, dadosInsuficientes, amostra, melhorPalpite } = veredito;
  const selo = SELO[nivelConfianca] ?? SELO.Baixa;
  const semBase = porcentagemAcerto === 0;

  /* O card inteiro é o alvo do "Compartilhar": a referência fica na <section>
     para a imagem sair com a moldura verde, não recortada. */
  const cardRef = useRef<HTMLElement | null>(null);

  return (
    <section
      ref={cardRef}
      aria-label="Veredito da IA"
      className="relative overflow-hidden rounded-2xl border-2 border-acc/70 bg-panel p-4 shadow-[0_0_28px_-12px_var(--acc)]"
    >
      {/* brilho neon no canto — puro enfeite, não intercepta clique */}
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-acc/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.04] pitch" />

      <div className="relative">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-acc/50 bg-acc/15 px-2 py-1 text-[10px] font-extrabold tracking-wide text-acc">
            <BrainCircuit size={12} /> VEREDITO DA IA
          </span>
          <span className={`ml-auto rounded-md px-2 py-1 text-[10px] font-extrabold tracking-wide ${selo.classe}`}>
            {selo.rotulo}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wide text-mut">Mercado recomendado</p>
            <p className="font-display font-bold uppercase leading-none text-acc text-[34px] break-words">
              {semBase ? "Aguardando dados" : mercadoRecomendado}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-bold uppercase tracking-wide text-mut">Acerto</p>
            <p className={`font-display font-bold leading-none tabular-nums text-[38px] ${COR_PCT[nivelConfianca]}`}>
              {semBase ? "--" : `${porcentagemAcerto}%`}
            </p>
          </div>
        </div>

        {dadosInsuficientes && (
          <div className="mt-3 flex items-start gap-1.5 rounded-xl border border-warn/40 bg-warn/10 px-2.5 py-1.5">
            <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
            <p className="text-[10px] font-bold leading-snug text-warn">
              {semBase
                ? "Raio-X sem placares: nenhum veredito é publicado sem histórico."
                : `Base parcial (${amostra} jogos): veredito puxado para perto de 50%.`}
            </p>
          </div>
        )}

        <p className="mt-3 text-[11px] leading-relaxed text-ink/85">{explicacao}</p>

        {/* Melhor palpite (Veredito 2.0): o MESMO número do card, com as três
            leituras que o produziram. É aqui que o H2H aparece sem virar um
            segundo veredito paralelo. */}
        {melhorPalpite && !semBase && (
          <div className="mt-3 rounded-xl border border-line bg-panel2/60 p-2.5">
            <p className="text-[9px] font-extrabold uppercase tracking-wide text-mut">
              Melhor palpite do confronto
            </p>
            <ul className="mt-1.5 space-y-1">
              {melhorPalpite.porque.map((razao, i) => (
                <li key={i} className="flex gap-1.5 text-[10px] leading-snug text-ink/80">
                  <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-acc" />
                  <span>{razao}</span>
                </li>
              ))}
            </ul>
            {melhorPalpite.h2h && (
              <p className="mt-1.5 text-[9px] text-mut">
                H2H: {melhorPalpite.h2h.jogos} confronto{melhorPalpite.h2h.jogos === 1 ? "" : "s"}
                {melhorPalpite.h2h.mediaGols != null
                  ? ` · ${melhorPalpite.h2h.mediaGols.toFixed(2).replace(".", ",")} gols por jogo`
                  : ""}
                {" "}· peso {Math.round(melhorPalpite.h2h.fator * 100)}% no total esperado
              </p>
            )}
          </div>
        )}

        <p className="mt-2 text-[9px] text-mut">
          Base: {amostra} jogo{amostra === 1 ? "" : "s"} · últimos 10 de cada time (peso 1.5 / 1.0 / 0.5) · Poisson + taxa observada
        </p>

        {/* Rodapé: a marca viaja com a imagem (aquisição) e o botão de
            compartilhar fica fora da captura por causa do data-noshare. */}
        <div className="mt-2.5 flex items-center gap-2 border-t border-line pt-2">
          <span className="font-display text-[10px] font-extrabold uppercase tracking-wide text-acc">GreenScore</span>
          <span className="text-[9px] text-mut">Análise, não promessa</span>
          <span className="ml-auto text-[9px] font-bold text-mut">+18</span>
          <ShareCardButton
            targetRef={cardRef}
            baseName={`greenscore-veredito-${mercadoRecomendado || "jogo"}`}
            rotulo="Compartilhar"
          />
        </div>
      </div>
    </section>
  );
}

/** Esqueleto com a mesma moldura do card — evita o layout pular ao carregar. */
export function VereditoCardSkeleton() {
  return (
    <section aria-busy="true" aria-label="Carregando veredito da IA" className="rounded-2xl border-2 border-acc/30 bg-panel p-4">
      <div className="skeleton h-5 w-36 rounded-md" />
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-3">
        <div className="skeleton h-9 w-40 rounded-md" />
        <div className="skeleton h-9 w-20 rounded-md" />
      </div>
      <div className="skeleton mt-3 h-12 rounded-md" />
    </section>
  );
}

/**
 * Versão conectada: busca o veredito da partida e entrega pronto ao card.
 * Se a rota falhar, devolve `null` em silêncio — a aba IA Analista já tem o
 * resto do conteúdo, e um card de erro gigante no topo só atrapalharia.
 */
export function VereditoDoJogo({ matchId, league }: { matchId: string; league: string }) {
  /* O estado guarda a chave da partida junto com o resultado: assim trocar de
     jogo volta ao esqueleto sem precisar de setState dentro do efeito. */
  const chave = `${matchId}:${league}`;
  const [resposta, setResposta] = useState<{ chave: string; veredito: Veredito | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/matches/${matchId}/veredito?league=${league}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        setResposta({ chave, veredito: j && !j.error ? (j as Veredito) : null });
      })
      .catch(() => vivo && setResposta({ chave, veredito: null }));
    return () => {
      vivo = false;
    };
  }, [chave, matchId, league]);

  if (resposta?.chave !== chave) return <VereditoCardSkeleton />;
  if (!resposta.veredito) return null;
  return <VereditoCard veredito={resposta.veredito} />;
}
