import { Suspense } from "react";
import type { Metadata } from "next";
import { getSummaryRaw, matchFromSummary } from "@/lib/espn";
import MatchClient from "@/components/match/MatchClient";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ league?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const { league } = await searchParams;
  try {
    const sm = await getSummaryRaw(league || "bra.1", id, "in");
    const m = matchFromSummary(sm, league || "bra.1", id);
    return { title: `${m.home.name} x ${m.away.name}: Estatísticas ao Vivo e Análise` };
  } catch {
    return { title: "Detalhes da Partida" };
  }
}

export default async function MatchPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { league } = await searchParams;
  return (
    <Suspense fallback={<div className="space-y-2"><div className="skeleton h-40" /><div className="skeleton h-10" /><div className="skeleton h-64" /></div>}>
      <MatchClient id={id} league={league || "bra.1"} />
    </Suspense>
  );
}