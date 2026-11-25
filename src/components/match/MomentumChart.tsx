"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Flame } from "lucide-react";
import type { WinProbPayload } from "@/lib/winProb";
import type { NivelAppm } from "@/lib/momentum";

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

type CelulaAppm = {
  janela: number;
  minutos: number;
  casa: number;
  fora: number;
  ataquesCasa: number;
  ataquesFora: number;
  nivelCasa: NivelAppm;
  nivelFora: NivelAppm;
};

type AppmPayload = { minuto: number; ataques: number; janelas: CelulaAppm[] };

type Resposta = {
  ok?: boolean;
  vazio?: boolean;
  minuto?: number;
  pressao?: Pressao | null;
  sinal?: Sinal;
  serie?: { min: number; casa: number; fora: number }[];
  /** APPM: ataques perigosos por minuto (1, 3, 5, 10 e jogo todo). */
  appm?: AppmPayload | null;
  /** Probabilidade 1X2 ao vivo, calculada na mesma resposta. */
  prob?: WinProbPayload | null;
  error?: string;
};

/*
 * Ritmo de atualização do bloco AO VIVO (probabilidade + momentum).
 *
 * 30 s é o teto acordado para dado ao vivo: acompanha o snapshot da ESPN e o
 * polling do próprio jogo (40 s), sem multiplicar requisição à fonte. Com
 * `finished` o componente busca uma vez só.
 */
const LIVE_REFRESH_MS = 30000;

/**
 * Barra de pressão APPM — ataques perigosos por minuto.
 *
 * Escala fixa de 0 a 4 ataques/min (o teto prático do futebol), com a cor do
 * valor vindo dos cortes publicados: verde ≥ 2, laranja > 3, vermelho > 3,9.
 * Sem lances na fonte não existe número: o bloco mostra "Indisponível" em vez
 * de barra vazia ou estimativa.
 */
export function AppmBar({ dados, home, away }: { dados?: AppmPayload | null; home: string; away: string }) {
  const celulas = dados?.janelas ?? [];
  if (!celulas.length) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-mut">APPM · ataques perigosos/min</p>
        <p className="text-[11px] leading-snug text-mut">
          Indisponível: a fonte ainda não entregou lances desta partida.
        </p>
      </div>
    );
  }

  const ESCALA = 4; // ataques perigosos por minuto no topo da barra
  const cor = (n: NivelAppm) =>
    n === "vermelho" ? "text-danger" : n === "laranja" ? "text-warn" : n === "verde" ? "text-good" : "text-mut";
  const fundo = (n: NivelAppm) =>
    n === "vermelho" ? "bg-danger" : n === "laranja" ? "bg-warn" : n === "verde" ? "bg-good" : "bg-mut/50";
  const nomeJanela = (j: number) => (j === 0 ? "Jogo" : `${j} min`);
  const nf = (v: number) => v.toFixed(1).replace(".", ",");

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-mut">APPM · ataques perigosos/min</p>
        <span className="text-[9px] font-bold text-mut">{dados?.ataques ?? 0} no jogo</span>
      </div>

      <div className="space-y-1">
        {celulas.map((c) => (
          <div key={c.janela} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[9px] font-bold text-mut">{nomeJanela(c.janela)}</span>

            {/* lado casa: valor + barra crescendo da esquerda */}
            <div className="flex flex-1 items-center gap-1">
              <span className={`w-8 shrink-0 text-right font-display text-[10px] font-black ${cor(c.nivelCasa)}`}>
                {nf(c.casa)}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel2">
                <div
                  className={`h-full rounded-full transition-all ${fundo(c.nivelCasa)}`}
                  style={{ width: `${Math.min(100, (c.casa / ESCALA) * 100)}%` }}
                />
              </div>
            </div>

            <span className="w-2 shrink-0 text-center text-[9px] text-mut/60">·</span>

            {/* lado fora: barra crescendo da direita */}
            <div className="flex flex-1 items-center gap-1">
              <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-panel2">
                <div
                  className={`h-full rounded-full transition-all ${fundo(c.nivelFora)}`}
                  style={{ width: `${Math.min(100, (c.fora / ESCALA) * 100)}%` }}
                />
              </div>
              <span className={`w-8 shrink-0 font-display text-[10px] font-black ${cor(c.nivelFora)}`}>{nf(c.fora)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between text-[9px] font-bold text-mut">
        <span className="truncate">{home}</span>
        <span className="truncate text-right">{away}</span>
      </div>
      <p className="text-[9px] leading-snug text-mut/80">
        Ataques perigosos por minuto jogado na janela. Cor: verde ≥ 2 · laranja acima de 3 · vermelho acima de 3,9.
      </p>
    </div>
  );
}

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
  finished = false,
  minutoAoVivo = null,
}: {
  matchId: string;
  league: string;
  home: string;
  away: string;
  /** Jogo encerrado: título vira "Momentum final" e o selo FIRE sai da tela. */
  finished?: boolean;
  /** Avisa a aba qual é o selo atual, para ele ficar no topo do jogo. */
  onSinal?: (s: Sinal | null) => void;
  /** Entrega a probabilidade 1X2 para o gráfico, sem uma segunda requisição. */
  onWinProb?: (p: WinProbPayload | null) => void;
  /**
   * Minuto do estado GLOBAL do jogo (relógio do placar no topo).
   * Vai na requisição e no título: o último lance narrado atrasa em relação ao
   * cronômetro, e era isso que travava o card em 19' com o topo em 26'.
   */
  minutoAoVivo?: number | null;
}) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState(false);
  const vivo = useRef(true);
  /* Refs para o minuto e o loader: o relógio muda sem reiniciar o intervalo
     (se dependesse do minuto na lista de deps, cada minuto novo zeraria o
     polling e ele poderia nunca disparar). */
  const minutoRef = useRef<number | null>(minutoAoVivo);
  const carregarRef = useRef<() => void>(() => {});

  useEffect(() => {
    vivo.current = true;
    const carregar = () => {
      const min = minutoRef.current;
      const q = min != null && min > 0 ? `&minuto=${min}` : "";
      return fetch(`/api/matches/${matchId}/momentum?league=${encodeURIComponent(league)}${q}`)
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
    };
    carregarRef.current = carregar;
    carregar();
    /* Jogo encerrado não muda mais: uma busca basta, sem polling contínuo. */
    if (finished) {
      return () => {
        vivo.current = false;
      };
    }
    const t = setInterval(carregar, LIVE_REFRESH_MS);
    return () => {
      vivo.current = false;
      clearInterval(t);
    };
  }, [matchId, league, onSinal, onWinProb, finished]);

  /* Minuto global mudou: busca já, sem esperar o próximo tique.
     O primeiro render é pulado (a busca acima já cobriu). A escrita no ref fica
     num efeito anterior a este, para o fetch já mandar o minuto novo. */
  useEffect(() => {
    minutoRef.current = minutoAoVivo;
  }, [minutoAoVivo]);

  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    if (!finished && minutoAoVivo != null && minutoAoVivo > 0) carregarRef.current();
  }, [minutoAoVivo, finished]);

  const serie = dados?.serie || [];
  const p = dados?.pressao || null;
  /* Título sempre no relógio global; o payload é o fallback. */
  const minutoExibido = minutoAoVivo != null && minutoAoVivo > 0 ? minutoAoVivo : (dados?.minuto ?? 0);

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
          {finished ? "Momentum final" : `Momentum · últimos ${p.janela} min`}
          {finished ? "" : ` · ${minutoExibido}'`}
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

      {/* APPM: ataques perigosos por minuto (janelas 1/3/5/10 + jogo) */}
      <div className="rounded-xl border border-line bg-panel2 p-2">
        <AppmBar dados={dados.appm} home={home} away={away} />
      </div>

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
