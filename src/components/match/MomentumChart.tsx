"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Flame } from "lucide-react";
import type { WinProbPayload } from "@/lib/winProb";

type Pressao = {
  casa: number;
  fora: number;
  total: number;
  pctCasa: number | null;
  pctFora: number | null;
  dominante: "home" | "away" | null;
  golsCasa: number;
  golsFora: number;
  chutesCasa: number;
  chutesFora: number;
  escanteiosCasa: number;
  escanteiosFora: number;
  cartoesCasa: number;
  cartoesFora: number;
  janela: number;
  lances: number;
};

type Sinal = { nivel: "fire" | "ball" | null; lado: "home" | "away" | null; pct: number | null; rotulo: string };

type Resposta = {
  ok?: boolean;
  vazio?: boolean;
  minuto?: number;
  pressao?: Pressao | null;
  sinal?: Sinal;
  serie?: { min: number; casa: number; fora: number }[];
  /** Probabilidade 1X2 ao vivo, calculada na mesma resposta. */
  prob?: WinProbPayload | null;
  error?: string;
};

const POLL_MS = 30000;

/**
 * Selo de pressão (FIRE/BALL) do topo da aba LIVE.
 * FIRE > 80% · BALL 60–80% — sobre a janela de 10 minutos.
 */
export function PressureBadge({ sinal, nomeCasa, nomeFora }: { sinal?: Sinal | null; nomeCasa: string; nomeFora: string }) {
  if (!sinal?.nivel) return null;
  const quem = sinal.lado === "home" ? nomeCasa : nomeFora;
  const fire = sinal.nivel === "fire";
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
        fire
          ? "border-danger/60 bg-danger/15 text-danger animate-pulse"
          : "border-warn/60 bg-warn/15 text-warn"
      }`}
      title={`${quem} com ${sinal.pct}% da pressão nos últimos 10 minutos`}
    >
      {fire ? <Flame className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
      {fire ? "FIRE 🔥" : "BALL ⚽"}
      <span className="text-[9px] font-bold normal-case tracking-normal opacity-90">
        {quem} · {sinal.pct}%
      </span>
    </div>
  );
}

/**
 * Gráfico de Momentum (pressão ao vivo).
 *
 * Fonte: lances reais da ESPN (finalizações, escanteios, gols, cartões) dos
 * últimos 15 minutos, com decaimento de recência. Sem lance na janela → o bloco
 * diz isso, em vez de desenhar uma onda fictícia.
 */
export function MomentumChart({
  matchId,
  league,
  home,
  away,
  onSinal,
  onWinProb,
}: {
  matchId: string;
  league: string;
  home: string;
  away: string;
  /** Avisa a aba qual é o selo atual, para ele ficar no topo do jogo. */
  onSinal?: (s: Sinal | null) => void;
  /** Entrega a probabilidade 1X2 para o gráfico, sem uma segunda requisição. */
  onWinProb?: (p: WinProbPayload | null) => void;
}) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState(false);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    const carregar = () =>
      fetch(`/api/matches/${matchId}/momentum?league=${encodeURIComponent(league)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!vivo.current) return;
          if (j?.error) { setErro(true); onWinProb?.(null); return; }
          setErro(false);
          setDados(j as Resposta);
          onSinal?.(j?.sinal ?? null);
          onWinProb?.(j?.prob ?? null);
        })
        .catch(() => vivo.current && setErro(true));
    carregar();
    const t = setInterval(carregar, POLL_MS);
    return () => {
      vivo.current = false;
      clearInterval(t);
    };
  }, [matchId, league, onSinal, onWinProb]);

  const serie = dados?.serie || [];
  const p = dados?.pressao || null;

  /* Caminho SVG do gráfico de linha: uma linha por time, escala pelo maior pico. */
  const caminhos = useMemo(() => {
    if (!serie.length) return null;
    const max = Math.max(1, ...serie.map((s) => Math.max(s.casa, s.fora)));
    const L = 100, A = 34;
    const px = (i: number) => (serie.length === 1 ? L / 2 : (i / (serie.length - 1)) * L);
    const py = (v: number) => A - (v / max) * (A - 3);
    const linha = (chave: "casa" | "fora") =>
      serie.map((s, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(2)},${py(s[chave]).toFixed(2)}`).join(" ");
    return { casa: linha("casa"), fora: linha("fora"), max };
  }, [serie]);

  if (erro) {
    return <p className="text-[11px] text-mut">Momentum indisponível agora (a fonte não respondeu).</p>;
  }

  if (!dados) {
    return (
      <div className="space-y-1.5">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton h-16" />
      </div>
    );
  }

  if (dados.vazio || !p) {
    return (
      <p className="text-[11px] leading-snug text-mut">
        Sem lances recentes na fonte para calcular pressão. Assim que sair finalização, escanteio ou gol, a barra
        aparece.
      </p>
    );
  }

  const pctCasa = p.pctCasa ?? 50;
  const pctFora = p.pctFora ?? 50;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-mut">
          Momentum · últimos {p.janela} min {dados.minuto ? `· ${dados.minuto}'` : ""}
        </p>
        <span className="text-[9px] font-bold text-mut">{p.lances} lances</span>
      </div>

      {/* barra de pressão */}
      <div className="flex h-6 overflow-hidden rounded-lg border border-line font-display text-[10px] font-black">
        <div
          className="flex items-center justify-start bg-good/25 pl-1.5 text-good transition-all"
          style={{ width: `${pctCasa}%` }}
        >
          {pctCasa >= 18 ? `${pctCasa}%` : ""}
        </div>
        <div
          className="flex items-center justify-end bg-away/25 pr-1.5 text-away transition-all"
          style={{ width: `${pctFora}%` }}
        >
          {pctFora >= 18 ? `${pctFora}%` : ""}
        </div>
      </div>
      <div className="flex justify-between text-[9px] font-bold text-mut">
        <span className="truncate">{home}</span>
        <span className="truncate text-right">{away}</span>
      </div>

      {/* série dos 15 minutos */}
      {caminhos && (
        <div className="rounded-xl border border-line bg-panel2 p-2">
          <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="h-16 w-full">
            <line x1="0" y1="30" x2="100" y2="30" stroke="currentColor" className="text-line" strokeWidth="0.4" />
            <path d={caminhos.casa} fill="none" stroke="#22e06b" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={caminhos.fora} fill="none" stroke="#ff5d73" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <div className="mt-0.5 flex justify-between text-[8px] font-bold text-mut">
            <span>{serie[0]?.min}'</span>
            <span>{serie[serie.length - 1]?.min}'</span>
          </div>
        </div>
      )}

      {/* de onde vem a barra */}
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] font-bold text-mut">
        <span>Chutes {p.chutesCasa} · Esc {p.escanteiosCasa} · Gol {p.golsCasa}</span>
        <span className="text-right">Chutes {p.chutesFora} · Esc {p.escanteiosFora} · Gol {p.golsFora}</span>
      </div>
      <p className="text-[9px] leading-snug text-mut/80">
        Peso por lance: gol 4, chute no gol 1,6, escanteio 0,9, chute bloqueado 0,9, para fora 0,6. Mais recente pesa mais.
      </p>
    </div>
  );
}

export default MomentumChart;
