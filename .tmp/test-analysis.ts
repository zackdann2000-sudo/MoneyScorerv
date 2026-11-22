import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { hubAnalysis, hubOpportunity, hubValueBet } from "../src/db/hub-schema";
import { generateAnalysis, fixtureHasOdds } from "../src/lib/hub/analysis";

async function main() {
  const fixtureId = 20;

  // limpa o que a sessão anterior deixou para este jogo (teste local)
  await db.delete(hubOpportunity).where(eq(hubOpportunity.fixtureId, fixtureId));
  await db.delete(hubAnalysis).where(eq(hubAnalysis.fixtureId, fixtureId));

  console.log("fixtureHasOdds:", await fixtureHasOdds(fixtureId));

  const preview = await generateAnalysis(fixtureId, "Preview");
  const [pv] = await db.select().from(hubAnalysis).where(eq(hubAnalysis.id, preview.analysisId));
  console.log("PREVIEW hasOdds=", pv.summary?.hasOdds, "kind=", pv.summary?.kind, "xg=", pv.predictedHomeGoals, pv.predictedAwayGoals);
  console.log("preview opportunity:", preview.opportunityId, "(preview nunca cria oportunidade)");

  const final = await generateAnalysis(fixtureId, "Final");
  const [fv] = await db.select().from(hubAnalysis).where(eq(hubAnalysis.id, final.analysisId));
  console.log("FINAL hasOdds=", fv.summary?.hasOdds, "opportunityId=", final.opportunityId);
  if (final.opportunityId) {
    const [op] = await db.select().from(hubOpportunity).where(eq(hubOpportunity.id, final.opportunityId));
    const [vb] = await db.select().from(hubValueBet).where(eq(hubValueBet.analysisId, final.analysisId));
    console.log("oportunidade:", JSON.stringify(op));
    console.log("valueBet:", JSON.stringify(vb));
  }

  // limpa o teste: ledger público não pode ficar com linha de teste
  await db.delete(hubOpportunity).where(eq(hubOpportunity.fixtureId, fixtureId));
  await db.delete(hubAnalysis).where(eq(hubAnalysis.fixtureId, fixtureId));
  console.log("limpo ✅");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
