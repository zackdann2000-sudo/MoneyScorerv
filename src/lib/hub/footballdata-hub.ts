import { cached } from "@/lib/cache";
import { fdFetch } from "@/lib/providers";
import type { RawFixture } from "./types";

/**
 * Adaptador Football-Data.org para o Hub — FALLBACK de fixtures.
 *
 * O que o plano free entrega aqui: jogos das competições tier-one (data, times,
 * placar, rodada). O que ele NÃO entrega: odds (`odds.msg` pede pacote pago).
 * Por isso este adaptador jamais devolve odd — se a Sportmonks, o Bzzoiro e a
 * ESPN não tiverem preço, a fixture fica sem odd e o app esconde o "Valor".
 */

type FdTeam = { id: number; name: string; shortName?: string | null; crest?: string | null };
type FdMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  stage: string | null;
  competition: { id: number; code: string; name: string; type: string; emblem?: string | null };
  season?: { startDate?: string; endDate?: string; currentMatchday?: number | null };
  area?: { name?: string };
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score?: { fullTime?: { home: number | null; away: number | null }; halfTime?: { home: number | null; away: number | null } };
  odds?: { msg?: string };
  referees?: Array<{ name?: string }>;
};

export function fdLiveState(status: string): string {
  switch (status) {
    case "IN_PLAY":
      return "INPLAY_1ST_HALF";
    case "PAUSED":
      return "HT";
    case "FINISHED":
      return "FT";
    case "POSTPONED":
    case "SUSPENDED":
    case "CANCELLED":
    case "AWARDED":
      return "POSTPONED";
    default:
      return "NS";
  }
}

export async function fdFixturesForDate(dateIso: string): Promise<RawFixture[]> {
  const payload = await fdFetch(`/matches?date=${dateIso}`, 120_000);
  const rows: FdMatch[] = Array.isArray(payload?.matches) ? payload.matches : [];

  return rows.map((m) => {
    const start = m.season?.startDate?.slice(0, 4);
    const end = m.season?.endDate?.slice(0, 4);
    const seasonKey = start ? `${start}-${end ?? start}` : null;
    const isCup = String(m.competition.type || "").toUpperCase().includes("CUP");
    return {
      source: "footballdata" as const,
      externalId: String(m.id),
      league: {
        externalId: m.competition.code,
        name: m.competition.name,
        logo: m.competition.emblem ?? null,
        countryName: m.area?.name ?? null,
        isCup,
        seasonKey,
        seasonName: seasonKey,
      },
      home: { externalId: String(m.homeTeam.id), name: m.homeTeam.name, logo: m.homeTeam.crest ?? null },
      away: { externalId: String(m.awayTeam.id), name: m.awayTeam.name, logo: m.awayTeam.crest ?? null },
      kickoff: new Date(m.utcDate),
      liveState: fdLiveState(m.status),
      homeScore: m.score?.fullTime?.home ?? null,
      awayScore: m.score?.fullTime?.away ?? null,
      stageName: m.stage ?? null,
      roundName: m.matchday != null ? `Rodada ${m.matchday}` : null,
      isCup,
    };
  });
}

/**
 * Posição na tabela por id de time do Football-Data.
 *
 * Alimenta o fator "StandingsAdvantage" do motor Poisson. Devolve mapa vazio
 * em qualquer falha: melhor o motor rodar sem o ajuste do que com número torto.
 */
export async function fdTablePositions(competitionCode: string): Promise<Record<string, number>> {
  return cached(`hub:fd:standings:${competitionCode}`, 900_000, async () => {
    const out: Record<string, number> = {};
    try {
      const d = await fdFetch(`/competitions/${competitionCode}/standings`, 900_000);
      const tabelas: any[] = Array.isArray(d?.standings) ? d.standings : [];
      for (const bloco of tabelas) {
        for (const linha of Array.isArray(bloco?.table) ? bloco.table : []) {
          const id = linha?.team?.id;
          const pos = linha?.position;
          if (id != null && pos != null) out[String(id)] = Number(pos);
        }
      }
    } catch {
      /* competição fora do plano free ou tabela indisponível */
    }
    return out;
  });
}
