import "dotenv/config";
import { fdFixturesForDate, fdTablePositions } from "../src/lib/hub/footballdata-hub";
import { findFixtureByTeams } from "../src/lib/hub/identity";
import { syncFixturesCascade } from "../src/lib/hub/cascade";

async function main() {
  const dia = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);

  // 1) ESPN cobre o dia (fonte primária)
  const espn = await syncFixturesCascade(dia);
  console.log("FIXTURES", dia, "->", espn.source, espn.created, JSON.stringify(espn.attempts));

  // 2) Football-Data do mesmo dia: os jogos precisam CASAR com os da ESPN
  const fd = await fdFixturesForDate(dia);
  console.log("FD jogos no dia:", fd.length, fd.slice(0, 3).map((f) => `${f.home.name} x ${f.away.name}`).join(" | "));

  let casados = 0;
  const detalhe: string[] = [];
  for (const f of fd.slice(0, 12)) {
    const id = await findFixtureByTeams({ matchDate: f.kickoff, homeName: f.home.name, awayName: f.away.name, minScore: 0.9 });
    if (id) casados += 1;
    detalhe.push(`${f.home.name} x ${f.away.name} -> ${id ?? "SEM PAR"}`);
  }
  console.log("dedupe FD x já-gravado:", casados, "de", Math.min(12, fd.length));
  console.log(detalhe.join("\n"));

  const pos = await fdTablePositions("BSA");
  console.log("FD posições (BSA):", Object.keys(pos).length, "times");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
