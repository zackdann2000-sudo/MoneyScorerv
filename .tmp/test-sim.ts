import "dotenv/config";
import { teamSimilarity, slugify } from "../src/lib/hub/identity";
const pares: Array<[string, string, number]> = [
  ["Bodo/Glimt", "FK Bodø/Glimt", 0.9],
  ["Aston Villa", "Aston Villa FC", 0.9],
  ["Galatasaray", "Galatasaray SK", 0.9],
  ["PSV Eindhoven", "PSV", 0.9],
  ["Santos", "Santos FC", 0.9],
  ["Slovan Bratislava", "ŠK Slovan Bratislava", 0.9],
  ["Manchester City", "Manchester City FC", 0.9],
  ["Atlético Mineiro", "Atlético Paranaense", 0],
  ["Manchester City", "Manchester United", 0],
  ["Real Madrid", "Real Betis", 0],
  ["Inter", "Internazionale", 0],
];
let falhas = 0;
for (const [a, b, esperado] of pares) {
  const s = Number(teamSimilarity(a, b).toFixed(3));
  const ok = esperado === 0 ? s < 0.9 : s >= esperado;
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok " : "FALHA"} ${a} x ${b} = ${s} (esperado ${esperado === 0 ? "<0.9" : ">=0.9"})`);
}
console.log("slug Bodø/Glimt ->", slugify("FK Bodø/Glimt"), "| falhas:", falhas);
process.exit(falhas ? 1 : 0);
