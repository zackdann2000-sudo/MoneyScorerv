/**
 * Teste do parser do NerdyTips — fixtures EXTRAÍDAS do site real (sem rede).
 *
 * Os valores esperados abaixo foram conferidos na mão no HTML salvo: são os
 * mesmos números que o site mostra na tela. Se o site mudar o markup, o teste
 * quebra aqui antes de quebrar a tela do usuário.
 *
 * Rodar:
 *   npx tsc src/lib/nerdytips/fonte.ts --target es2022 --module commonjs \
 *     --outDir .ntbuild --skipLibCheck
 *   cp -r src/lib/nerdytips/__fixtures__ .ntbuild/ && \
 *   cp src/lib/nerdytips/fonte.test.cjs .ntbuild/ && node .ntbuild/fonte.test.cjs
 */
const fs = require("fs");
const path = require("path");
const F = require("./fonte.js");

let falhas = 0;
function check(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) {
    falhas++;
    console.log(`❌ ${nome}\n   obtido:   ${JSON.stringify(obtido)}\n   esperado: ${JSON.stringify(esperado)}`);
  } else {
    console.log(`✅ ${nome}`);
  }
}
const fx = (n) => fs.readFileSync(path.join(__dirname, "__fixtures__", n), "utf8");

/* ---------------------------- helpers ---------------------------- */
console.log("\n=== 1. Texto e traduções ===");
check("decodifica entidades", F.decodificar("a &amp; b &#039;c&#039;"), "a & b 'c'");
check("texto tira tag e espaça", F.texto("<b>oi</b>\n  <i>tudo</i> bem"), "oi tudo bem");
check("numero com seta", F.numero("▲ 2.80"), 2.8);
check("traduz pick 1X2", F.traduzirPick("2"), "Fora");
check("traduz under", F.traduzirPick("U2.5"), "Menos de 2,5 gols");
check("traduz over", F.traduzirPick("O3.5"), "Mais de 3,5 gols");
check("traduz under por extenso", F.traduzirPick("Under 2.5"), "Menos de 2,5 gols");
check("traduz combinada", F.traduzirPick("X2 & Under 3.5"), "Empate ou fora e Menos de 3,5 gols");
check("traduz placar", F.traduzirPick("1–1"), "Placar 1–1");
check("traduz btts", F.traduzirPick("No"), "Não");
check("traduz descrição", F.traduzirDescricao("away team wins"), "Vitória do visitante");

/* ----------------------------- board ----------------------------- */
console.log("\n=== 2. Board de palpites ===");
const b = F.parseBoard(fx("mock-board.html"));
check("3 jogos", b.jogos.length, 3);
check("agrupou 2 competições", b.ligas, [
  { nome: "Africa Cup of Nations - Qualification", jogos: 2 },
  { nome: "EFL Trophy", jogos: 1 },
]);

const j0 = b.jogos[0];
check("id", j0.id, "1340351");
check("slug", j0.slug, "ethiopia-vs-mozambique-prediction-1340351");
check("times", [j0.casa, j0.fora], ["Ethiopia", "Mozambique"]);
check("odds 1x2", j0.odds, { casa: 2.8, empate: 2.75, fora: 3.1 });
check("placar final", j0.placar, { casa: 0, fora: 1 });
check("status", j0.status, "won");
check("pick 1x2 + odd + confiança", [j0.pick1x2.rotulo, j0.pick1x2.odd, j0.pick1x2.confianca], ["2", 3.1, 2.8]);
check("pick gols", [j0.pickGols.rotulo, j0.pickGols.odd], ["U2.5", 1.45]);
check("pick btts", [j0.pickBtts.rotulo, j0.pickBtts.odd], ["No", 1.7]);
check("melhor palpite", [j0.melhor.rotulo, j0.melhor.odd, j0.melhor.confianca], ["U2.5", 1.45, 4.7]);
check("logo do mandante", j0.logos[0].endsWith("/1506.webp?width=48"), true);

const j1 = b.jogos[1];
check("segundo jogo", [j1.casa, j1.fora, j1.status], ["Mauritania", "Burkina Faso", "lost"]);
check("terceiro jogo é de outra liga", [b.jogos[2].liga, b.jogos[2].pick1x2.rotulo], ["EFL Trophy", "1"]);

/* --------------------------- partida ----------------------------- */
console.log("\n=== 3. Partida (match-details) ===");
const p = F.parsePartida(fx("mock-partida.html"));
check("id da partida", p.id, "1340351");
check("times do título", [p.casa, p.fora], ["Ethiopia", "Mozambique"]);
check("competição", p.liga, "Africa Cup of Nations - Qualification");
check("placar", p.placar, { casa: 0, fora: 1 });
check("encerrado", p.encerrado, true);
check("odds do topo", p.odds, { casa: 2.8, empate: 2.75, fora: 3.1 });
check("melhor palpite da página", [p.melhor.pick, p.melhor.odd, p.melhor.confianca], ["Under 2.5", 1.45, 4.7]);
check("6 cards de palpite", p.palpites.length, 6);
check(
  "rótulos dos cards",
  p.palpites.map((c) => c.rotulo),
  ["1x2 Tip", "Total Goals", "Both Teams To Score", "Bet Builder Tip", "Half-Time Score", "Correct Score"],
);
check("placar exato previsto", p.palpites[5].pick, "0–1");
check("placar do intervalo", p.palpites[4].pick, "0–0");
check("odd do bet builder", p.palpites[3].odd, 1.91);
check("9 linhas de estatística", p.stats.length, 9);
const xg = p.stats.find((s) => s.rotulo === "xG");
check("xG modelo", [xg.predCasa, xg.predFora], ["1.01", "1.04"]);
check("xG real", [xg.realCasa, xg.realFora], ["0.95", "0.99"]);
check("evento de gol", p.eventos.length, 1);
check("evento", [p.eventos[0].minuto, p.eventos[0].tipo, p.eventos[0].placar], ["38'", "gol", "0 – 1"]);
check("h2h", p.h2h, { total: 2, vitoriasCasa: 1, empates: 1, vitoriasFora: 0 });

/* -------------------------- progresso ---------------------------- */
console.log("\n=== 4. Desempenho público ===");
const pr = F.parseProgresso(fx("mock-progresso.html"));
check("4 KPIs", pr.kpis.length, 4);
check("primeiro KPI", pr.kpis[0], {
  valor: "66.7%",
  rotulo: "Overall",
  sub: "197,179 of 295,798 graded correctly",
});
check("KPI de bankers", pr.kpis[1].valor, "73.8%");
check("data da atualização", pr.atualizadoEm, "2026-11-16");
check("12 meses na tabela", pr.meses.length, 12);
check("mês mais recente", pr.meses[0], {
  mes: "November 2026",
  bankers: "80.3%",
  overall: "68.3%",
  bankersN: "137 banker picks",
  overallN: "4,569 predictions",
});

/* --------------------------- destaques --------------------------- */
console.log("\n=== 5. Bet of the day ===");
const d = F.parseDestaques(fx("mock-destaques.html"));
check("3 jogos no fixture", d.jogos.length, 3);
check("contador de bankers", d.bankers, 7);
check("próximos", d.proximos, 0);
check("acerto", d.acerto, "33%");
check("slip do dia", d.slip, { picks: 5, odd: 3.51 });

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
