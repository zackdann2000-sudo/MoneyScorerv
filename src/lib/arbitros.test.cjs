#!/usr/bin/env node
/**
 * Testes de src/lib/arbitros.ts — módulo ÁRBITROS (feature #5).
 *
 *   ./scripts/unit-tests.sh arbitros
 *
 * Cobre o que pode quebrar sem ninguém ver:
 *   1. normalização de nome e slug (só acento/caixa não duplica árbitro);
 *   2. média protegida (0 jogos = null, nunca 0 — não inventar número);
 *   3. agregado do feed vence a contagem própria, e a contagem própria entra
 *      quando o feed não existe;
 *   4. "próximo jogo" é futuro, não passado;
 *   5. ordenação com null no fim nas duas direções;
 *   6. filtros (busca, só com próximo jogo, amostra mínima);
 *   7. histórico e distribuição de cartões;
 *   8. dedupe de aparições (cron roda várias vezes por dia).
 */
const {
  normNome, slugArbitro, nomeDeSlug, media, arredondar,
  agregar, filtrarArbitros, historico, distribuicaoCartoes,
  resumoLista, semDuplicatas, MIN_AMOSTRA,
} = require("./arbitros.js");

let ok = 0;
const falhas = [];
function check(nome, r, e) {
  const a = JSON.stringify(r), b = JSON.stringify(e);
  if (a === b) { ok++; console.log(`✅ ${nome}`); }
  else { falhas.push(nome); console.log(`❌ ${nome} → ${a}, esperava ${b}`); }
}
function perto(nome, r, esperado, tol = 0.001) {
  if (typeof r === "number" && Math.abs(r - esperado) <= tol) { ok++; console.log(`✅ ${nome} (${r})`); }
  else { falhas.push(nome); console.log(`❌ ${nome} → ${r}, esperava ~${esperado}`); }
}

/* Relógio fixo: 2026-01-15T12:00:00Z. Nenhum teste depende de "hoje". */
const AGORA = Date.parse("2026-01-15T12:00:00Z");

const AP = (over = {}) => ({
  arbitro: "Raphael Claus",
  data: "2026-01-10T18:00:00Z",
  liga: "Serie A",
  home: "Santos",
  away: "Grêmio",
  fonte: "apitou",
  ...over,
});

/* ================================================================== */
console.log("\n=== 1. Nomes: normalização e slug ===");
check("acento e caixa não duplicam", normNome("Raphael Claus") === normNome("raphael  claus"), true);
check("acentos removidos", normNome("Árbitro João Sá"), "arbitro joao sa");
check("slug", slugArbitro("João Sá"), "joao-sa");
check("slug volta para a mesma chave", nomeDeSlug("joao-sa"), normNome("João Sá"));
check("nomes diferentes continuam diferentes", normNome("João Sá") === normNome("João P. Sá"), false);

/* ================================================================== */
console.log("\n=== 2. Média protegida ===");
check("0 jogos → null (não 0)", media(10, 0), null);
check("divisor ausente → null", media(10, undefined), null);
check("total ausente → null", media(null, 10), null);
perto("3,6 cartões em 10 jogos", media(36, 10), 3.6);
check("arredondar preserva null", arredondar(null), null);
perto("arredondar 2 casas", arredondar(2.6666), 2.67);

/* ================================================================== */
console.log("\n=== 3. Agregação: feed vence, aparições preenchem ===");
const snapFeed = { nome: "Raphael Claus", jogos: 20, amarelos: 80, vermelhos: 4, faltas: 500, penaltis: 6, vistoEm: "2026-01-14T00:00:00Z" };
const aps = [
  AP({ amarelos: 4, vermelhos: 0, faltas: 25, data: "2026-01-10T18:00:00Z", fonteRef: "1" }),
  AP({ amarelos: 6, vermelhos: 1, faltas: 30, data: "2026-01-05T18:00:00Z", fonteRef: "2" }),
];

const comFeed = agregar([snapFeed], aps, AGORA);
check("1 árbitro agregado", comFeed.length, 1);
const r1 = comFeed[0];
check("base = feed", r1.base, "feed");
check("divisor = jogos do feed (20)", r1.jogos, 20);
perto("amarelos/jogo = 80/20", r1.medias.amarelos, 4);
perto("cartões/jogo = (80+4)/20", r1.medias.cartoes, 4.2);
perto("faltas/jogo = 500/20", r1.medias.faltas, 25);
perto("pênaltis/jogo = 6/20", r1.medias.penaltis, 0.3);
perto("vermelho % = 4/20", r1.vermelhoPct, 0.2);
check("aparicoes próprias contadas", r1.aparicoes, 2);
check("amostra não é curta (20 jogos)", r1.amostraCurta, false);

const semFeed = agregar([], aps, AGORA)[0];
check("sem feed → base = aparicoes", semFeed.base, "aparicoes");
check("divisor = aparições com dado de cartão", semFeed.jogos, 2);
perto("amarelos/jogo das nossas aparições = 10/2", semFeed.medias.amarelos, 5);
perto("cartões/jogo = 11/2", semFeed.medias.cartoes, 5.5);
check("amostra curta com 2 jogos", semFeed.amostraCurta, true);
check("MIN_AMOSTRA é 5", MIN_AMOSTRA, 5);

/* Aparição sem dado de cartão não entra no divisor de cartões. */
const mistas = agregar([], [AP({ amarelos: 4 }), AP({ amarelos: null, vermelhos: null, fonteRef: "9" })], AGORA)[0];
check("aparição sem dado não infla o divisor", mistas.jogos, 1);
perto("média só com o jogo informado", mistas.medias.amarelos, 4);

/* Faltas sem total ficam null (não viram 0). */
const semFaltas = agregar([], [AP({ amarelos: 4, faltas: null, penaltis: null })], AGORA)[0];
check("faltas ausentes → null", semFaltas.medias.faltas, null);
check("pênaltis ausentes → null", semFaltas.medias.penaltis, null);

/* ================================================================== */
console.log("\n=== 4. Próximo jogo é futuro ===");
const apFutura = AP({ data: "2026-01-20T22:00:00Z", fonteRef: "f" });
const apPassada = AP({ data: "2026-01-01T22:00:00Z", fonteRef: "p" });
const comProx = agregar([], [apFutura, apPassada], AGORA)[0];
check("próximo jogo = o futuro", new Date(comProx.proximoJogo.data).toISOString().slice(0, 10), "2026-01-20");
check("último jogo = o passado", new Date(comProx.ultimoJogo).toISOString().slice(0, 10), "2026-01-01");

const soPassado = agregar([], [apPassada], AGORA)[0];
check("sem jogo futuro → proximoJogo null", soPassado.proximoJogo, null);

/* Dois futuros: vence o mais próximo. */
const doisFuturos = agregar([], [
  AP({ data: "2026-02-01T22:00:00Z", home: "A", fonteRef: "x" }),
  AP({ data: "2026-01-18T22:00:00Z", home: "B", fonteRef: "y" }),
], AGORA)[0];
check("vence o futuro mais próximo", doisFuturos.proximoJogo.home, "B");

/* ================================================================== */
console.log("\n=== 5. Ordenação com null no fim ===");
const lista = [
  { nome: "Alto", slug: "alto", jogos: 10, base: "feed", medias: { amarelos: 5, vermelhos: 0.2, faltas: 25, penaltis: 0.1, cartoes: 5.2 }, totais: {}, vermelhoPct: 0, proximoJogo: null, ultimoJogo: null, aparicoes: 0, amostraCurta: false },
  { nome: "Baixo", slug: "baixo", jogos: 10, base: "feed", medias: { amarelos: 2, vermelhos: 0.1, faltas: 20, penaltis: 0.05, cartoes: 2.1 }, totais: {}, vermelhoPct: 0, proximoJogo: null, ultimoJogo: null, aparicoes: 0, amostraCurta: false },
  { nome: "Sem dados", slug: "sem-dados", jogos: 0, base: "aparicoes", medias: { amarelos: null, vermelhos: null, faltas: null, penaltis: null, cartoes: null }, totais: {}, vermelhoPct: null, proximoJogo: null, ultimoJogo: null, aparicoes: 0, amostraCurta: true },
];
check("desc: maior cartões primeiro, null no fim",
  filtrarArbitros(lista, { ordem: "cartoes" }).map((a) => a.nome), ["Alto", "Baixo", "Sem dados"]);
check("asc: menor cartões primeiro, null continua no fim",
  filtrarArbitros(lista, { ordem: "cartoes", dir: "asc" }).map((a) => a.nome), ["Baixo", "Alto", "Sem dados"]);
check("ordem por nome", filtrarArbitros(lista, { ordem: "nome", dir: "asc" }).map((a) => a.nome), ["Alto", "Baixo", "Sem dados"]);

/* ================================================================== */
console.log("\n=== 6. Filtros ===");
const timeA = AP({ arbitro: "Wilton Pereira Sampaio", home: "Flamengo", fonte: "apitou", fonteRef: "1", data: "2026-01-20T20:00:00Z" });
const timeB = AP({ arbitro: "Anderson Daronco", home: "Palmeiras", fonte: "apitou", fonteRef: "2", data: "2025-12-01T20:00:00Z" });
const tres = agregar([], [timeA, timeB], AGORA);
check("só com próximo jogo", filtrarArbitros(tres, { soComProximoJogo: true }).map((a) => a.nome), ["Wilton Pereira Sampaio"]);
check("busca sem acento", filtrarArbitros(tres, { q: "daronco" }).map((a) => a.nome), ["Anderson Daronco"]);
check("amostra mínima esconde base curta", filtrarArbitros(tres, { minJogos: 5 }).length, 0);
check("filtro por liga usa o próximo jogo", filtrarArbitros(tres, { liga: "serie a", soComProximoJogo: true }).length, 1);
check("resumo da lista", resumoLista(tres).comProximoJogo, 1);

/* ================================================================== */
console.log("\n=== 7. Histórico e distribuição ===");
const hist = [
  AP({ data: "2026-01-10T18:00:00Z", amarelos: 4, vermelhos: 0 }),
  AP({ data: "2026-01-12T18:00:00Z", amarelos: 5, vermelhos: 1 }),
  AP({ data: "2026-01-08T18:00:00Z", amarelos: 2, vermelhos: 0 }),
];
check("histórico ordenado desc", historico(hist, "raphael-claus").map((x) => x.data.slice(8, 10)), ["12", "10", "08"]);
check("histórico com limite", historico(hist, "raphael claus", 2).length, 2);
check("histórico de outro árbitro", historico(hist, "daronco").length, 0);
const dist = distribuicaoCartoes(hist, "raphael-claus");
check("faixa 3-4", dist.find((f) => f.faixa === "3-4").jogos, 1);
check("faixa 5-6", dist.find((f) => f.faixa === "5-6").jogos, 1);
check("faixa 7+ (nenhum jogo com 7 ou mais)", dist.find((f) => f.faixa === "7+").jogos, 0);
check("faixa 0-2", dist.find((f) => f.faixa === "0-2").jogos, 1);

/* ================================================================== */
console.log("\n=== 8. Dedupe de aparições ===");
const dup = semDuplicatas([
  AP({ fonteRef: "j1", amarelos: null }),
  AP({ fonteRef: "j1", amarelos: 5 }),   // mesma fonte+jogo, mas com o dado
  AP({ fonteRef: "j2", amarelos: 3 }),
]);
check("mesma fonte+jogo vira uma linha", dup.length, 2);
check("fica a versão com mais dados", dup.find((x) => x.fonteRef === "j1").amarelos, 5);

/* ================================================================== */
console.log(`\n${falhas.length === 0 ? "✅ TODOS OS TESTES PASSARAM" : "❌ HOUVE FALHAS"} — ${ok} ok, ${falhas.length} falha(s)`);
if (falhas.length) { console.log("falhas:", falhas.join(" | ")); process.exit(1); }
