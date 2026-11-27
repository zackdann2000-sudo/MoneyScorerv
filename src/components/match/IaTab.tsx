"use client";
import { useEffect, useState } from "react";
import { BrainCircuit, ShieldAlert, Info } from "lucide-react";
import { VipLock, SourceFoot } from "@/components/ui";
import { VereditoDoJogo } from "./VereditoCard";
import H2HPalpiteCard from "@/components/H2HPalpiteCard";
import PilaresAnalise from "./PilaresAnalise";
import { decomporPilares, oddDoMercado, type MercadoPilarId } from "@/lib/pilares";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Tooltip acessível do modelo: abre no clique, fecha no clique fora/Esc. */
function ModelTooltip() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fora = () => setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("click", fora);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="O que é o modelo Dixon-Coles/Poisson?"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation(); /* não deixa o listener global fechar na hora */
          setOpen((v) => !v);
        }}
        className="w-4 h-4 rounded-full border border-line bg-panel2 text-mut hover:text-acc hover:border-acc/60 flex items-center justify-center text-[9px] font-extrabold leading-none transition-colors"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-6 z-40 w-56 rounded-xl border border-line bg-panel2 px-3 py-2 text-[10px] leading-relaxed text-ink shadow-lg"
        >
          Modelo estatístico para prever gols esperados com base no histórico.
        </span>
      )}
    </span>
  );
}

export default function IaTab({ matchId, league, odds }: { matchId: string; league: string; odds: any }) {
  const [a, setA] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let on = true;
    fetch(`/api/matches/${matchId}/analysis?league=${league}`)
      .then((r) => r.json())
      .then((j) => { if (on) { setA(j); if (j.error) setErr(j.error); } })
      .catch(() => on && setErr("Falha de conexão com o modelo."));
    return () => { on = false; };
  }, [matchId, league]);

  if (!a) return <div className="space-y-2"><div className="skeleton h-8 w-64" /><div className="skeleton h-32" /><div className="skeleton h-48" /><p className="text-[10px] text-mut text-center">🧠 O modelo está processando o histórico das equipes…</p></div>;

  if (a.locked) return <VipLock label="IA Analista é VIP"><div className="h-64" /></VipLock>;

  // Fallback neutro: nunca card vermelho de erro para dados insuficientes
  if (a.status === "dados_insuficientes" || err) return (
    <div className="bg-panel border border-line rounded-2xl p-6 text-center">
      <BrainCircuit className="mx-auto text-mut mb-2" size={30} />
      <p className="font-display font-bold uppercase text-lg">Análise em processamento</p>
      <p className="text-xs text-mut mt-1 max-w-70 mx-auto">O histórico recente deste confronto ainda está sendo indexado pelo modelo. Volte mais perto do jogo — nenhuma previsão é exibida sem dados suficientes.</p>
      <button disabled className="mt-4 px-4 py-2 rounded-full bg-panel2 text-mut text-xs font-bold cursor-not-allowed">Análise em breve</button>
      <SourceFoot fonte="ESPN" extra={`Amostra: ${a.sample?.home ?? 0} + ${a.sample?.away ?? 0} jogos`} />
    </div>
  );

  const p = a.probs;
  const ev = (prob: number, odd: number | null) => odd ? +(prob * odd - 1).toFixed(3) : null;
  const evHome = ev(p.home, odds?.home), evDraw = ev(p.draw, odds?.draw), evAway = ev(p.away, odds?.away);

  /* ---- Pilares: abre a conta do λ (mesma origem de `a.lambdaHome/Away`) ----
     O mercado explicado é o mesmo do card do Veredito; a odd só entra quando a
     fonte publica o par Over/Under da MESMA linha (senão o Value fica sem base). */
  const ver: any = a.veredito ?? null;
  const mercadoPilar = (() => {
    if (!ver) return null;
    const mp = ver.melhorPalpite ?? null;
    const taxas: any[] = Array.isArray(ver.taxas) ? ver.taxas : [];
    const alvo = mp?.mercadoId ?? taxas[0]?.id ?? null;
    const taxa = (alvo && taxas.find((t) => t.id === alvo)) || taxas[0] || null;
    if (!taxa && !mp) return null;
    return {
      id: (alvo as MercadoPilarId | null) ?? null,
      rotulo: mp?.mercado ?? taxa?.mercado ?? "Mercado",
      final: mp?.porcentagem ?? taxa?.final ?? null,
      observado: taxa?.observado ?? null,
    };
  })();
  const pilares = decomporPilares({
    modelType: a.model_type,
    leagueAvg: a.sample?.leagueAvg ?? null,
    rates: a.rates ?? null,
    h2h: a.h2hAjuste ?? null,
    mercado: mercadoPilar,
    odd: oddDoMercado(mercadoPilar?.id ?? null, odds),
    temJogador: false,
  });

  return (
    <div className="space-y-3">
      {/* Veredito em destaque: um mercado, um número, uma explicação. */}
      <VereditoDoJogo matchId={matchId} league={league} />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="px-2 py-1 rounded-lg bg-purple/15 border border-purple/40 text-purple text-[10px] font-extrabold flex items-center gap-1"><BrainCircuit size={11} /> {a.model_type === "fallback_simples" ? "MODELO SIMPLIFICADO" : "IA · DIXON-COLES/POISSON"}</span>
        <span className={`px-2 py-1 rounded-lg text-[10px] font-extrabold ${a.confidence === "alta" ? "bg-acc/15 text-acc" : a.confidence === "média" ? "bg-warn/15 text-warn" : "bg-danger/15 text-danger"}`}>Confiabilidade {a.confidence}</span>
        <span className="text-[9px] text-mut ml-auto">{a.model_type}</span>
      </div>

      {/* Nota do modelo: deixa explícito que a base é a forma recente ponderada. */}
      <p className="text-[9px] text-acc/90 -mt-1 flex items-center gap-1">
        <Info size={9} className="shrink-0" /> Modelo ajustado com peso para a forma recente (últimos 10 jogos)
      </p>

      {/* Base do número: o modelo não usa a temporada inteira, e sim a forma
          recente ponderada (1.5 / 1.0 / 0.5) cruzada com o H2H. */}
      <p className="text-[9px] text-mut -mt-1">
        Base: últimos {a.sample?.home ?? 0} × {a.sample?.away ?? 0} jogos, com peso maior nos 3 mais
        recentes (1.5 / 1.0 / 0.5).
      </p>

      {a.h2hAjuste?.aplicado && (
        <div className="rounded-xl border border-purple/40 bg-purple/10 px-2.5 py-1.5">
          <p className="text-[10px] font-bold text-purple flex items-center gap-1">
            <BrainCircuit size={10} /> Confronto direto ajustou o modelo
          </p>
          <p className="text-[9px] text-mut leading-snug mt-0.5">{a.h2hAjuste.texto}</p>
        </div>
      )}

      {/* Palpite Fixo do H2H: só aparece quando há histórico suficiente; o
          card devolve null sozinho abaixo da amostra mínima. */}
      {Array.isArray(a.h2h) && a.h2h.length > 0 && (
        <H2HPalpiteCard
          /* Confronto sem placar publicado fica FORA: converter ausência em 0-0
             criaria um jogo que nunca aconteceu na amostra do palpite. */
          jogos={a.h2h
            .filter((g: any) => g?.homeScore != null && g?.awayScore != null)
            .map((g: any) => ({ golsCasa: Number(g.homeScore), golsFora: Number(g.awayScore) }))}
        />
      )}

      {/* Pilares decompostos: por que o modelo chegou neste número. Fica logo
          depois do ajuste de H2H, antes dos mercados. */}
      <PilaresAnalise decomp={pilares} />

      {/* 1X2 */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        <p className="text-[10px] font-bold text-mut uppercase mb-2">Resultado mais provável (1X2)</p>
        <div className="flex h-8 rounded-lg overflow-hidden font-display font-bold text-sm">
          <div className="bg-home flex items-center justify-center text-black/90" style={{ width: `${p.home * 100}%` }}>{pct(p.home)}</div>
          <div className="bg-line flex items-center justify-center" style={{ width: `${p.draw * 100}%` }}>{pct(p.draw)}</div>
          <div className="bg-away flex items-center justify-center text-black/90" style={{ width: `${p.away * 100}%` }}>{pct(p.away)}</div>
        </div>
        <div className="flex justify-between text-[10px] text-mut mt-1"><span>Casa</span><span>Empate</span><span>Fora</span></div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="bg-panel2 rounded-xl p-2 text-center">
            <p className="text-[9px] text-mut uppercase">xG esperado Casa</p>
            <p className="font-display font-bold text-2xl text-home">{a.lambdaHome}</p>
          </div>
          <div className="bg-panel2 rounded-xl p-2 text-center">
            <p className="text-[9px] text-mut uppercase">xG esperado Fora</p>
            <p className="font-display font-bold text-2xl text-away">{a.lambdaAway}</p>
          </div>
        </div>
      </div>

      {/* Will they score + mercados */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        <p className="text-[10px] font-bold text-mut uppercase mb-2">Will they score? · Probabilidade de marcar</p>
        <div className="grid grid-cols-2 gap-2 text-center">
          <div><p className="font-display font-bold text-xl text-home">{pct(p.homeScore)}</p><p className="text-[9px] text-mut">Casa marca</p></div>
          <div><p className="font-display font-bold text-xl text-away">{pct(p.awayScore)}</p><p className="text-[9px] text-mut">Fora marca</p></div>
          <div><p className="font-display font-bold text-xl">{pct(p.cleanSheetHome)}</p><p className="text-[9px] text-mut">Clean sheet Casa</p></div>
          <div><p className="font-display font-bold text-xl">{pct(p.cleanSheetAway)}</p><p className="text-[9px] text-mut">Clean sheet Fora</p></div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          {[["+0.5 gols", p.over05], ["+1.5 gols", p.over15], ["+2.5 gols", p.over25], ["−2.5 gols", p.under25], ["Ambas marcam", p.btts], ["Top placar", null]].map(([l, v], i) => (
            <div key={i} className="bg-panel2 rounded-lg p-2 text-center">
              <p className="font-display font-bold text-base text-acc">{v != null ? pct(v as number) : a.topScores?.[0]?.score}</p>
              <p className="text-[8px] text-mut uppercase">{l as string}{i === 5 && a.topScores?.[0] ? ` (${a.topScores[0].p}%)` : ""}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {(a.topScores || []).slice(0, 6).map((s: any) => <span key={s.score} className="text-[10px] bg-panel2 border border-line rounded px-1.5 py-0.5 font-bold">{s.score} <span className="text-mut">{s.p}%</span></span>)}
        </div>
      </div>

      {/* Valor vs odds reais */}
      {odds?.home && (
        <div className="bg-panel border border-line rounded-2xl p-4">
          <p className="text-[10px] font-bold text-mut uppercase mb-2">Análise de valor vs odds ({odds.provider})</p>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            {[["Casa", odds.home, evHome, p.home], ["Empate", odds.draw, evDraw, p.draw], ["Fora", odds.away, evAway, p.away]].map(([l, o, e, pr]: any, i) => (
              <div key={i} className={`rounded-xl p-2 border ${e != null && e > 0.05 ? "border-acc/50 bg-acc/10" : "border-line bg-panel2"}`}>
                <p className="text-mut text-[9px] uppercase">{l} @{o ?? "—"}</p>
                <p className="font-bold">justa {pr ? (1 / pr).toFixed(2) : "—"}</p>
                <p className={`font-extrabold ${e != null && e > 0 ? "text-acc" : "text-danger"}`}>{e != null ? `EV ${(e * 100).toFixed(1)}%` : "sem odd"}</p>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-mut mt-2 flex gap-1"><Info size={10} className="shrink-0 mt-0.5" /> EV = probabilidade × odd − 1. Valor positivo não é garantia de acerto.</p>
        </div>
      )}

      {/* Narrativa estruturada */}
      <div className="bg-panel border border-line rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-bold text-mut uppercase">Relatório inteligente</p>
          <span className="text-[9px] text-mut/50">·</span>
          <span className="text-[9px] font-bold text-mut">Dixon-Coles/Poisson</span>
          <ModelTooltip />
        </div>
        <div><p className="text-[11px] font-extrabold text-acc uppercase mb-0.5">Resumo do confronto</p><p className="text-[12px] leading-relaxed text-ink/90">{a.narrative.resumo}</p></div>
        <div><p className="text-[11px] font-extrabold text-home uppercase mb-0.5">Pontos fortes · Mandante</p><p className="text-[12px] leading-relaxed text-ink/90">{a.narrative.mandante}</p></div>
        <div><p className="text-[11px] font-extrabold text-away uppercase mb-0.5">Pontos fortes · Visitante</p><p className="text-[12px] leading-relaxed text-ink/90">{a.narrative.visitante}</p></div>
        {a.narrative.mercados?.length > 0 && (
          <div><p className="text-[11px] font-extrabold text-warn uppercase mb-0.5">Mercados em destaque</p>
            <ul className="text-[12px] leading-relaxed text-ink/90 list-disc pl-4">{a.narrative.mercados.map((m: string, i: number) => <li key={i}>{m}</li>)}</ul>
          </div>
        )}
        <div><p className="text-[11px] font-extrabold text-purple uppercase mb-0.5">Cenários possíveis</p>
          <ul className="text-[12px] leading-relaxed text-ink/90 list-disc pl-4">{a.narrative.cenarios.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
        </div>
        <div><p className="text-[11px] font-extrabold uppercase mb-0.5">Conclusão</p><p className="text-[12px] leading-relaxed">{a.narrative.conclusao}</p></div>
        {a.narrative.alerta && (
          <div className="flex gap-2 bg-warn/10 border border-warn/30 rounded-xl p-2.5">
            <ShieldAlert size={14} className="text-warn shrink-0 mt-0.5" />
            <p className="text-[11px] text-warn">{a.narrative.alerta}</p>
          </div>
        )}
      </div>

      <SourceFoot fonte="ESPN (histórico) + modelo próprio" amostra={a.sample.home + a.sample.away} extra={`Atualizado ${new Date(a.updatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · previsão salva no Track Record`} />
    </div>
  );
}