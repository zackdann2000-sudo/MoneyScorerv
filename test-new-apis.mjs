#!/usr/bin/env node
/* =======================================================================
   test-new-apis.mjs — smoke test das 4 novas APIs (Etapa 3)
   -----------------------------------------------------------------------
   Uso:   node test-new-apis.mjs
          node test-new-apis.mjs --gasto     (inclui a chamada paga da Striker)

   Só lê as chaves do .env. Não escreve nada, não altera a cascata.
   Nenhuma chamada é feita à API-Football — cota intacta.
   ======================================================================= */

import { readFileSync, existsSync } from "node:fs";

/* ---------- .env mínimo (sem dependências) ---------- */
function loadEnv(path = ".env") {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadEnv(), ...process.env };
const GASTO = process.argv.includes("--gasto");

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  ok: (s) => `\x1b[32m${s}\x1b[0m`,
  bad: (s) => `\x1b[31m${s}\x1b[0m`,
  warn: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

/* ---------- classificação do status ---------- */
function diagnosticar(status, corpo) {
  if (status === 0) return { ok: false, motivo: "não houve chamada (chave ausente?)" };
  if (status === 200 || status === 304) return { ok: true, motivo: status === 304 ? "304 Not Modified (não consome cota)" : "OK" };
  if (status === 401 || status === 403) return { ok: false, motivo: `ERRO DE AUTENTICAÇÃO (${status}) — chave inválida, revogada ou header errado` };
  if (status === 404) return { ok: false, motivo: "404 — endpoint não existe (verificar path/base URL)" };
  if (status === 429) return { ok: false, motivo: "429 — cota/rate limit estourado" };
  if (status >= 500) return { ok: false, motivo: `${status} — erro no servidor da API` };
  return { ok: false, motivo: `HTTP ${status}` };
}

function resumoCorpo(corpo) {
  if (corpo == null) return "(sem corpo)";
  if (typeof corpo === "string") return corpo.slice(0, 120);
  try {
    const chaves = Object.keys(corpo).slice(0, 6);
    const arr = Array.isArray(corpo) ? `array(${corpo.length})` : null;
    if (arr && chaves.length === 0) return arr;
    const amostra = {};
    for (const k of chaves) {
      const v = corpo[k];
      amostra[k] = Array.isArray(v) ? `array(${v.length})` : typeof v === "object" && v ? "{…}" : v;
    }
    return JSON.stringify(amostra).slice(0, 160);
  } catch {
    return "(corpo não serializável)";
  }
}

/* ---------- runner ---------- */
const resultados = [];

async function testar({ nome, envVar, url, metodo = "GET", headers = {}, body, nota }) {
  const chave = (env[envVar] || "").trim();

  console.log("");
  console.log(c.bold(`── ${nome}`));
  console.log(c.dim(`   ${metodo} ${url}`));
  if (nota) console.log(c.dim(`   ${nota}`));

  if (!chave) {
    console.log(c.warn(`   ⏭  ${envVar} vazia no .env — pulando`));
    resultados.push({ nome, status: "SEM CHAVE", ok: null });
    return;
  }

  const t0 = Date.now();
  let status = 0;
  let corpo = null;
  let extra = "";

  try {
    const res = await fetch(url, {
      method: metodo,
      headers: { Accept: "application/json", ...headers, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    status = res.status;

    const txt = await res.text();
    try { corpo = txt ? JSON.parse(txt) : null; } catch { corpo = txt; }

    /* headers úteis de cota */
    const resto = res.headers.get("x-ratelimit-remaining") ?? res.headers.get("x-credits-remaining");
    if (resto != null) extra = ` · restante: ${resto}`;
  } catch (e) {
    console.log(c.bad(`   ✖ falha de rede: ${e.message}`));
    resultados.push({ nome, status: "REDE", ok: false });
    return;
  }

  const ms = Date.now() - t0;
  const d = diagnosticar(status, corpo);
  const linha = `   ${d.ok ? c.ok("✔") : c.bad("✖")} HTTP ${status} — ${d.motivo}${c.dim(` · ${ms}ms${extra}`)}`;

  console.log(linha);
  if (!d.ok && status !== 0) {
    console.log(c.dim(`   corpo: ${resumoCorpo(corpo)}`));
  } else if (d.ok) {
    console.log(c.dim(`   amostra: ${resumoCorpo(corpo)}`));
  }

  resultados.push({ nome, status, ok: d.ok, motivo: d.motivo });
}

/* =======================================================================
   As 4 chamadas — uma por API, o mais barata possível
   ======================================================================= */

const hoje = new Date().toISOString().slice(0, 10);

/* 1) ZAFRONIX — /tournaments funciona até SEM chave (25 req/dia por IP).
      Com chave usa a cota. Base URL é por competição. */
await testar({
  nome: "Zafronix (histórico/placares)",
  envVar: "ZAFRONIX_API_KEY",
  url: "https://api.zafronix.com/fifa/worldcup/v1/tournaments",
  headers: { "X-API-Key": (env.ZAFRONIX_API_KEY || "").trim() },
  nota: "header X-API-Key · resposta de torneios históricos",
});

/* 2) 5DOLLARFOOTBALLAPI — /fixtures?status=live, sem custo de odds. */
await testar({
  nome: "5DollarFootballAPI (odds/mercados)",
  envVar: "FIVE_DOLLAR_API_KEY",
  url: "https://api.5dollarfootballapi.com/v1/fixtures?status=live",
  headers: { Authorization: `Bearer ${(env.FIVE_DOLLAR_API_KEY || "").trim()}` },
  nota: "Bearer · envelope { success, data }",
});

/* 3) GOAL API — /status não exige chave; /fixtures/live valida a chave.
      Vamos direto no que prova a autenticação. */
await testar({
  nome: "GOAL API (xG/estatísticas)",
  envVar: "GOAL_API_KEY",
  url: "https://api.goal-api.com/v1/fixtures/live",
  headers: { Authorization: `Bearer ${(env.GOAL_API_KEY || "").trim()}` },
  nota: "Bearer (única forma aceita) · envelope { success, data }",
});

/* 4) STRIKERAPI — POST /v1/search_players custa 1 crédito.
      Sem --gasto usamos a estimativa gratuita: estimate_only no get_player
      (custo 5 cr) devolve o preço sem cobrar. */
if (GASTO) {
  await testar({
    nome: "StrikerAPI (estatísticas de jogador)",
    envVar: "STRIKER_API_KEY",
    url: "https://mcp.strikerapi.com/v1/search_players",
    metodo: "POST",
    headers: { "x-api-key": (env.STRIKER_API_KEY || "").trim() },
    body: { name: "saka", limit: 1 },
    nota: "POST + x-api-key · custa 1 crédito",
  });
} else {
  await testar({
    nome: "StrikerAPI (estimativa, não gasta crédito)",
    envVar: "STRIKER_API_KEY",
    url: "https://mcp.strikerapi.com/v1/get_player",
    metodo: "POST",
    headers: { "x-api-key": (env.STRIKER_API_KEY || "").trim() },
    body: { player_id: "280555", estimate_only: true },
    nota: "estimate_only:true — devolve o custo sem cobrar · use --gasto para testar de verdade",
  });
}

/* ---------- resumo ---------- */
console.log("");
console.log(c.bold("═══ RESUMO ═══"));
for (const r of resultados) {
  const icone = r.ok === true ? c.ok("✔") : r.ok === null ? c.warn("⏭") : c.bad("✖");
  console.log(` ${icone} ${r.nome.padEnd(38)} ${typeof r.status === "number" ? `HTTP ${r.status}` : r.status}${r.motivo ? c.dim(` — ${r.motivo}`) : ""}`);
}
const falhas = resultados.filter((r) => r.ok === false).length;
const semChave = resultados.filter((r) => r.ok === null).length;
console.log("");
console.log(`${resultados.length - falhas - semChave} ok · ${falhas} falha(s) · ${semChave} sem chave`);
if (falhas === 0 && semChave > 0) console.log(c.dim("Preencha as chaves no .env e rode de novo."));
process.exit(falhas > 0 ? 1 : 0);
