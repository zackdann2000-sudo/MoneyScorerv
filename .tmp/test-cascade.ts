import "dotenv/config";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../src/db";
import { hubFixture } from "../src/db/hub-schema";
import { syncOddsCascade, syncLineupsCascade, syncContextCascade } from "../src/lib/hub/cascade";

async function main() {
const alvo = Number(process.argv[2] ?? 3);

const jogos = await db
  .select({ id: hubFixture.id, matchDate: hubFixture.matchDate })
  .from(hubFixture)
  .where(and(eq(hubFixture.liveState, "NS"), gte(hubFixture.matchDate, new Date())))
  .limit(alvo);

for (const j of jogos) {
  const o = await syncOddsCascade(j.id).catch((e) => ({ error: String(e) }));
  console.log("ODDS", j.id, j.matchDate.toISOString(), JSON.stringify(o));
}
for (const j of jogos) {
  const l = await syncLineupsCascade(j.id).catch((e) => ({ error: String(e) }));
  console.log("LINEUP", j.id, JSON.stringify(l));
}
const c = await syncContextCascade(jogos[0].id).catch((e) => ({ error: String(e) }));
console.log("CONTEXT", jogos[0].id, JSON.stringify(c));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
