/**
 * Teste do diff de alertas ao vivo (src/lib/alertDiff.ts).
 *
 * Cobre o que pode causar push errado em produção: gol não detectado, gol
 * duplicado, placar corrigido virando notificação e aviso indo para quem não
 * deu opt-in. Nenhum valor esperado vem da própria saída do código.
 *
 * Rodar:
 *   ./scripts/unit-tests.sh alertDiff
 */
const {
  lerSnapshot,
  detectarMudancas,
  chaveEvento,
  jaEnviado,
  marcarEnviado,
  podarEnviados,
  minutosAte,
  naJanelaKickoff,
  destinatarios,
  textoGol,
} = require("./alertDiff.js");

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) console.log(`✅ ${nome}`);
  else {
    falhas++;
    console.log(`❌ ${nome}${detalhe ? `\n   ${detalhe}` : ""}`);
  }
}

// ---------------------------------------------------------------- snapshot
ok("snap inválido (null) → null", lerSnapshot(null) === null);
ok("snap lixo ({}) → null", lerSnapshot({}) === null);
const snap = lerSnapshot({ h: 1, a: 0, estado: "in", min: 37 });
ok("snap válido é lido", snap && snap.h === 1 && snap.a === 0 && snap.estado === "in" && snap.min === 37);
ok("snap com decimal é truncado", lerSnapshot({ h: 1.9, a: 0, estado: "in" }).h === 1);

// ---------------------------------------------------------------- detecção
const pre = { h: 0, a: 0, estado: "pre" };
const live00 = { h: 0, a: 0, estado: "in" };
const live10 = { h: 1, a: 0, estado: "in" };
const live11 = { h: 1, a: 1, estado: "in" };
const post10 = { h: 1, a: 0, estado: "post" };

ok(
  "primeira vez que vê o jogo rolando → inicio",
  JSON.stringify(detectarMudancas(null, live00)) === JSON.stringify([{ tipo: "inicio" }]),
);
ok("primeira vez em jogo que não começou → nada", detectarMudancas(null, pre).length === 0);

const g1 = detectarMudancas(live00, live10);
ok("0-0 → 1-0 gera 1 gol do mandante", g1.length === 1 && g1[0].tipo === "gol" && g1[0].lado === "home");
ok("gol carrega o placar novo", g1[0].placar.h === 1 && g1[0].placar.a === 0);

const g2 = detectarMudancas(live10, live11);
ok("1-0 → 1-1 gera gol do visitante", g2.length === 1 && g2[0].lado === "away");

const g3 = detectarMudancas(live00, { h: 1, a: 1, estado: "in" });
ok("dois lados no mesmo ciclo → 2 eventos", g3.filter((m) => m.tipo === "gol").length === 2);

const g0 = detectarMudancas(live10, live00);
ok("placar que DIMINUI (correção da fonte) não gera gol", g0.filter((m) => m.tipo === "gol").length === 0);
ok("placar igual não gera nada", detectarMudancas(live10, { ...live10 }).length === 0);

const ini = detectarMudancas(pre, live00);
ok("pre → in avisa início", ini.some((m) => m.tipo === "inicio"));
const fim = detectarMudancas(live10, post10);
ok("in → post avisa fim", fim.some((m) => m.tipo === "fim"));
ok("pre → post não inventa início", detectarMudancas(pre, { h: 0, a: 0, estado: "post" }).length === 0);

// ---------------------------------------------------------------- dedupe
const k1 = chaveEvento("401", { tipo: "gol", lado: "home", placar: { h: 1, a: 0 } });
const k2 = chaveEvento("401", { tipo: "gol", lado: "home", placar: { h: 2, a: 0 } });
ok("chave muda com o placar (1-0 ≠ 2-0)", k1 !== k2, `${k1} vs ${k2}`);
ok("chave é estável para o mesmo evento", k1 === chaveEvento("401", { tipo: "gol", lado: "away", placar: { h: 1, a: 0 } }));
ok("chave inclui o jogo", k1.startsWith("401:gol:1-0"));

const enviados = marcarEnviado(undefined, k1, 1000);
ok("evento marcado é reconhecido", jaEnviado(enviados, k1) === true);
ok("evento diferente não é reconhecido", jaEnviado(enviados, k2) === false);
ok("marcarEnviado não muta o mapa antigo", Object.keys(enviados).length === 1 && !("__x" in enviados));
ok("mapa vazio/nulo não acusa envio", jaEnviado(null, k1) === false && jaEnviado({}, k1) === false);

const agora = 10 * 86_400_000;
const podado = podarEnviados({ velho: 1, novo: agora - 1000 }, agora);
ok("poda remove evento de 8 dias", !("velho" in podado));
ok("poda mantém evento recente", podado.novo === agora - 1000);

// ---------------------------------------------------------------- kickoff
const base = Date.parse("2026-11-23T20:00:00Z");
ok("minutosAte calcula 15 min", Math.abs(minutosAte("2026-11-23T20:00:00Z", base - 15 * 60000) - 15) < 0.01);
ok("minutosAte com data inválida → null", minutosAte("nada", base) === null);
ok("15 min antes → dentro da janela", naJanelaKickoff("2026-11-23T20:00:00Z", base - 15 * 60000) === true);
ok("14 min antes → dentro (tolerância ±2)", naJanelaKickoff("2026-11-23T20:00:00Z", base - 14 * 60000) === true);
ok("12 min antes → fora", naJanelaKickoff("2026-11-23T20:00:00Z", base - 12 * 60000) === false);
ok("20 min antes → fora", naJanelaKickoff("2026-11-23T20:00:00Z", base - 20 * 60000) === false);

// ----------------------------------------------------------- destinatários
const alvoGol = (matchId, times = ["10", "20"]) => ({ matchId, teamIds: times, tipo: "gol" });
const P = (userId, teamId, matchId, alerts) => ({ userId, teamId, matchId, alerts });

ok(
  "opt-in por time recebe o gol",
  destinatarios([P(1, "10", "", { gol: true })], alvoGol("999")).join(",") === "1",
);
ok(
  "quem não deu opt-in em gol não recebe",
  destinatarios([P(2, "10", "", { corners: true })], alvoGol("999")).length === 0,
);
ok(
  "opt-in só do time adversário recebe",
  destinatarios([P(3, "20", "", { gol: true })], alvoGol("999")).join(",") === "3",
);
ok(
  "time fora da partida não recebe",
  destinatarios([P(4, "30", "", { gol: true })], alvoGol("999")).length === 0,
);
ok(
  "opt-in no jogo específico recebe",
  destinatarios([P(5, "x", "999", { gol: true })], alvoGol("999")).join(",") === "5",
);
ok(
  "opt-in de jogo específico não vaza para outro jogo",
  destinatarios([P(6, "x", "111", { gol: true })], alvoGol("999")).length === 0,
);
ok(
  "curinga de time = todos os jogos",
  destinatarios([P(7, "*", "", { gol: true })], alvoGol("999")).join(",") === "7",
);
ok(
  "curinga com matchId preenchido não vira global",
  destinatarios([P(8, "*", "111", { gol: true })], alvoGol("999")).length === 0,
);
ok(
  "legado (goals) continua valendo",
  destinatarios([P(9, "10", "", { goals: true })], alvoGol("999")).join(",") === "9",
);
ok(
  "opt-in de kickoff não recebe gol",
  destinatarios([P(10, "10", "", { kickoff: true, matchStart: true })], alvoGol("999")).length === 0,
);
const alvoKick = { matchId: "999", teamIds: ["10", "20"], tipo: "kickoff" };
ok(
  "opt-in de kickoff recebe lembrete",
  destinatarios([P(11, "10", "", { kickoff: true })], alvoKick).join(",") === "11",
);
ok(
  "legado (matchStart) continua valendo",
  destinatarios([P(12, "20", "", { matchStart: true })], alvoKick).join(",") === "12",
);
const multi = destinatarios(
  [P(1, "10", "", { gol: true }), P(1, "20", "", { gol: true }), P(2, "10", "", { gol: true })],
  alvoGol("999"),
);
ok("mesmo usuário com 2 prefs não duplica", multi.length === 2, JSON.stringify(multi));

// ------------------------------------------------------------------ texto
const t = textoGol({ lado: "away", placar: { h: 1, a: 2 }, home: "Palmeiras", away: "Flamengo", minuto: 63 });
ok("texto do gol nomeia quem marcou", t.titulo.includes("FLAMENGO"));
ok("texto do gol traz placar e minuto", t.corpo.includes("1 × 2") && t.corpo.includes("63"));
const tSemMin = textoGol({ lado: "home", placar: { h: 1, a: 0 }, home: "Bahia", away: "Cuiabá" });
ok("sem minuto não inventa minuto", !tSemMin.corpo.includes("'") && tSemMin.corpo.includes("Bahia 1 × 0 Cuiabá"));

// ------------------------------------------------------------------ fim
console.log("");
if (falhas) {
  console.error(`❌ ${falhas} asserção(ões) falharam`);
  process.exit(1);
}
console.log("✅ alertDiff: todas as asserções passaram");
