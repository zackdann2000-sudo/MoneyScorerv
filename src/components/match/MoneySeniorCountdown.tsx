"use client";
import { useEffect, useMemo, useState } from "react";

/* =======================================================================
   COUNTDOWN DO MONEY SÊNIOR — 12:00 de Brasília
   Regras (confirmadas):
   · Antes das 12:00  → contador regressivo
   · Depois das 12:00 → mostra o pick revelado do dia, se existir
   · Zerou e sem pick  → "Aguardando novo pick"
   ======================================================================= */

const TZ = "America/Sao_Paulo";
const CUTOFF_HOUR = 12;

/* Próximo/alvo 12:00 no fuso de Brasília, devolvido como timestamp UTC. */
function nextCutoff(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const y = get("year");
  const mo = get("month");
  const d = get("day");
  const h = get("hour");

  /* Offset de Brasília em relação a UTC (normalmente -3). */
  const asUtc = Date.UTC(y, mo - 1, d, h, get("minute"), get("second"));
  const offsetMs = asUtc - now.getTime();

  const targetLocal = Date.UTC(y, mo - 1, d, CUTOFF_HOUR, 0, 0);
  let target = targetLocal - offsetMs;

  if (h >= CUTOFF_HOUR) {
    /* já passou hoje: o alvo é o 12:00 de amanhã */
    const tomorrow = new Date(target + 24 * 3600 * 1000);
    target = tomorrow.getTime();
  }
  return target;
}

function isPastCutoff(now: Date): boolean {
  const h = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now)
  );
  return h >= CUTOFF_HOUR;
}

/* Horário do próximo pick em Brasília (ex.: "12:00" ou "12:00 de amanhã").
   O cutoff é sempre 12:00; quando já passou, refere-se ao dia seguinte. */
function horaProximoPick(now: Date): string {
  const alvo = new Date(nextCutoff(now));
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(alvo);
  return isPastCutoff(now) ? `${hora} de amanhã` : hora;
}

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, "0");
}

export type CountdownState = "counting" | "revealed" | "waiting";

export default function MoneySeniorCountdown({
  hasPick,
  onReveal,
}: {
  hasPick: boolean;
  onReveal?: () => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const past = useMemo(() => isPastCutoff(now), [now]);
  const target = useMemo(() => nextCutoff(now), [now]);

  const diff = Math.max(0, target - now.getTime());
  const totalSec = Math.floor(diff / 1000);
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;

  const state: CountdownState = past ? (hasPick ? "revealed" : "waiting") : "counting";

  if (state === "revealed") {
    return (
      <button
        onClick={onReveal}
        className="w-full text-left bg-panel border border-acc/50 rounded-2xl p-3.5 flex items-center gap-3 card-hover"
      >
        <span className="text-2xl shrink-0">✅</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-acc">
            Pick do dia revelado
          </p>
          <p className="text-[11px] text-mut leading-tight">
            O Money Sênior já liberou o palpite das 12:00. Toque para ver as listas.
          </p>
        </div>
        <span className="text-acc font-bold text-lg shrink-0">→</span>
      </button>
    );
  }

  if (state === "waiting") {
    return (
      <div className="w-full bg-panel border border-dashed border-line rounded-2xl p-3.5 flex items-center gap-3">
        <span className="text-2xl shrink-0">⏳</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-warn">
            Aguardando novo pick
          </p>
          <p className="text-[11px] text-mut leading-tight">
            O próximo pick será liberado às {horaProximoPick(now)}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-2xl p-3.5 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #05303d, #0a3c4b 60%, #0f5567)" }}
    >
      <div className="absolute inset-0 opacity-[0.07] pitch pointer-events-none" />
      <div className="relative flex items-center gap-3">
        <span className="text-2xl shrink-0">🧙‍♂️</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-acc">
            Money Sênior · Pick do dia
          </p>
          <p className="text-[10px] text-mut leading-tight">
            {hasPick ? "Palpite liberado às 12:00" : "O próximo pick revela em"} (horário de Brasília)
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-1 font-display font-bold tabular-nums text-acc">
          <span className="bg-black/35 rounded-lg px-1.5 py-1 text-lg min-w-[34px] text-center">{pad(hh)}</span>
          <span className="text-mut text-sm">:</span>
          <span className="bg-black/35 rounded-lg px-1.5 py-1 text-lg min-w-[34px] text-center">{pad(mm)}</span>
          <span className="text-mut text-sm">:</span>
          <span className="bg-black/35 rounded-lg px-1.5 py-1 text-lg min-w-[34px] text-center">{pad(ss)}</span>
        </div>
      </div>
    </div>
  );
}
