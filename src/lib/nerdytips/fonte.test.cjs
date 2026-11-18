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
 *   mkdir -p .ntbuild/nerdytips && cp -r src/lib/nerdytips/__fixtures__ .ntbuild/nerdytips/ \
 *     && cp src/lib/nerdytips/fonte.test.cjs .ntbuild/nerdytips/ \
 *     && node .ntbuild/nerdytips/fonte.test.cjs
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

/* ---------------------- formato de odd ---------------------------- */
console.log("\n=== 6. Odd normalizada (decimal / americana / fracionária) ===");
check("decimal 2.80", F.odd("2.80"), 2.8);
check("decimal com seta para baixo", F.odd("\u25BC 2.80"), 2.8);
check("decimal com seta para cima", F.odd("\u25B2 3.10"), 3.1);
check("decimal com vírgula", F.odd("1,45"), 1.45);
// Requisição feita dos EUA: o site devolve americano. -222 -> 1 + 100/222.
check("americano -222", F.odd("-222"), 1.45);
check("americano -110", F.odd("-110"), 1.91);
check("americano +150", F.odd("+150"), 2.5);
check("americano +100", F.odd("100"), 2);
check("fracionário 1/2", F.odd("1/2"), 1.5);
check("fracionário 5/2", F.odd("5/2"), 3.5);
check("vazio", F.odd(""), null);
check("sem número", F.odd("\u2022\u2022\u2022"), null);
check("zero/negativo absurdo", F.odd("-0.5"), null);
check("decimal fora de faixa", F.odd("0.5"), null);
check("mesma odd nos três formatos", [F.odd("1.45"), F.odd("-222"), F.odd("9/20")], [1.45, 1.45, 1.45]);

/* ------------------- Bet Builder (free daily slip) ----------------- */
console.log("\n=== 7. Bet Builder / combinada ===");
const bb = F.parseCombinada(fx("mock-builder.html"));
check("rótulo", bb.rotulo, "Free daily slip");
check("3 picks", bb.picks, 3);
check("odd total publicada", bb.oddTotal, 2.26);
// Confere o total do site com o produto das odds das linhas.
check("produto das odds bate com o total", bb.oddCalculada, 2.26);
check("3 itens", bb.itens.length, 3);
check("limites do plano free", [bb.minTrust, bb.maxTrust, bb.lockMax], [30, 65, 2]);
check("gerador completo bloqueado", bb.bloqueado, true);

const bb0 = bb.itens[0];
check("item 1 data", bb0.data, "Wed, Nov 18 \u00b7 10:00");
check("item 1 país", bb0.ligaPais, "Uganda");
check("item 1 liga", bb0.ligaNome, "Premier League");
check("item 1 link da liga", bb0.ligaHref, "/football-predictions-for-premier-league-uganda");
check("item 1 times", [bb0.casa, bb0.fora], ["Mbarara City", "Lugazi"]);
check("item 1 palpite", [bb0.palpite, bb0.texto], ["U2.5", "Menos de 2,5 gols"]);
check("item 1 odd e confiança", [bb0.odd, bb0.confianca], [1.52, 6.4]);

const bb1 = bb.itens[1];
check("item 2 times", [bb1.casa, bb1.fora], ["Villa Valle", "Valenzana"]);
check("item 2 palpite", [bb1.palpite, bb1.texto], ["1X", "Casa ou empate"]);
check("item 2 odd e confiança", [bb1.odd, bb1.confianca], [1.21, 6.1]);

const bb2 = bb.itens[2];
check("item 3 liga", [bb2.ligaPais, bb2.ligaNome], ["Egypt", "Cup"]);
check("item 3 times", [bb2.casa, bb2.fora], ["El Gouna", "Al Ittihad (Egy)"]);
check("item 3 palpite", [bb2.palpite, bb2.texto], ["X2", "Empate ou fora"]);
check("item 3 odd e confiança", [bb2.odd, bb2.confianca], [1.23, 6.3]);

// Página sem o bloco (ex.: dia sem slip) não pode explodir.
const vazio = F.parseCombinada("<html><body>nada aqui</body></html>");
check("sem slip: 0 itens", vazio.itens.length, 0);
check("sem slip: odd nula", vazio.oddTotal, null);
check("sem slip: não inventa total", vazio.oddCalculada, null);

// Odd total em formato americano (o site responde assim para IP dos EUA).
const usHtml = fx("mock-builder.html").replace(">2.26<", ">-222<");
check("total em formato americano", F.parseCombinada(usHtml).oddTotal, 1.45);

/* ------------- traduções que o Bet Builder usa ------------- */
console.log("\n=== 8. Traduções do builder ===");
check("BTTS", F.traduzirPick("BTTS"), "Ambas marcam");
check("BTTS em minúsculas", F.traduzirPick("btts"), "Ambas marcam");
check("BTTS Yes", F.traduzirPick("BTTS Yes"), "Ambas marcam");
check("1X", F.traduzirPick("1X"), "Casa ou empate");
check("X2", F.traduzirPick("X2"), "Empate ou fora");
check("U2.5", F.traduzirPick("U2.5"), "Menos de 2,5 gols");
check("O3.5", F.traduzirPick("O3.5"), "Mais de 3,5 gols");
check("rótulo desconhecido passa igual", F.traduzirPick("AS2+"), "Visitante faz 2+");

/* ------------ odds da lista (bug de producao: americano) ------------ */
console.log("\n=== 9. Odds do board em formato americano ===");
// No fixture a seta vem como entidade (&\#9662;) e a odd em decimal; aqui
// trocamos pelo mesmo markup devolvido para um IP dos EUA.
const seta = '<span class="tb-arrow is-down">&#9662;</span>';
const boardUs = fx("mock-board.html").replace(
  `data-tt="Odd for Home Win">${seta}2.80`,
  `data-tt="Odd for Home Win">${seta}-149`,
);
const usBoard = F.parseBoard(boardUs);
check("1X2 casa em americano virou decimal", usBoard.jogos[0].odds.casa, 1.67);
const oddsNegativas = usBoard.jogos
  .flatMap((j) => [j.odds.casa, j.odds.empate, j.odds.fora])
  .filter((v) => v != null && v < 1.01);
check("nenhuma odd abaixo de 1.01 no board", oddsNegativas.length, 0);

/* ------------- Bet of the Day travado + board publico ------------- */
console.log("\n=== 10. Destaques com palpites travados ===");
const jogoBase = {
  liga: "Teste", logos: [null, null], hora: "16:00", kickoff: "16:00", placar: null,
  status: "pending", pick1x2: null, pickGols: null, pickBtts: null, melhorTexto: null,
  placarExato: null,
};
const botdTravado = {
  jogos: [
    { ...jogoBase, id: "999", casa: "Coritiba", fora: "Santos",
      odds: { casa: 3.45, empate: 3.1, fora: 2.05 }, melhor: null },
  ],
  ligas: [], geradoEm: "", bankers: 7, proximos: 0, acerto: "43%",
  slip: { picks: 5, odd: 3.51 },
};
const publico = {
  jogos: [
    { ...jogoBase, id: "999", casa: "Coritiba", fora: "Santos",
      odds: { casa: 3.45, empate: 3.1, fora: 2.05 },
      melhor: { rotulo: "U2.5", texto: "Menos de 2,5 gols", odd: 1.29, confianca: 6.8, pct: 68, resultado: "pending" } },
    { ...jogoBase, id: "1000", casa: "Flamengo", fora: "Vasco", hora: "18:00",
      odds: { casa: 1.8, empate: 3.4, fora: 4.2 },
      melhor: { rotulo: "1", texto: "Casa", odd: 1.8, confianca: 7.1, pct: 71, resultado: "pending" } },
  ],
  ligas: [], geradoEm: "",
};
const mesclado = F.mesclarDestaques(botdTravado, publico);
check("travado: usa o board publico", mesclado.fontePalpites, "boards");
check("travado: cards com palpite", mesclado.jogos.every((j) => j.melhor != null), true);
check("travado: manteve odds 1X2 do bet-of-the-day", mesclado.jogos[0].odds.fora, 2.05);
check("travado: odd do palpite do board", mesclado.jogos[0].melhor.odd, 1.29);
check("travado: soma jogos que so existem no board", mesclado.jogos.length, 2);
check("contadores continuam do site", [mesclado.bankers, mesclado.slip.odd], [7, 3.51]);

const liberado = { ...botdTravado, jogos: publico.jogos };
check("liberado: fonte site", F.mesclarDestaques(liberado, publico).fontePalpites, "site");
check("liberado: mesmos jogos", F.mesclarDestaques(liberado, publico).jogos.length, 2);
check("sem board e travado: 0 cards", F.mesclarDestaques(botdTravado, { jogos: [], ligas: [], geradoEm: "" }).jogos.length, 1);

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
