import { NextRequest, NextResponse } from "next/server";
import { getSummaryRaw, matchFromSummary, normOdds } from "@/lib/espn";
import { analyzeMatch } from "@/lib/engine";
import { projetarGols } from "@/lib/golsLadder";
import { getUser } from "@/lib/auth";
import { consumirAnaliseDePartida } from "@/lib/quotaServer";

export const dynamic = "force-dynamic";

/**
 * GET /api/matches/[id]/analysis?league=bra.1 — a análise completa do jogo.
 *
 * ACESSO E COTA (o freemium de 1 análise/dia):
 *  - admin / dono / VIP / trial ativo → conteúdo completo, sem debitar nada;
 *  - conta Free logada → a cota é debitada AQUI, no banco
 *    (`consumirAnaliseDePartida`), e só DEPOIS que o modelo calculou com sucesso.
 *    Reabrir a mesma partida no mesmo dia não debita de novo (quitação em
 *    `analyses_opened`); abrir outra partida depois de esgotar a cota recebe 402;
 *  - anônimo → 401 com `locked`, porque sem conta não existe cota para debitar.
 *
 * Antes o débito era do cliente (`POST /api/quota` disparado por um componente
 * que consultava o `localStorage`): limpar o storage liberava análises
 * ilimitadas, e quem tinha cota caía no paywall de VIP sem receber a análise
 * que a própria UI prometia. O servidor é a única fonte de verdade agora.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const league = req.nextUrl.searchParams.get("league") || "bra.1";
  const user = await getUser();
  const vip = !!user && (user.isAdmin || user.access.active);

  try {
    const sm = await getSummaryRaw(league, id, "in");
    const match = matchFromSummary(sm, league, id);
    const { analysis, h2h, veredito, sampleInfo } = await analyzeMatch(match);
    // Ladder de gols: Poisson sobre o λ total do confronto. A odd só entra se a
    // fonte publicar o par Over/Under da MESMA linha (sem par não há de-vig).
    const ladder =
      analysis.status === "ok" ? projetarGols(analysis.lambdaHome + analysis.lambdaAway, normOdds(sm)) : [];
    const ladderInfo = { lambdaTotal: +(analysis.lambdaHome + analysis.lambdaAway).toFixed(2), linhas: ladder };

    /* Sem modelo utilizável (amostra insuficiente) a resposta é a mesma de
       antes e NADA é debitado: a pessoa não recebeu análise, não deve pagar
       por ela. */
    if (analysis.status !== "ok") {
      return NextResponse.json({ locked: false, ...analysis, veredito, ladder: ladderInfo, h2h: h2h.games?.slice(0, 6), sampleInfo, match: { id: match.id, home: match.home.name, away: match.away.name } });
    }

    if (!vip) {
      /* Anônimo: não há de onde debitar. O 401 leva a pessoa ao cadastro — é o
         único caminho para ganhar a análise do dia. */
      if (!user) {
        return NextResponse.json(
          {
            locked: true,
            motivo: "login",
            status: analysis.status,
            model_type: analysis.model_type,
            sample: analysis.sample,
            updatedAt: analysis.updatedAt,
            ladder: ladderInfo,
            error: "Crie sua conta grátis para ver esta análise — você tem 1 análise por dia.",
          },
          { status: 401 },
        );
      }

      /* Conta Free: debita a cota no banco (atômico e idempotente por partida). */
      const consumo = await consumirAnaliseDePartida(user, id);
      if (!consumo.liberado) {
        return NextResponse.json(
          {
            locked: true,
            motivo: "quota",
            status: analysis.status,
            model_type: analysis.model_type,
            sample: analysis.sample,
            updatedAt: analysis.updatedAt,
            ladder: ladderInfo,
            quota: consumo.estado,
            error: "Sua análise grátis de hoje já foi usada. O contador volta à meia-noite (Brasília).",
          },
          { status: 402 },
        );
      }

      return NextResponse.json({
        locked: false,
        ...analysis,
        veredito,
        ladder: ladderInfo,
        h2h: h2h.games?.slice(0, 6),
        sampleInfo,
        quota: consumo.estado,
        partidaJaContada: consumo.jaContabilizada,
        match: { id: match.id, home: match.home.name, away: match.away.name },
      });
    }

    return NextResponse.json({ locked: false, ...analysis, veredito, ladder: ladderInfo, h2h: h2h.games?.slice(0, 6), sampleInfo, match: { id: match.id, home: match.home.name, away: match.away.name } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha na análise.", status: "erro" }, { status: 502 });
  }
}
