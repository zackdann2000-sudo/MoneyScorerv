#!/usr/bin/env node
/**
 * Sincronização do apitou — SCRIPT STANDALONE (fora do Next/serverless).
 *
 *   node scripts/apitou-sync.mjs --dry-run     # baixa e valida, NÃO grava
 *   node scripts/apitou-sync.mjs               # baixa, valida e grava no Neon
 *   node scripts/apitou-sync.mjs --arquivo=dados.js,linhas.js   # usa arquivos locais
 *
 * Por que um script e não uma rota de API: o /dados.js tem ~22 MB. Numa função
 * serverless isso arrisca estourar memória e timeout. Aqui o processo roda na
 * máquina do usuário/cron, com o limite de memória e tempo que ela tiver.
 *
 * MEMÓRIA — o ponto crítico:
 *   O arquivo chega como texto (22 MB) e o resumo final tem ~280 KB. O pior
 *   momento é o fetch + parse simultâneos. Mitigações:
 *   - baixamos UM arquivo por vez (nunca 22 MB + 186 KB + objetos ao mesmo tempo);
 *   - o buffer do fetch vira string e o buffer é liberado logo depois;
 *   - `--limite-mb` aborta antes de parsear se o arquivo for grande demais;
 *   - `--max-old-space-size` é sugerido no aviso de execução.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const RAIZ = dirname(dirname(fileURLToPath(import.meta.url)));
const TMP_BUILD = join(RAIZ, ".apitou-build");

/*
 * Chave do cache — FONTE ÚNICA, compartilhada com src/lib/apitou/store.ts.
 *
 * Fica num JSON justamente para os dois lados lerem o mesmo valor: o app (via
 * import TS) e este script. Quando a chave vivia duplicada, o app foi para
 * `semana-v2` e o script ficou em `semana` — o job diário gravava numa linha
 * que ninguém lia e a automação inteira ficou morta sem ninguém notar.
 */
const CACHE = JSON.parse(readFileSync(join(RAIZ, "src/lib/apitou/cache-key.json"), "utf8"));
if (!CACHE?.key) {
  erro("cache-key.json sem campo 'key' — não dá para gravar sem saber a chave.");
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Argumentos                                                         */
/* ------------------------------------------------------------------ */

const args = process.argv.slice(2);
const flag = (nome) => args.includes(nome);
const valor = (nome) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : undefined;
};

const DRY_RUN = flag("--dry-run");
const VERBOSE = flag("--verbose");
const LIMITE_MB = Number(valor("limite-mb") ?? 60);
const ARQUIVOS_LOCAIS = valor("arquivo")?.split(",").map((s) => s.trim());
const SAIDA = valor("saida"); // grava o resumo em um .json local (debug)

const URL_BASE = "https://apitou.com.br";

/* ------------------------------------------------------------------ */
/* Utilidades                                                         */
/* ------------------------------------------------------------------ */

function log(...a) {
  console.log(...a);
}
function erro(msg) {
  console.error(`\n❌ ${msg}\n`);
}
function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
function seg(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  Accept: "application/javascript, text/javascript, */*; q=0.01",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Referer: `${URL_BASE}/`,
  Origin: URL_BASE,
};

/**
 * Compila o fonte.ts (que já tem o parser) para JS e importa.
 * Reaproveitar o parser evita duas implementações divergindo com o tempo.
 */
async function carregarParser() {
  if (!existsSync(TMP_BUILD)) mkdirSync(TMP_BUILD, { recursive: true });
  // package.json mínimo: sem ele o Node avisa sobre "module" e reparseia o
  // arquivo, gastando memória à toa bem no momento mais crítico.
  writeFileSync(join(TMP_BUILD, "package.json"), JSON.stringify({ type: "module" }));
  const tsc = join(RAIZ, "node_modules", ".bin", "tsc");
  try {
    execFileSync(
      tsc,
      [
        join(RAIZ, "src/lib/apitou/fonte.ts"),
        "--outDir",
        TMP_BUILD,
        "--module",
        "esnext",
        "--target",
        "es2020",
        "--moduleResolution",
        "bundler",
        "--skipLibCheck",
      ],
      { stdio: VERBOSE ? "inherit" : "pipe" },
    );
  } catch (e) {
    throw new Error(`falha ao compilar fonte.ts: ${e.stdout?.toString() || e.message}`);
  }
  // O tsc gera imports sem extensão; o Node ESM exige. O fonte.ts não tem
  // imports, então basta carregar direto.
  return await import(`${join(TMP_BUILD, "fonte.js")}?t=${Date.now()}`);
}

/**
 * Baixa um arquivo para a memória.
 *
 * Por que não `res.text()` direto: queremos medir e abortar se passar do limite
 * ANTES de materializar a string. Lemos o stream em pedaços, somando o tamanho,
 * e só então convertemos — o Buffer intermediário é descartado no fim.
 */
async function baixar(nome) {
  const t0 = Date.now();
  log(`   ↓ baixando ${nome} ...`);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 300_000);
  let res;
  try {
    res = await fetch(`${URL_BASE}/${nome}`, {
      headers: HEADERS,
      signal: ctrl.signal,
      redirect: "follow",
    });
  } catch (e) {
    clearTimeout(timer);
    throw new Error(`falha de rede em ${nome}: ${e.message}`);
  }

  if (!res.ok) {
    clearTimeout(timer);
    throw new Error(`HTTP ${res.status} ao baixar ${nome}`);
  }

  const declarado = Number(res.headers.get("content-length") ?? 0);
  if (declarado && declarado > LIMITE_MB * 1024 * 1024) {
    clearTimeout(timer);
    throw new Error(
      `${nome} declarou ${mb(declarado)}, acima do limite de ${LIMITE_MB} MB ` +
        `(use --limite-mb para aumentar)`,
    );
  }

  const pedacos = [];
  let total = 0;
  const reader = res.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_MB * 1024 * 1024) {
        throw new Error(`${nome} passou de ${LIMITE_MB} MB durante o download; abortado`);
      }
      pedacos.push(value);
      if (VERBOSE && total % (5 * 1024 * 1024) < value.byteLength) {
        log(`      ... ${mb(total)}`);
      }
    }
  } finally {
    clearTimeout(timer);
  }

  // Concatena uma única vez e decodifica.
  const buffer = Buffer.concat(pedacos.map((p) => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  const texto = buffer.toString("utf8");

  // Armadilha do site: sem os headers certos vem o HTML da SPA com HTTP 200.
  if (!texto.trimStart().startsWith("window.")) {
    throw new Error(
      `${nome} veio como HTML (${mb(texto.length)}), não JS — o servidor recusou os headers`,
    );
  }

  log(`     ✓ ${nome}: ${mb(total)} em ${seg(Date.now() - t0)}`);
  return texto;
}

/* ------------------------------------------------------------------ */
/* Banco                                                              */
/* ------------------------------------------------------------------ */

async function gravarNoBanco(resumo) {
  // dotenv é carregado só aqui: no --dry-run não precisamos de banco.
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(RAIZ, ".env") });

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL ausente no .env — use --dry-run para validar sem gravar");
  }
  const { default: pg } = await import("pg");
  // Sem `ssl` explícito: o projeto todo segue o mesmo padrão (src/db/index.ts),
  // e o Neon negocia o TLS pelas opções da própria connection string. Passar
  // ssl aqui mudava a semântica e gerava o aviso do pg sobre sslmode.
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

  const gravado = { ...resumo, salvadoEm: Date.now() };
  const json = JSON.stringify(gravado);

  try {
    await pool.query(
      `insert into apitou_cache (cache_key, kind, gerado_em, payload, updated_at)
       values ($1, $2, $3, $4::jsonb, now())
       on conflict (cache_key) do update
         set gerado_em = excluded.gerado_em,
             payload   = excluded.payload,
             updated_at = now()`,
      [CACHE.key, CACHE.kind, resumo.geradoEm, json],
    );

    /*
     * Verificação pós-gravação: lê a linha de volta COM A MESMA CHAVE que o app
     * usa. Se alguém voltar a divergir as chaves, o job falha em vez de
     * reportar sucesso gravando em lugar nenhum.
     */
    const r = await pool.query(
      `select pg_size_pretty(length(payload::text)::bigint) as tam,
              (payload->>'geradoEm') as gerado_em,
              (payload->>'salvadoEm') as salvado_em
         from apitou_cache
        where cache_key = $1`,
      [CACHE.key],
    );

    if (!r.rows.length) {
      throw new Error(
        `gravação não confirmada na chave '${CACHE.key}'. ` +
          `Se o app lê outra chave, o job não serve para nada — confira src/lib/apitou/cache-key.json`,
      );
    }
    if (r.rows[0].gerado_em !== resumo.geradoEm) {
      throw new Error(
        `linha '${CACHE.key}' tem geradoEm=${r.rows[0].gerado_em}, esperado ${resumo.geradoEm}`,
      );
    }

    log(`   ✓ verificado: cache_key='${CACHE.key}' geradoEm=${r.rows[0].gerado_em}`);
    return r.rows[0]?.tam ?? mb(json.length);
  } finally {
    await pool.end();
  }
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  log("\n╔══════════════════════════════════════════════════════╗");
  log(`║  apitou sync ${DRY_RUN ? "(DRY-RUN — não grava no banco)" : "(gravação no Neon)"}      ║`);
  log("╚══════════════════════════════════════════════════════╝");

  log("\n1) Carregando parser");
  const F = await carregarParser();
  log("   ✓ parser compilado de src/lib/apitou/fonte.ts");

  let dadosJs;
  let linhasJs;

  if (ARQUIVOS_LOCAIS && ARQUIVOS_LOCAIS.length === 2) {
    log("\n2) Lendo arquivos locais (sem rede)");
    dadosJs = readFileSync(ARQUIVOS_LOCAIS[0], "utf8");
    linhasJs = readFileSync(ARQUIVOS_LOCAIS[1], "utf8");
    log(`   ✓ ${ARQUIVOS_LOCAIS[0]}: ${mb(dadosJs.length)}`);
    log(`   ✓ ${ARQUIVOS_LOCAIS[1]}: ${mb(linhasJs.length)}`);
  } else {
    log("\n2) Baixando fontes");
    log(`   limite de memória por arquivo: ${LIMITE_MB} MB`);
    // Sequencial de propósito: o pico de memória é um arquivo por vez.
    dadosJs = await baixar("dados.js");
    linhasJs = await baixar("linhas.js");
  }

  log("\n3) Reduzindo (parse)");
  const t0 = Date.now();
  const resumo = F.parseDados(dadosJs, linhasJs);
  log(`   ✓ ${seg(Date.now() - t0)}`);

  // Libera as strings grandes o quanto antes.
  dadosJs = null;
  linhasJs = null;
  if (global.gc) global.gc();

  const json = JSON.stringify(resumo);
  const props = resumo.jogos.reduce(
    (a, j) => a + j.jogadores.reduce((b, p) => b + Object.keys(p.props).length, 0),
    0,
  );

  log("\n4) Resumo");
  log(`   jogos .............. ${resumo.jogos.length}`);
  log(`   props individuais .. ${props}`);
  log(`   jogadores .......... ${resumo.jogos.reduce((a, j) => a + j.jogadores.length, 0)}`);
  log(`   com escalação ...... ${resumo.jogos.filter((j) => j.escHome || j.escAway).length}`);
  log(`   com árbitro ........ ${resumo.jogos.filter((j) => j.arbitro).length}`);
  log(`   com H2H ............ ${resumo.jogos.filter((j) => j.h2hResumo.length).length}`);
  log(`   avisos ............. ${resumo.avisos.length}`);
  log(`   geradoEm ........... ${resumo.geradoEm}`);
  log(`   tamanho do resumo .. ${mb(json.length)}`);

  if (resumo.avisos.length && VERBOSE) {
    log("\n   avisos:");
    for (const a of resumo.avisos.slice(0, 10)) log(`     - ${a}`);
  }

  if (SAIDA) {
    writeFileSync(SAIDA, json);
    log(`\n   resumo gravado em ${SAIDA}`);
  }

  log("\n5) Amostra (primeiro jogo)");
  const j = resumo.jogos.find((g) => g.jogadores.length) ?? resumo.jogos[0];
  if (j) {
    log(`   ${j.home} x ${j.away} — ${j.competicao}`);
    log(`   kickoff ${j.kickoff} | árbitro ${j.arbitro?.nome ?? "—"}`);
    log(`   jogadores com props: ${j.jogadores.length} | mercados de time: ${j.mercados.length}`);
    const p = j.jogadores[0];
    if (p) {
      log(`   ex.: ${p.nome} (${p.time || "?"}) media=${p.media}`);
      for (const [m, ls] of Object.entries(p.props).slice(0, 2)) {
        log(`        ${m}: ${ls.map((l) => `${l.linha}@${l.odd}`).join(" ")}`);
      }
    }
  }

  if (DRY_RUN) {
    log("\n✅ DRY-RUN concluído — nada foi gravado no banco.");
    log("   Para gravar: node scripts/apitou-sync.mjs\n");
    return;
  }

  log("\n6) Gravando no Neon");
  const tam = await gravarNoBanco(resumo);
  log(`   ✓ apitou_cache atualizado (payload ${tam})`);
  log("\n✅ Sincronização concluída.\n");
}

main().catch((e) => {
  erro(e.message);
  if (VERBOSE) console.error(e);
  process.exit(1);
});
