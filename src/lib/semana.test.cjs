/* Suíte: barra de 7 dias (Segunda → Domingo). */
const { diasDaSemana, shiftYmd, indiceDaSemana, rotuloData, mesmaJanela } = require("./semana.js");

let falhas = 0;
function ok(nome, cond, extra) {
  if (cond) return;
  falhas++;
  console.error("FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra));
}

// 2026-11-18 é uma quarta-feira (UTC) — semana Seg 16 → Dom 22.
const semana = diasDaSemana("2026-11-18", "2026-11-18");
ok("7 dias", semana.length === 7, semana.length);
ok("primeiro é segunda", semana[0].ymd === "2026-11-16", semana[0].ymd);
ok("último é domingo", semana[6].ymd === "2026-11-22", semana[6].ymd);
ok(
  "rótulos SEG..DOM",
  semana.map((d) => d.rotulo).join(",") === "SEG,TER,QUA,QUI,SEX,SÁB,DOM",
  semana.map((d) => d.rotulo),
);
ok("marca hoje", semana.filter((d) => d.hoje).length === 1 && semana[2].hoje === true, semana.map((d) => d.hoje));
ok("dia/mês com 2 dígitos", semana[0].dia === "16" && semana[0].mes === "11", [semana[0].dia, semana[0].mes]);

// Domingo pertence à semana que começou na segunda anterior (não abre semana nova).
const domingo = diasDaSemana("2026-11-22", "2026-11-22");
ok("domingo fecha a própria semana", domingo[0].ymd === "2026-11-16" && domingo[6].ymd === "2026-11-22", domingo[0].ymd);

// Segunda abre a semana exatamente nela.
const segunda = diasDaSemana("2026-11-16", "2026-11-16");
ok("segunda abre a semana", segunda[0].ymd === "2026-11-16", segunda[0].ymd);

// Virada de mês/ano continua somando 1 dia.
ok("vira o mês", shiftYmd("2026-11-30", 1) === "2026-12-01", shiftYmd("2026-11-30", 1));
ok("vira o ano", shiftYmd("2026-12-31", 1) === "2027-01-01", shiftYmd("2026-12-31", 1));
ok("volta o mês", shiftYmd("2026-12-01", -1) === "2026-11-30", shiftYmd("2026-12-01", -1));

ok("índice segunda = 0", indiceDaSemana("2026-11-16") === 0, indiceDaSemana("2026-11-16"));
ok("índice domingo = 6", indiceDaSemana("2026-11-22") === 6, indiceDaSemana("2026-11-22"));

ok("rótulo de data", rotuloData("2026-11-20") === "SEX 20/11", rotuloData("2026-11-20"));
ok("mesma janela", mesmaJanela("2026-11-18", "2026-11-21") === true);
ok("fora da janela", mesmaJanela("2026-11-18", "2026-11-25") === false);

if (falhas === 0) console.log("semana: OK");
else process.exit(1);
