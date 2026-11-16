/**
 * Teste de fumaça do módulo GameRead — bate na API REAL e mostra o que a UI verá.
 *   node test-gameread.mjs [YYYY-MM-DD]
 *
 * Roda fora do bundler do Next (sem alias "@/"), então reimplementa o decoder
 * mínimo — mas com o MESMO formato posicional verificado em src/lib/gameread.ts.
 */
const BASE = "https://gameread.app/futebol/api/v1";
const H = {
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  Origin: "https://gameread.app",
  Referer: "https://gameread.app/futebol/",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36",
};

const tz = new Date().getTimezoneOffset();
const today = (() => new Date(Date.now() - tz * 60_000).toISOString().slice(0, 10))();
const date = process.argv[2] || today;

async function get(path) {
  const t0 = Date.now();
  const res = await fetch(BASE + path, { headers: H });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (!ct.includes("json")) throw new Error(`HTML inesperado (${text.length}B) em ${path}`);
  return { json: JSON.parse(text), ms: Date.now() - t0, bytes: Buffer.byteLength(text) };
}

const LABELS = {
  goals_over_under: "Total de gols",
  goals_over_under_1h: "Gols 1º tempo",
  goals_over_under_2h: "Gols 2º tempo",
  btts: "Ambas marcam",
  corners_over_under: "Total de cantos",
  home_corners_over_under: "Cantos mandante",
  away_corners_over_under: "Cantos visitante",
  cards_over_under: "Cartões",
  home_team_total_goals: "Gols mandante",
  away_team_total_goals: "Gols visitante",
};
const label = (m) => LABELS[m] ?? m.replace(/_/g, " ");
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function rateFromBits(bits) {
  let hits = 0, ev = 0;
  for (const ch of bits) {
    if (ch === "1") { hits++; ev++; }
    else if (ch === "0") { ev++; }
  }
  return { rate: ev > 0 ? Math.round((hits / ev) * 1000) / 10 : null, hits, eval: ev };
}

function group(m) {
  if (m.startsWith("player_") || m === "anytime_goal_scorer" || m === "first_goal_scorer") return "jogador";
  if (m.includes("corner")) return "cantos";
  if (m.includes("card")) return "cartoes";
  if (m.includes("goal") || m === "btts") return "gols";
  return "outros";
}

function flatten(raw) {
  const out = [];
  for (const prop of raw.props ?? []) {
    const fx = raw.fixtures[prop.f];
    if (!fx) continue;
    const ro = prop.o != null ? raw.owners[prop.o] : null;
    const owner = ro && ro.id && ro.name ? ro : null;
    let best = null, bestRate = -1, bestPrice = -1;
    for (const ln of prop.l ?? []) {
      if (!Array.isArray(ln) || ln.length < 7) continue;
      const r = rateFromBits(typeof ln[6] === "string" ? ln[6] : "").rate ?? -1;
      const p = isNum(ln[3]) ? ln[3] : -1;
      if (r > bestRate || (r === bestRate && p > bestPrice)) { bestRate = r; bestPrice = p; best = ln; }
    }
    if (!best) continue;
    const bits = typeof best[6] === "string" ? best[6] : "";
    const r10 = rateFromBits(bits);
    const r5 = rateFromBits(bits.slice(-5));
    const sznEval = isNum(best[13]) ? best[13] : null;
    const sznHits = isNum(best[12]) ? best[12] : null;
    const szn = sznHits != null && sznEval ? Math.round((sznHits / sznEval) * 1000) / 10 : null;
    const g = group(prop.m);
    const l10 = r10.rate ?? 0, l5 = r5.rate ?? l10, s = szn ?? l10;
    const accuracy = l10 * 0.5 + l5 * 0.35 + s * 0.15;
    const odd = isNum(best[3]) && best[3] > 0 ? best[3] : 1.2;
    const oddFactor = 1 + Math.max(0, Math.min(0.15, (odd - 1.2) * 0.188));
    const conf = Math.min(1, 0.7 + (Math.min(r10.eval, 10) / 10) * 0.3);
    out.push({
      market: prop.m, marketLabel: label(prop.m), group: g,
      selection: best[2] === 1 ? "Over" : "Under",
      league: fx.leagueName,
      fixture: `${fx.home.name} x ${fx.away.name}`,
      subject: owner?.name ?? `${fx.home.name} x ${fx.away.name}`,
      kind: owner ? "player" : "team",
      line: isNum(best[1]) ? best[1] : null,
      odd: isNum(best[3]) ? best[3] : null,
      l5: r5.rate, l10: r10.rate, szn,
      eval10: r10.eval,
      score: Math.round((accuracy * oddFactor * conf + (g === "jogador" ? 1.5 : 0)) * 10) / 10,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

let fail = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
  if (!cond) fail++;
};
const bar = (p) => {
  const n = Math.round((p ?? 0) / 10);
  return "█".repeat(n).padEnd(10, "·");
};
const kb = (b) => (b / 1024).toFixed(0) + "KB";

console.log(`\n=== GameRead — teste real (${date}, tz=${tz}) ===\n`);

/* 1. Jogos do dia */
const fx = await get(`/fixtures/day?date=${date}&tzOffsetMinutes=${tz}`);
const nFx = (fx.json ?? []).reduce((a, g) => a + (g.fixtures?.length ?? 0), 0);
check("GET /v1/fixtures/day", Array.isArray(fx.json) && nFx > 0,
  `${nFx} jogos em ${fx.json.length} ligas · ${kb(fx.bytes)} · ${fx.ms}ms`);

/* 2. Props radar */
const pr = await get(`/props-radar/compact?date=${date}&tzOffsetMinutes=${tz}`);
const raw = pr.json;
check("GET /v1/props-radar/compact", Array.isArray(raw.props) && raw.props.length > 0,
  `${raw.props.length} props brutas · ${kb(pr.bytes)} · ${pr.ms}ms`);

const rows = flatten(raw);
check("decoder → props publicáveis", rows.length > 0, `${rows.length} linhas`);
check("ordenação por score desc", rows.every((r, i) => i === 0 || rows[i - 1].score >= r.score));
check("hit rates em 0..100", rows.every((r) => r.l10 === null || (r.l10 >= 0 && r.l10 <= 100)));
check("amostra L10 válida", rows.filter((r) => r.eval10 > 0).length > 0,
  `${rows.filter((r) => r.eval10 > 0).length} com histórico`);

const players = rows.filter((r) => r.kind === "player").length;
const teams = rows.length - players;
check("props de jogador detectadas", players > 0, `${players} jogador / ${teams} time`);

/* 3. Top oportunidades */
console.log(`\n--- TOP 15 OPORTUNIDADES ---`);
console.log("score  L10        L5   sel    mercado".padEnd(48) + "linha @odd   jogador / jogo");
for (const r of rows.slice(0, 15)) {
  console.log(
    String(r.score.toFixed(1)).padStart(5) + "  " + bar(r.l10).padEnd(11) +
    String(r.l5 ?? "-").padStart(4) + " " + r.selection.padEnd(5) + " " +
    r.marketLabel.slice(0, 17).padEnd(18) +
    `L${r.line ?? "-"} @${r.odd ?? "-"}`.padEnd(11) +
    `${r.kind === "player" ? "👤 " : "🏳 "}${r.subject.slice(0, 30)}`,
  );
}

/* 4. Distribuição por grupo */
const byGroup = {};
for (const r of rows) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
console.log("\n--- por grupo ---");
for (const [k, v] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${k.padEnd(9)} ${String(v).padStart(5)}`);
}

/* 5. Linhas de um jogo cheio */
const fid = raw.fixtures?.[0]?.id;
if (fid) {
  const ln = await get(`/fixtures/${fid}/lines`);
  const items = ln.json.items ?? [];
  check("GET /v1/fixtures/{id}/lines", items.length > 0, `${items.length} linhas · ${kb(ln.bytes)} · ${ln.ms}ms`);
  check("linhas com hitRateL10", items.some((i) => i.hitRateL10 != null),
    `${items.filter((i) => i.hitRateL10 != null).length}/${items.length}`);
  const m = {};
  for (const i of items) m[i.market] = (m[i.market] ?? 0) + 1;
  console.log("   ↳ mercados:", Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}(${v})`).join(", "));
}

console.log(`\n${fail === 0 ? "✅ TODOS OS TESTES PASSARAM" : `❌ ${fail} falha(s)`}\n`);
process.exit(fail === 0 ? 0 : 1);
