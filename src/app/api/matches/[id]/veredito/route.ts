import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, getTeamHistory, matchFromSummary, normH2H, type HistGame } from "@/lib/espn";
import { cached } from "@/lib/cache";
import { gerarVeredito } from "@/lib/veredito";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* O raio-X é o mesmo que /api/teams/[id] já usa (últimos 10 jogos com placar).
   Vinte minutos de cache: o histórico de um time não muda no meio do dia. */
const TTL = 20 * 60 * 1000;

const vazio = { games: [] as HistGame[], baseParcial: true, source: "ESPN" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";

  /* ACESSO: o veredito estatístico é conteúdo do produto (é a recomendação
     final do card), então segue a mesma regra de `/props`: só conta
     ativa/admin. O corpo do 402/403 traz `error` porque `VereditoDoJogo`
     descarta a resposta nesse caso (`!j.error ? ... : null`) — a aba mostra o
     resto do conteúdo normalmente, sem card de erro gigante. */
  const user = await getUser().catch(() => null);
  if (!user || !(user.isAdmin || user.access.active)) {
    return NextResponse.json(
      {
        locked: true,
        error: "Conteúdo VIP. Entre com uma conta ativa para ver o veredito do jogo.",
      },
      { status: user ? 402 : 403 },
    );
  }

  try {
    const data = await cached(`veredito:${league}:${id}`, TTL, async () => {
      const sm = await getSummaryRaw(league, id, "in");
      if (!sm?.header) throw new Error("Partida não encontrada nesta liga.");
      const match = matchFromSummary(sm, league, id);

      /* Um lado sem histórico não derruba o veredito: a função sabe lidar com
         base parcial e avisa na explicação. */
      const [raioxCasa, raioxFora] = await Promise.all([
        getTeamHistory(league, match.home.id, 10).catch(() => vazio),
        getTeamHistory(league, match.away.id, 10).catch(() => vazio),
      ]);

      const veredito = gerarVeredito(
        match.home.name,
        match.away.name,
        raioxCasa.games,
        raioxFora.games,
        /* H2H vem do MESMO summary que já foi buscado acima — não custa
           chamada extra. `normH2H` entrega os confrontos diretos; a rota só
           reetiqueta para o contrato do veredito (`gf`/`ga`), porque a média
           que o cruzamento usa é o total de gols por confronto. */
        (normH2H(sm).games || []).map((g: any) => ({
          gf: Number(g.homeScore),
          ga: Number(g.awayScore),
          date: String(g.date ?? ""),
        })),
      );

      return {
        ...veredito,
        jogo: {
          id: match.id,
          casa: { id: match.home.id, nome: match.home.name },
          fora: { id: match.away.id, nome: match.away.name },
        },
        base: {
          jogosCasa: raioxCasa.games.length,
          jogosFora: raioxFora.games.length,
          parcial: raioxCasa.baseParcial || raioxFora.baseParcial,
          fonte: "ESPN",
        },
        updatedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Falha ao montar o veredito.", updatedAt: new Date().toISOString() },
      { status: 502 },
    );
  }
}
