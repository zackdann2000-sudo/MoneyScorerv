#!/usr/bin/env node
/**
 * TESTE DE FUMAÇA — as 16 ligas de elite (e só elas) na tela de Ligas.
 *
 * Confirma, contra uma instância no ar, que o feed que alimenta `/ligas`
 * (`GET /api/matches`) não devolve ligas obscuras. É a verificação do bug
 * relatado: Bolívia (`bol.1`) e México (`mex.1`) apareciam na lista porque a
 * rota servia as 24 ligas do catálogo da ESPN.
 *
 * REQUER REDE. Rode fora do Termux (máquina local com o app no ar ou após o
 * deploy), nunca no ambiente de desenvolvimento restrito:
 *
 *   node scripts/test-ligas-filter.mjs                        # http://localhost:3000
 *   node scripts/test-ligas-filter.mjs https://seu-dominio    # produção
 *   BASE_URL=https://seu-dominio npm run test:ligas           # via npm
 *
 * Sai com código 0 quando passa e 1 quando falha — dá para usar em CI/smoke
 * pós-deploy. NÃO avalia odds, jogos ou placar: o alvo é só o filtro de ligas.
 */

const BASE = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");

/**
 * Códigos ESPN permitidos — espelho de `ESPN_MAIN_CODES` em
 * `src/lib/mainLeagues.ts`. Se a lista lá mudar, atualize aqui: o teste trava
 * de propósito, porque divergência silenciosa entre teste e produto é pior que
 * teste nenhum.
 */
const PERMITIDAS = new Set([
  "eng.1", "esp.1", "ita.1", "ger.1", "fra.1",
  "bra.1", "bra.2", "arg.1", "usa.1", "ksa.1",
  "uefa.champions", "uefa.europa", "uefa.europa.conf",
  "conmebol.libertadores", "conmebol.sudamericana", "uefa.nations",
]);

/** Códigos que o bug original deixava vazar — checados explicitamente. */
const PROIBIDAS = ["bol.1", "mex.1"];

/** Data no formato YYYYMMDD que a rota espera (calendário de Brasília). */
function hojeYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(new Date())
    .replace(/\D/g, "");
}

let falhas = 0;
const ok = (msg) => console.log(`✅ ${msg}`);
const fail = (msg) => { falhas += 1; console.log(`❌ ${msg}`); };

async function main() {
  const dia = process.env.DATE || hojeYmd();
  const url = `${BASE}/api/matches?date=${dia}`;
  console.log(`\n🔎 Ligas em ${url}\n`);

  let res;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (e) {
    fail(`sem resposta de ${BASE} — a instância está no ar? (${e.message})`);
    return;
  }

  if (!res.ok) {
    fail(`HTTP ${res.status} em /api/matches`);
    return;
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    fail(`resposta não é JSON (${e.message})`);
    return;
  }

  const matches = Array.isArray(json.matches) ? json.matches : null;
  if (!matches) {
    fail("resposta sem array `matches`");
    return;
  }
  ok(`resposta válida (${matches.length} jogos)`);

  // Liga de cada jogo; a tela de Ligas agrupa por `m.league`.
  const codigos = new Set(matches.map((m) => String(m?.league ?? "")).filter(Boolean));

  const vazaram = [...codigos].filter((c) => !PERMITIDAS.has(c));
  if (vazaram.length === 0) {
    ok("todos os jogos são de uma das 16 ligas permitidas");
  } else {
    fail(`ligas fora das 16 chegaram ao feed: ${vazaram.sort().join(", ")}`);
  }

  for (const proibida of PROIBIDAS) {
    if (codigos.has(proibida)) fail(`liga proibida presente: ${proibida}`);
    else ok(`liga proibida ausente: ${proibida}`);
  }

  // A tela de Ligas também não pode trazer o nome em português dessas ligas.
  const nomesVazados = matches
    .filter((m) => /bolivia|bolívia|méxico|mexico/i.test(String(m?.country ?? "")))
    .map((m) => `${m.country}/${m.leagueName}`);
  if (nomesVazados.length === 0) ok("nenhum país fora da lista (Bolívia/México) nos jogos");
  else fail(`países fora da lista: ${[...new Set(nomesVazados)].join(", ")}`);

  console.log(`\nLigas no feed: ${[...codigos].sort().join(", ") || "(nenhuma)"}`);
  console.log(falhas === 0 ? "\n✅ FILTRO OK — só as 16 ligas\n" : `\n❌ ${falhas} FALHA(S)\n`);
}

main()
  .catch((e) => { console.error("erro inesperado:", e); falhas += 1; })
  .finally(() => process.exit(falhas === 0 ? 0 : 1));
