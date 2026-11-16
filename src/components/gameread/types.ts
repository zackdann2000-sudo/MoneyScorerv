/**
 * Tipos do módulo GameRead (lado cliente).
 * Espelham o que as rotas /api/gameread/* devolvem. Módulo isolado — nada aqui
 * é importado pelas telas existentes do projeto.
 */

export type PropRowUI = {
  id: string;
  market: string;
  marketLabel: string;
  marketGroup: "gols" | "cantos" | "cartoes" | "jogador" | "outros";
  selection: "Over" | "Under";
  fixtureId: string;
  kickoffUtc: string;
  leagueName: string;
  leagueLogo: string;
  homeName: string;
  homeLogo: string;
  awayName: string;
  awayLogo: string;
  awayColor: string | null;
  isLive: boolean;
  subjectName: string;
  subjectPhoto: string | null;
  subjectPosition: string | null;
  subjectKind: "player" | "team";
  availability: string | null;
  injuryReason: string | null;
  line: number | null;
  odd: number | null;
  bookmaker: string | null;
  hitRateL5: number | null;
  hitRateL10: number | null;
  hitRateSzn: number | null;
  seasonHits: number | null;
  seasonEval: number | null;
  last10: string;
  h2h: boolean;
  score: number;
};

export type FixtureUI = {
  id: string;
  kickoffUtc: string | null;
  status: string | null;
  isLive: boolean;
  elapsedMinutes: number | null;
  leagueId: string;
  leagueName: string;
  leagueLogo: string;
  leaguePriority: number;
  homeName: string;
  homeLogo: string;
  awayName: string;
  awayLogo: string;
  homeGoals: number | null;
  awayGoals: number | null;
};

export type LineUI = {
  oddId: string;
  market: string;
  marketLabel: string;
  selection: string;
  line: number | null;
  price: number | null;
  bestBook: string | null;
  books: { name: string; price: number }[];
  bookCount: number;
  playerName: string | null;
  playerPhoto: string | null;
  playerPosition: string | null;
  availability: string | null;
  injuryReason: string | null;
  probableStarter: boolean | null;
  hitRateL5: number | null;
  hitRateL10: number | null;
  hitRateL20: number | null;
  hitsL10: number | null;
  h2h: boolean;
};

export type ComparisonUI = {
  fixtureId: string;
  fixture: {
    league: string | null;
    leagueLogo: string | null;
    kickoffUtc: string | null;
    status: string | null;
    round: string | null;
    venue: string | null;
    referee: string | null;
  } | null;
  home: { id: string; name: string; logoUrl?: string } | null;
  away: { id: string; name: string; logoUrl?: string } | null;
  winChance: { home: number | null; draw: number | null; away: number | null };
  window: number | null;
  form: { home: string | null; away: string | null };
  metrics: {
    key: string;
    label: string;
    suffix: string;
    home: number | null;
    away: number | null;
    homeShare: number;
  }[];
  availableWindows: number[];
  cache: { source: string; ageSeconds: number; ttlSeconds: number };
};

export type CacheInfo = { source: string; ageSeconds: number; ttlSeconds: number };

export const GROUPS: { key: PropRowUI["marketGroup"] | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "jogador", label: "Jogador" },
  { key: "gols", label: "Gols" },
  { key: "cantos", label: "Cantos" },
  { key: "cartoes", label: "Cartões" },
  { key: "outros", label: "Outros" },
];

/* ---------------------------- Helpers ---------------------------- */

export function fmtTime(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function fmtDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** "WWDLW" → array de letras para renderizar bolinhas. */
export function formArray(form: string | null): string[] {
  return (form ?? "").split("").filter(Boolean);
}

/** Cor do score: verde forte = ouro, amarelo = bom, cinza = morno. */
export function scoreTone(score: number): { text: string; bg: string; border: string } {
  if (score >= 105) return { text: "text-acc", bg: "bg-acc/12", border: "border-acc/45" };
  if (score >= 90) return { text: "text-acc2", bg: "bg-acc2/12", border: "border-acc2/40" };
  if (score >= 70) return { text: "text-warn", bg: "bg-warn/12", border: "border-warn/35" };
  return { text: "text-mut", bg: "bg-panel2", border: "border-line" };
}

export function hitTone(rate: number | null): string {
  if (rate == null) return "text-mut";
  if (rate >= 90) return "text-acc";
  if (rate >= 70) return "text-acc2";
  if (rate >= 50) return "text-warn";
  return "text-danger";
}

/** Rótulo curto para a odd: "Over 2.5". */
export function lineLabel(selection: string, line: number | null): string {
  if (line == null) return selection;
  return `${selection} ${line}`;
}

/**
 * Traduz o código de status da API para algo que o usuário entenda.
 *
 * A API devolve códigos crus da API-Football ("NS", "1H", "FT"...). Mostrar "NS"
 * ou "Pendente" na tela faz parecer erro de sistema; "Aguardando início" deixa
 * claro que está tudo certo e o jogo só não começou.
 */
export function statusLabel(status: string | null, isLive = false, elapsed?: number | null): string {
  if (isLive) return elapsed ? `${elapsed}'` : "Ao vivo";
  switch ((status ?? "").toUpperCase()) {
    case "NS":
    case "TBD":
      return "Aguardando início";
    case "1H":
    case "2H":
    case "HT":
    case "ET":
    case "P":
    case "LIVE":
    case "INT":
      return "Ao vivo";
    case "FT":
    case "AET":
    case "PEN":
      return "Encerrado";
    case "PST":
      return "Adiado";
    case "CANC":
      return "Cancelado";
    case "SUSP":
      return "Suspenso";
    case "ABD":
      return "Abandonado";
    case "AWD":
      return "Decisão administrativa";
    case "WO":
      return "W.O.";
    default:
      return status ? status : "Aguardando início";
  }
}

/** true quando a partida ainda não começou (para não parecer erro na tela). */
export function isPending(status: string | null, isLive = false): boolean {
  if (isLive) return false;
  const s = (status ?? "").toUpperCase();
  return s === "" || s === "NS" || s === "TBD";
}
