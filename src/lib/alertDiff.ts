/**
 * Diff de alertas ao vivo — módulo PURO (sem I/O, sem rede, sem banco).
 *
 * A pergunta que ele responde: entre dois ciclos do cron, o que mudou neste
 * jogo? Um gol, o apito inicial, o fim? E esse evento já foi enviado?
 *
 * Todo o resto (buscar placar, achar quem optou, disparar push) fica na rota.
 * Aqui só entra verdade verificável: placar anterior × placar atual.
 */

/** Placar + estado em um instante. É o que fica gravado em `alert_state.snap`. */
export type Snapshot = {
  /** gols do mandante */
  h: number;
  /** gols do visitante */
  a: number;
  /** "pre" | "in" | "post" (estado da ESPN) */
  estado: string;
  /** minuto, quando a fonte informa */
  min?: number;
};

export type Mudanca =
  | { tipo: "gol"; lado: "home" | "away"; placar: { h: number; a: number } }
  | { tipo: "inicio" }
  | { tipo: "fim" };

/** Mapa de eventos já enviados: chave → timestamp (ms). */
export type Enviados = Record<string, number>;

const inteiro = (v: unknown, padrao = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : padrao;
};

/** Lê o snapshot gravado no jsonb, tolerando lixo de versões antigas. */
export function lerSnapshot(bruto: unknown): Snapshot | null {
  if (!bruto || typeof bruto !== "object") return null;
  const s = bruto as Partial<Snapshot>;
  if (typeof s.h !== "number" || typeof s.a !== "number") return null;
  return {
    h: inteiro(s.h),
    a: inteiro(s.a),
    estado: typeof s.estado === "string" ? s.estado : "",
    min: typeof s.min === "number" ? Math.floor(s.min) : undefined,
  };
}

/**
 * Eventos entre o snapshot anterior e o atual.
 *
 * Regras:
 *  - sem anterior e jogo já rolando → "inicio" (primeira vez que o cron vê);
 *  - placar subiu → um "gol" por lado que subiu (nunca dois pelo mesmo lado);
 *  - "pre/in" → "in" = início; "in" → "post" = fim.
 * Placar que DIMINUI (correção da fonte) não gera evento: não se avisa gol que
 * a fonte desfez.
 */
export function detectarMudancas(anterior: Snapshot | null, atual: Snapshot): Mudanca[] {
  const out: Mudanca[] = [];

  if (!anterior) {
    if (atual.estado === "in") out.push({ tipo: "inicio" });
    return out;
  }

  if (atual.h > anterior.h) out.push({ tipo: "gol", lado: "home", placar: { h: atual.h, a: atual.a } });
  if (atual.a > anterior.a) out.push({ tipo: "gol", lado: "away", placar: { h: atual.h, a: atual.a } });

  if (anterior.estado !== "in" && atual.estado === "in") out.push({ tipo: "inicio" });
  if (anterior.estado === "in" && atual.estado === "post") out.push({ tipo: "fim" });

  return out;
}

/**
 * Chave de dedupe. O placar entra na chave: 1–0 e 2–0 são eventos diferentes,
 * mas o MESMO 1–0 reentregue pela fonte não vira push de novo.
 */
export function chaveEvento(matchId: string, m: Mudanca): string {
  if (m.tipo === "gol") return `${matchId}:gol:${m.placar.h}-${m.placar.a}`;
  return `${matchId}:${m.tipo}`;
}

export function jaEnviado(enviados: Enviados | null | undefined, chave: string): boolean {
  return Boolean(enviados && enviados[chave]);
}

/** Marca o evento como enviado (imutável: devolve um mapa novo). */
export function marcarEnviado(enviados: Enviados | null | undefined, chave: string, agora = Date.now()): Enviados {
  return { ...(enviados || {}), [chave]: agora };
}

/** Remove chaves velhas para o jsonb não crescer sem limite. */
export function podarEnviados(enviados: Enviados | null | undefined, agora = Date.now(), ttlMs = 7 * 86_400_000): Enviados {
  const out: Enviados = {};
  for (const [k, ts] of Object.entries(enviados || {})) {
    if (Number.isFinite(ts) && agora - ts < ttlMs) out[k] = ts;
  }
  return out;
}

/** Minutos até o início. `null` se a data for inválida. */
export function minutosAte(inicioISO: string, agora = Date.now()): number | null {
  const t = Date.parse(inicioISO);
  if (!Number.isFinite(t)) return null;
  return (t - agora) / 60_000;
}

/**
 * Está na janela de lembrete? Padrão: faltam entre 13 e 17 minutos.
 * A tolerância cobre o cron de 1 min sem mandar o mesmo lembrete duas vezes
 * (o dedupe por `kickoff:<id>` é a segunda trava).
 */
export function naJanelaKickoff(
  inicioISO: string,
  agora = Date.now(),
  alvoMin = 15,
  toleranciaMin = 2,
): boolean {
  const m = minutosAte(inicioISO, agora);
  if (m == null) return false;
  return m <= alvoMin + toleranciaMin && m >= alvoMin - toleranciaMin;
}

/** Preferência de alerta como vem do banco. */
export type PrefAlerta = {
  userId: number;
  teamId: string;
  matchId: string;
  alerts: Record<string, boolean> | null;
};

/**
 * Quem deve receber este evento.
 *
 * Só entra quem deu opt-in EXPLÍCITO naquele tipo:
 *  - `alerts.gol` (ou o legado `goals`) para gols;
 *  - `alerts.kickoff` (ou o legado `matchStart`) para lembrete de início.
 *
 * Escopo: linha específica do jogo (`matchId`), time seguido (`teamId`) ou o
 * curinga `*` (todos os jogos — opt-in global, não default).
 */
export function destinatarios(
  prefs: PrefAlerta[],
  alvo: { matchId: string; teamIds: string[]; tipo: "gol" | "kickoff" },
): number[] {
  const chaves =
    alvo.tipo === "gol" ? ["gol", "goals"] : ["kickoff", "matchStart"];
  const times = new Set(alvo.teamIds.filter(Boolean));
  const ids = new Set<number>();
  for (const p of prefs) {
    const a = p.alerts || {};
    if (!chaves.some((k) => a[k] === true)) continue;
    const escopo =
      p.matchId === alvo.matchId ||
      (p.matchId === "" && (p.teamId === "*" || times.has(p.teamId)));
    if (escopo) ids.add(p.userId);
  }
  return [...ids];
}

/**
 * Mensagem do gol. `lado` é quem marcou; o placar já vem atualizado.
 * Sem autor (a lista de scorers não vem no scoreboard em lote), então não
 * inventamos nome de jogador.
 */
export function textoGol(opts: {
  lado: "home" | "away";
  placar: { h: number; a: number };
  home: string;
  away: string;
  minuto?: number;
}): { titulo: string; corpo: string } {
  const quem = opts.lado === "home" ? opts.home : opts.away;
  const minuto = opts.minuto ? ` aos ${opts.minuto}'` : "";
  return {
    titulo: `⚽ GOL DO ${quem.toUpperCase()}!`,
    corpo: `${opts.home} ${opts.placar.h} × ${opts.placar.a} ${opts.away}${minuto}.`,
  };
}
