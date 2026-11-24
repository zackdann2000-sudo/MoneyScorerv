#!/usr/bin/env node
/**
 * Diagnóstico da aba Estatísticas (TIME A × TIME B).
 *
 * Responde, sem subir o Next e sem gastar cota paga:
 *   - o ESPN conhece a partida e qual é o estado dela?
 *   - quais métricas a rota vai devolver e com qual chave canônica?
 *   - o filtro default da UI ("principais") mantém essas métricas?
 *   - o split de 1º/2º tempo existe? (o cadeado dos botões depende disso)
 *   - o SportMonks encontra o fixture por nome+data? (só funciona onde o plano
 *     dele cobre a liga — hoje só a Premiership escocesa)
 *
 *   npm run debug:team-stats -- 401841335 bra.1
 *   npm run debug:team-stats -- <eventId> <leagueSlug>
 *
 * Nenhum segredo é impresso: só nomes de time, chaves e números da partida.
 */
import "dotenv/config";
import { getSummaryRaw, matchFromSummary, normStats } from "../src/lib/espn";
import { splitDoEspn } from "../src/lib/espnTempos";
import { filtrar } from "../src/lib/teamStatCats";

/* Cópia da tabela da rota: ESPN → chave canônica (mesma usada na UI). */
const ESPN_KEY_MAP: Record<string, string> = {
  possessionPct: "ball_possession",
  totalShots: "total_shots",
  shotsOnTarget: "shots_on_goal",
  wonCorners: "corner_kicks",
  foulsCommitted: "fouls",
  offsides: "offsides",
  yellowCards: "yellow_cards",
  redCards: "red_cards",
  saves: "goalkeeper_saves",
  totalPasses: "total_passes",
  accuratePasses: "passes_accurate",
  passPct: "pass_pct",
  totalTackles: "total_tackles",
  interceptions: "interceptions",
  totalClearance: "total_clearance",
  blockedShots: "blocked_shots",
  totalCrosses: "total_crosses",
  penaltyKickGoals: "penalty_kick_goals",
};

async function main() {
  const [id, league = "bra.1"] = process.argv.slice(2);
  if (!id) {
    console.error("uso: npm run debug:team-stats -- <eventId> <leagueSlug>");
    process.exit(2);
  }

  console.log(`partida ${id} · liga ${league}\n`);

  const sm = await getSummaryRaw(league, id, "in");
  if (!sm?.header) {
    console.log("❌ ESPN não devolveu summary: id ou liga errados?");
    process.exit(1);
  }

  const match = matchFromSummary(sm, league, id);
  console.log(`jogo: ${match.home.name} x ${match.away.name}`);
  console.log(`data: ${match.date} | live: ${match.live} | finished: ${match.finished}`);
  console.log(`estado ESPN: ${sm.header.competitions?.[0]?.status?.type?.detail ?? "-"}`);

  /* 1) comparativo total */
  const metrics = normStats(sm, match.home.id).map((s: any) => {
    const chave = ESPN_KEY_MAP[String(s.key)] || String(s.key);
    const num = (v: any) => Number(String(v ?? "0").replace("%", "").replace(",", ".")) || 0;
    const escala = (v: any) => {
      const n = num(v);
      return chave === "pass_pct" && n <= 1 ? +(n * 100).toFixed(1) : n;
    };
    return {
      key: chave,
      label: String(s.label),
      home: escala(s.home),
      away: escala(s.away),
      percent: /%/.test(String(s.home ?? "")) || chave === "ball_possession" || chave === "pass_pct",
      origem: String(s.key),
    };
  });

  console.log(`\nmétricas do ESPN: ${metrics.length}`);
  for (const m of metrics) {
    console.log(`  ${m.key.padEnd(20)} <- ${String(m.origem).padEnd(18)} ${m.home} x ${m.away}`);
  }

  for (const filtro of ["principais", "ataque", "passes", "defesa", "disciplina"] as const) {
    const n = filtrar(metrics as any, filtro).length;
    const alerta = n === 0 ? "  ⚠ filtro vazio = 'Nenhuma métrica disponível'" : "";
    console.log(`  filtro ${filtro.padEnd(11)} → ${n} métrica(s)${alerta}`);
  }

  /* 2) split por tempo */
  const split = splitDoEspn(sm);
  const temSplits = split.primeiroTempo.length > 0 && split.segundoTempo.length > 0;
  console.log("\n1º tempo:");
  console.log(split.primeiroTempo.map((m) => `  ${m.label}: ${m.home} x ${m.away}`).join("\n") || "  (vazio)");
  console.log("2º tempo:");
  console.log(split.segundoTempo.map((m) => `  ${m.label}: ${m.home} x ${m.away}`).join("\n") || "  (vazio)");
  console.log(`\ntemSplits: ${temSplits} → cadeado dos botões ${temSplits ? "ABRE" : "CONTINUA travado"}`);

  /* 3) SportMonks cobre esta liga? */
  const token = process.env.SPORTMONKS_TOKEN;
  if (!token) {
    console.log("\nSportMonks: sem token no ambiente — pulando checagem de cobertura.");
    return;
  }
  const dia = String(match.date || "").slice(0, 10);
  const r = await fetch(
    `https://api.sportmonks.com/v3/football/fixtures/date/${dia}?api_token=${token}&include=participants`,
  );
  const j: any = await r.json();
  const lista: any[] = Array.isArray(j?.data) ? j.data : [];
  const norm = (s: string) =>
    String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
  const achou = lista.find((f: any) => {
    const nomes = (f?.participants || []).map((p: any) => norm(p?.name));
    return nomes.some((n: string) => n.includes(norm(match.home.name))) &&
      nomes.some((n: string) => n.includes(norm(match.away.name)));
  });
  console.log(`\nSportMonks em ${dia}: ${lista.length} jogo(s) no plano atual`);
  console.log(`  fixture deste jogo: ${achou ? `encontrado (id ${achou.id})` : "NÃO encontrado"}`);
  if (!lista.length) {
    console.log("  → o plano não cobre esta liga (por isso smFindFixtureId devolve null)");
  }
}

main().catch((e) => {
  console.error("❌", e?.message || e);
  process.exit(1);
});
