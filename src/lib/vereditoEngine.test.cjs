const assert = require("assert");
const {
  vereditar,
  alertasVeredito,
  EV_ALERTA_VEREDITO,
  PESO_FORMA_VEREDITO,
  PESO_H2H_VEREDITO,
  MIN_JOGOS_VEREDITO,
} = require("./vereditoEngine.js");

/* HistGame mínimo: o motor só usa gf, ga, res, xgEst, amarelos e afins. */
let seq = 0;
const jogo = (opts) => ({
  id: `g${++seq}`,
  date: opts.date ?? "2026-05-01",
  league: "bra.1",
  home: opts.home ?? true,
  opp: { id: "x", name: "Adversário", short: "ADV", logo: "" },
  gf: opts.gf,
  ga: opts.ga,
  res: opts.gf > opts.ga ? "V" : opts.gf === opts.ga ? "E" : "D",
  htGf: null,
  htGa: null,
  corners: opts.corners ?? null,
  fouls: opts.fouls ?? null,
  yellow: opts.yellow ?? null,
  red: opts.red ?? null,
  offsides: null,
  sot: null,
  shots: null,
  poss: null,
  xgEst: null,
  oppCorners: opts.oppCorners ?? null,
  oppSot: null,
  oppFouls: null,
  oppYellow: opts.oppYellow ?? null,
  oppXgEst: null,
});

/* ---------- sem base → null ---------- */
assert.strictEqual(vereditar({ homeGames: [], awayGames: [], h2hGames: [] }), null);
assert.strictEqual(vereditar({ homeGames: [jogo({ gf: 1, ga: 0 })], awayGames: [jogo({ gf: 0, ga: 1 })], h2hGames: [] }), null);
assert.strictEqual(MIN_JOGOS_VEREDITO, 3);
assert.strictEqual(PESO_FORMA_VEREDITO, 0.7);
assert.strictEqual(PESO_H2H_VEREDITO, 0.3);

/* ---------- mandante forte × visitante fraco ---------- */
const casaForte = [
  jogo({ gf: 3, ga: 0, home: true, yellow: 2, oppYellow: 3 }),
  jogo({ gf: 2, ga: 1, home: true, yellow: 1, oppYellow: 2 }),
  jogo({ gf: 4, ga: 1, home: true, yellow: 3, oppYellow: 1 }),
  jogo({ gf: 2, ga: 0, home: true, yellow: 2, oppYellow: 2 }),
  jogo({ gf: 1, ga: 1, home: false, yellow: 2, oppYellow: 4 }),
];
const foraFraca = [
  jogo({ gf: 0, ga: 2, home: false }),
  jogo({ gf: 1, ga: 3, home: false }),
  jogo({ gf: 0, ga: 1, home: false }),
  jogo({ gf: 1, ga: 2, home: false }),
  jogo({ gf: 0, ga: 2, home: false }),
];
const ver = vereditar({ homeGames: casaForte, awayGames: foraFraca, h2hGames: [] });
assert.ok(ver);
// sem H2H o peso da forma vai 100% — nada é inventado no lugar do histórico
assert.strictEqual(ver.base.pesoH2H, 0);
assert.strictEqual(ver.base.pesoForma, 1);
assert.strictEqual(ver.base.jogosCasa, 5);
assert.strictEqual(ver.base.jogosFora, 5);
assert.strictEqual(ver.base.jogosH2H, 0);

// mandante atacando muito contra defesa vazada → mandante favorito
assert.ok(ver.probs.home > ver.probs.away, "mandante deveria ser favorito");
assert.ok(ver.probs.home > ver.probs.draw);
// soma dos três resultados = 1
assert.ok(Math.abs(ver.probs.home + ver.probs.draw + ver.probs.away - 1) < 1e-6);
// Under é complemento exato do Over
assert.ok(Math.abs(ver.probs.over25 + ver.probs.under25 - 1) < 1e-9);
// λ coerente com o volume de gols
assert.ok(ver.lambdas.casa > 1.5 && ver.lambdas.casa <= 4.5);
assert.ok(ver.lambdas.fora > 0.3 && ver.lambdas.fora < ver.lambdas.casa);

/* ---------- cartões: conta média real e Over ---------- */
assert.ok(ver.cartoes, "com amarelos no histórico o bloco de cartões existe");
assert.strictEqual(ver.cartoes.amostra, 1); // só o mandante tem cartões nos dados
assert.ok(ver.cartoes.media > 0);
assert.ok(ver.cartoes.over35 >= 0 && ver.cartoes.over35 <= 1);
assert.ok(ver.cartoes.over45 < ver.cartoes.over35, "linha maior tem prob menor");

// sem cartões na fonte → null (regra de ouro)
const semCartoes = vereditar({
  homeGames: casaForte.map((g) => ({ ...g, yellow: null, red: null, oppYellow: null })),
  awayGames: foraFraca,
  h2hGames: [],
});
assert.strictEqual(semCartoes.cartoes, null);

/* ---------- H2H entra com 30% e move o λ ---------- */
const h2hGoleada = [
  { golsCasa: 3, golsFora: 2 },
  { golsCasa: 2, golsFora: 2 },
  { golsCasa: 3, golsFora: 1 },
  { golsCasa: 2, golsFora: 3 },
];
const comH2H = vereditar({ homeGames: casaForte, awayGames: foraFraca, h2hGames: h2hGoleada });
assert.ok(comH2H);
assert.strictEqual(comH2H.base.pesoH2H, 0.3);
assert.strictEqual(comH2H.base.pesoForma, 0.7);
assert.strictEqual(comH2H.base.jogosH2H, 4);
// H2H com muitos gols (média 4.5) reduz o Under em relação à forma isolada?
assert.notStrictEqual(comH2H.lambdas.casa, ver.lambdas.casa);
// texto cita os pesos usados
assert.ok(comH2H.texto.includes("70%"));
assert.ok(comH2H.texto.includes("30%"));
assert.ok(!comH2H.texto.includes("NaN"));

/* ---------- confiança ---------- */
// 5 jogos por lado e H2H → no máximo média
assert.ok(["alta", "media"].includes(comH2H.confianca));
// amostra curta (3 jogos) cai para baixa/media, nunca alta
const curto = vereditar({
  homeGames: casaForte.slice(0, 3),
  awayGames: foraFraca.slice(0, 3),
  h2hGames: [],
});
assert.notStrictEqual(curto.confianca, "alta");
assert.ok(curto.motivoConfianca.length > 0);

/* ---------- alertas de divergência (EV ≥ 10%) ---------- */
assert.strictEqual(EV_ALERTA_VEREDITO, 10);
assert.deepStrictEqual(alertasVeredito(null, { home: 2 }), []);
assert.deepStrictEqual(alertasVeredito(comH2H, null), []);

// prob alta com odd alta = EV grande → alerta
const fake = { ...comH2H, probs: { home: 0.55, draw: 0.25, away: 0.2, over25: 0.6, under25: 0.4, btts: 0.62 } };
const alertas = alertasVeredito(fake, { home: 1.5, draw: 3.4, away: 5.0, over: 2.1, btts: 1.9 });
// home 0.55×1.5=0.825 (-17.5) fora; draw 0.25×3.4=0.85 fora; away 0.2×5=1.0 (0) fora
// over 0.6×2.1=1.26 (+26%) dentro; btts 0.62×1.9=1.178 (+17.8%) dentro
assert.strictEqual(alertas.length, 2);
assert.strictEqual(alertas[0].mercado, "over25");
assert.strictEqual(alertas[1].mercado, "btts");
assert.ok(alertas[0].evPct >= 10);
assert.strictEqual(alertas[0].odd, 2.1);
// todas as linhas retornadas passam do corte
assert.ok(alertas.every((a) => a.evPct >= EV_ALERTA_VEREDITO));

// odds inválidas não geram alerta
assert.deepStrictEqual(alertasVeredito(fake, { home: 1, draw: 0, away: null }), []);

/* ---------- Fator Fadiga ---------- */
const comData = (dias) =>
  Array.from({ length: 6 }, (_, i) =>
    jogo({ gf: 2, ga: 1, home: i % 2 === 0, date: new Date(Date.UTC(2026, 4, 20 - dias - i * 3)).toISOString() }),
  );
const ref = new Date(Date.UTC(2026, 4, 20)).toISOString();

// mandante jogou há 3 dias, visitante há 7 -> alerta do mandante? (3 < 7 => visitante descansou)
const fadigaAssimetrica = vereditar({
  homeGames: comData(3),
  awayGames: comData(7),
  h2hGames: [],
  dataJogo: ref,
});
assert.ok(fadigaAssimetrica, "veredito com fadiga deve existir");
assert.strictEqual(fadigaAssimetrica.fadiga.casaDias, 3);
assert.strictEqual(fadigaAssimetrica.fadiga.foraDias, 7);
assert.strictEqual(fadigaAssimetrica.fadiga.maisDescansado, "fora", "7 dias de descanso é o lado mais descansado");
assert.ok(/Fator Fadiga/.test(fadigaAssimetrica.fadiga.alerta));
assert.ok(/visitante/.test(fadigaAssimetrica.fadiga.alerta));

// diferença de 1 dia é calendário, não fadiga -> sem alerta
const fadigaIgual = vereditar({
  homeGames: comData(3),
  awayGames: comData(4),
  h2hGames: [],
  dataJogo: ref,
});
assert.strictEqual(fadigaIgual.fadiga.diferenca, 1);
assert.strictEqual(fadigaIgual.fadiga.maisDescansado, null);
assert.strictEqual(fadigaIgual.fadiga.alerta, null);

// lados trocados: mandante mais descansado
const fadigaCasa = vereditar({
  homeGames: comData(8),
  awayGames: comData(2),
  h2hGames: [],
  dataJogo: ref,
});
assert.strictEqual(fadigaCasa.fadiga.maisDescansado, "casa");
assert.ok(/mandante/.test(fadigaCasa.fadiga.alerta));

// sem data no histórico -> fadiga nula, veredito continua funcionando
const semData = vereditar({
  homeGames: comData(3).map((g) => ({ ...g, date: "" })),
  awayGames: comData(3).map((g) => ({ ...g, date: "" })),
  h2hGames: [],
  dataJogo: ref,
});
assert.strictEqual(semData.fadiga.alerta, null);
assert.strictEqual(semData.fadiga.maisDescansado, null);

console.log(
  `✅ vereditoEngine ok — casa ${(comH2H.probs.home * 100).toFixed(1)}% / empate ${(comH2H.probs.draw * 100).toFixed(1)}% / fora ${(comH2H.probs.away * 100).toFixed(1)}% · over2.5 ${(comH2H.probs.over25 * 100).toFixed(1)}% · btts ${(comH2H.probs.btts * 100).toFixed(1)}% · confiança ${comH2H.confianca} · alertas ${alertas.length}`,
);
