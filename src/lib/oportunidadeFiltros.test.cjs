/* Suíte: piso de 70%, Score Composto e chips rápidos. */
const F = require("./oportunidadeFiltros.js");

let falhas = 0;
function ok(nome, cond, extra) {
  if (cond) return;
  falhas++;
  console.error("FALHOU:", nome, extra === undefined ? "" : JSON.stringify(extra));
}
const perto = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

// ---------- Score Composto ----------
// 74% de prob, EV 12,4%, TRUST 7,5 -> 37 + 3,72 + 15 = 55,7
const op = { probModelo: 0.74, evPct: 12.4, trust: 7.5, odd: 1.8 };
ok("score exato", perto(F.calcularScoreFinal(op), 55.7), F.calcularScoreFinal(op));

// prob 90% + EV 25% + trust 10 = 45 + 7,5 + 20 = 72,5
ok(
  "score do teto realista",
  perto(F.calcularScoreFinal({ probModelo: 0.9, evPct: 25, trust: 10, odd: 1.5 }), 72.5),
  F.calcularScoreFinal({ probModelo: 0.9, evPct: 25, trust: 10, odd: 1.5 }),
);

// EV negativo não gera score negativo (piso 0 no termo de EV)
ok(
  "EV negativo não subtrai",
  perto(F.calcularScoreFinal({ probModelo: 0.8, evPct: -30, trust: 5, odd: 2 }), 50),
  F.calcularScoreFinal({ probModelo: 0.8, evPct: -30, trust: 5, odd: 2 }),
);

// EV absurdo não estoura o score (teto de 40 pontos de EV)
ok(
  "EV 300% tem teto",
  perto(F.calcularScoreFinal({ probModelo: 1, evPct: 300, trust: 10, odd: 2 }), 50 + 12 + 20),
  F.calcularScoreFinal({ probModelo: 1, evPct: 300, trust: 10, odd: 2 }),
);

// trust null conta como 0, nunca quebra
ok("trust null = 0", perto(F.calcularScoreFinal({ probModelo: 0.8, evPct: 10, trust: null, odd: 1.5 }), 43), F.calcularScoreFinal({ probModelo: 0.8, evPct: 10, trust: null, odd: 1.5 }));
ok("score nunca passa de 100", F.calcularScoreFinal({ probModelo: 1, evPct: 40, trust: 10, odd: 1.2 }) <= 100);

// ---------- Piso de 75% ----------
const lista = [
  { probModelo: 0.82, evPct: 18, trust: 8, odd: 1.55 },
  { probModelo: 0.75, evPct: 6, trust: 6, odd: 2.6 },
  { probModelo: 0.54, evPct: 22, trust: 7, odd: 2.9 },
  { probModelo: 0.66, evPct: 3, trust: 4, odd: 1.4 },
];
ok("piso oculta < 75%", F.filtrarOportunidades(lista).length === 2, F.filtrarOportunidades(lista).length);
ok("mostrar tudo", F.filtrarOportunidades(lista, { mostrarAbaixoDe70: true }).length === 4);
ok("contagem de ocultas", F.contarOcultasPeloPiso(lista) === 2, F.contarOcultasPeloPiso(lista));
ok("limite exato 75% passa", F.passaPiso({ probModelo: 0.75, evPct: 0, trust: 0, odd: 2 }, false) === true);
ok("74,9% é barrado", F.passaPiso({ probModelo: 0.749, evPct: 0, trust: 0, odd: 2 }, false) === false);
ok("piso exposto = 0.75", F.LIMIAR_PROB === 0.75, F.LIMIAR_PROB);

// ---------- Chips ----------
ok("chip elite", F.passaChip({ probModelo: 0.9, evPct: 25, trust: 10, odd: 1.5 }, "elite") === true);
ok("elite pega score 55,7? não", F.passaChip(op, "elite") === false);
ok("chip alto EV", F.passaChip({ probModelo: 0.5, evPct: 15, trust: 0, odd: 3 }, "altoEv") === true);
ok("alto EV barra 14,9", F.passaChip({ probModelo: 0.5, evPct: 14.9, trust: 0, odd: 3 }, "altoEv") === false);
ok("chip favoritos", F.passaChip({ probModelo: 0.6, evPct: 2, trust: 3, odd: 1.59 }, "favoritos") === true);
ok("favoritos barra 1,60", F.passaChip({ probModelo: 0.6, evPct: 2, trust: 3, odd: 1.6 }, "favoritos") === false);
ok("favoritos barra odd inválida", F.passaChip({ probModelo: 0.6, evPct: 2, trust: 3, odd: 1 }, "favoritos") === false);
ok("chip bombas", F.passaChip({ probModelo: 0.3, evPct: 2, trust: 3, odd: 3.1 }, "bombas") === true);
ok("bombas barra 2,50", F.passaChip({ probModelo: 0.3, evPct: 2, trust: 3, odd: 2.5 }, "bombas") === false);

// chips são OR
// Com o piso ligado só sobra o item de 82% (os outros dois bons caem em 54%/66%).
ok(
  "chips em OR respeitam o piso",
  F.filtrarOportunidades(lista, { chips: ["altoEv", "favoritos"] }).length === 1,
  F.filtrarOportunidades(lista, { chips: ["altoEv", "favoritos"] }).length,
);
// Sem o piso, o OR pega os três que batem em algum chip: 82%/18%, 54%/22% e 66%/odd 1,40.
ok(
  "chips em OR somam itens de chips diferentes",
  F.filtrarOportunidades(lista, { mostrarAbaixoDe70: true, chips: ["altoEv", "favoritos"] }).length === 3,
  F.filtrarOportunidades(lista, { mostrarAbaixoDe70: true, chips: ["altoEv", "favoritos"] }).length,
);
ok("sem chip = tudo", F.filtrarOportunidades(lista, { chips: [] }).length === 2);

// contadores
const cont = F.contarPorChip(lista);
ok("contagem elite", cont.elite === 0, cont);
ok("contagem altoEv", cont.altoEv === 2, cont);
ok("contagem favoritos", cont.favoritos === 2, cont);
ok("contagem bombas", cont.bombas === 2, cont);

if (falhas === 0) console.log("oportunidadeFiltros: OK");
else process.exit(1);
