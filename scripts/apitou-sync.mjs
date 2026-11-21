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
 *
 * M3 — LOCK GLOBAL E CACHE PARTICIONADO:
 *   Este script é a maior fonte de corrida do módulo: o GitHub Actions (06:00) e
 *   o Vercel Cron (09:00) podem coincidir com um sync preguiçoso de request. O
 *   watchdog `--se-velho` reduz a janela, mas não elimina. Agora, antes de
 *   baixar, o script pega o MESMO advisory lock do app
 *   (`pg_try_advisory_lock(hashtext('apitou-sync'))`): quem chega depois sai
 *   verde sem baixar nada.
 *   A gravação usa `particionar()` de src/lib/apitou/particoes.ts — a mesma
 *   função do app, compilada aqui. Uma implementação só, dois processos.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
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
/**
 * Watchdog: só sincroniza se o cache tiver mais de N minutos. É o que evita
 * dois agendadores (GitHub Actions 06:00 e Vercel Cron 09:00) baixando 22 MB
 * para reescrever o mesmo dado. Sem valor = sempre sincroniza (comportamento
 * de operador rodando na mão).
 */
const SE_VELHO_MIN = valor("se-velho") != null ? Number(valor("se-velho")) : null;

/*
 * CANÁRIO DE CONTEÚDO — o modo de falha real da origem não é 500, é 200 com
 * payload vazio/truncado. Baixar e gravar isso apagaria a semana inteira da
 * tela. Os pisos são generosos de propósito (dia normal: ~57 jogos, ~4800
 * props, 49 com árbitro) e ajustáveis por env em semana atípica.
 */
const MIN_JOGOS = Number(process.env.APITOU_MIN_JOGOS ?? 20);
const MIN_PROPS = Number(process.env.APITOU_MIN_PROPS ?? 250);
const ARQUIVOS_LOCAIS = valor("arquivo")?.split(",").map((s) => s.trim());
const SAIDA = valor("saida"); // grava o resumo em um .json local (debug)

const URL_BASE = "https://apitou.com.br";

/** Preenchidos por main(): parser/particionador compilados e a conexão do lock. */
let PARSER = null;
let cliente = null;
/** Dono da lease atual (null = sem lock). */
let dono = null;

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
 * Compila os módulos que já têm a lógica (parser e particionamento) para JS e
 * importa. Reaproveitar os mesmos arquivos evita duas implementações do mesmo
 * recorte divergindo com o tempo.
 *
 * CommonJS de propósito: o tsc emite `import "./analise"` sem extensão no modo
 * ESM, e o Node ESM exige extensão. Em CJS o `require` resolve sozinho.
 */
async function carregarParser() {
  if (!existsSync(TMP_BUILD)) mkdirSync(TMP_BUILD, { recursive: true });
  // Marca o diretório como CommonJS. Uma versão anterior deste script gravava
  // `{"type":"module"}` aqui; deixar o arquivo antigo faria o require destes
  // .js explodir com "exports is not defined in ES module scope".
  writeFileSync(join(TMP_BUILD, "package.json"), JSON.stringify({ type: "commonjs" }));
  const tsc = join(RAIZ, "node_modules", ".bin", "tsc");
  try {
    execFileSync(
      tsc,
      [
        join(RAIZ, "src/lib/apitou/particoes.ts"),
        "--outDir",
        TMP_BUILD,
        "--module",
        "commonjs",
        "--target",
        "es2022",
        "--skipLibCheck",
      ],
      { stdio: VERBOSE ? "inherit" : "pipe" },
    );
  } catch (e) {
    throw new Error(`falha ao compilar particoes.ts: ${e.stdout?.toString() || e.message}`);
  }

  const require = createRequire(import.meta.url);
  // particoes.ts importa analise.ts -> engine.ts -> formaRecente.ts; o tsc
  // preserva a estrutura a partir do diretório comum (apitou/), então o
  // caminho do build acompanha.
  const particoes = require(join(TMP_BUILD, "apitou/particoes.js"));
  const fonte = require(join(TMP_BUILD, "apitou/fonte.js"));
  return { fonte, particoes };
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
/* Env, frescor e canário                                            */
/* ------------------------------------------------------------------ */

let envCarregado = false;

/** Carrega o .env uma vez. Idempotente: chamado pelo gate e pela gravação. */
async function carregarEnv() {
  if (envCarregado) return;
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: join(RAIZ, ".env"), quiet: true });
  envCarregado = true;
}

/**
 * Idade do resumo já gravado, em minutos — ou null se não der para saber
 * (sem banco, sem linha, erro de rede). Quem chama trata null como "velho".
 */
async function idadeAtualMin() {
  await carregarEnv();
  if (!process.env.DATABASE_URL) return null;

  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const r = await pool.query(
      `select (payload->>'salvadoEm') as salvado_em, extract(epoch from updated_at) as upd
         from apitou_cache where cache_key = $1`,
      [CACHE.key],
    );
    if (!r.rows.length) return null;

    const salvadoEm = Number(r.rows[0].salvado_em);
    if (Number.isFinite(salvadoEm) && salvadoEm > 0) return (Date.now() - salvadoEm) / 60000;

    // Payload antigo sem `salvadoEm`: usa a coluna updated_at como aproximação.
    const upd = Number(r.rows[0].upd) * 1000;
    return Number.isFinite(upd) && upd > 0 ? (Date.now() - upd) / 60000 : null;
  } catch (e) {
    log(`   ! não deu para ler a idade do cache (${e.message}); seguindo com o sync`);
    return null;
  } finally {
    await pool.end();
  }
}

/**
 * Canário: recusa gravar um resumo que "parece quebrado".
 *
 * Não tenta ser esperto — só compara com pisos que um dia normal passa com
 * folga. Lançar aqui é o que transforma "origem mudou o formato" em issue
 * automática (o workflow abre issue em falha) em vez de tela vazia.
 */
function validarResumo(resumo, props) {
  const pisoJogos = Number.isFinite(MIN_JOGOS) ? MIN_JOGOS : 20;
  const pisoProps = Number.isFinite(MIN_PROPS) ? MIN_PROPS : 250;

  if (!Array.isArray(resumo.jogos)) throw new Error("canário: resumo sem lista de jogos");

  if (resumo.jogos.length < pisoJogos) {
    throw new Error(
      `canário: ${resumo.jogos.length} jogos, piso ${pisoJogos}. ` +
        `A origem pode ter mudado de formato — nada foi gravado (APITOU_MIN_JOGOS para ajustar)`,
    );
  }
  if (props < pisoProps) {
    throw new Error(
      `canário: ${props} props, piso ${pisoProps}. Props vazias = parser perdido (APITOU_MIN_PROPS para ajustar)`,
    );
  }
  if (!resumo.jogos.some((j) => j.arbitro)) {
    throw new Error("canário: nenhum jogo com árbitro — o parser perdeu um campo");
  }
  if (!resumo.jogos.every((j) => !Number.isNaN(Date.parse(j.kickoff)))) {
    throw new Error("canário: há jogo com kickoff inválido — formato de data mudou");
  }
  const semFonte = Date.parse(resumo.geradoEm ?? "");
  if (Number.isNaN(semFonte)) {
    throw new Error("canário: geradoEm ausente/inválido na origem");
  }

  log(
    `   ✓ canário ok: ${resumo.jogos.length} jogos, ${props} props, ` +
      `${resumo.jogos.filter((j) => j.arbitro).length} com árbitro`,
  );
}

/* ------------------------------------------------------------------ */
/* Banco, lock global e gravação                                      */
/* ------------------------------------------------------------------ */

/** Nome do lock — o MESMO do app (src/lib/apitou/lock.ts). */
const LOCK_NOME = "apitou-sync";
/** Prazo do lease em segundos. O sync tem teto de 300s; 10 min sobra. */
const LOCK_TTL_S = 600;

/**
 * Abre a conexão usada para o lock E para a gravação.
 *
 * Com o lease, tecnicamente lock e gravação poderiam usar conexões diferentes
 * (o lock vive numa linha, não numa sessão). Manter a mesma conexão é por
 * economia: uma sessão aberta por ~1 min contra duas.
 */
async function abrirConexao() {
  await carregarEnv();
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL ausente no .env — use --dry-run para validar sem gravar");
  }
  const { default: pg } = await import("pg");
  // Sem `ssl` explícito: o projeto todo segue o mesmo padrão (src/db/index.ts),
  // e o Neon negocia o TLS pelas opções da própria connection string.
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

/**
 * Pega o lock global: LEASE em tabela (`sync_lock`), não advisory lock.
 *
 * Advisory lock foi medido e não funciona aqui: o endpoint pooled do Neon põe
 * clientes diferentes na MESMA sessão do Postgres, e lock de sessão vira
 * reentrante (dois `pg_try_advisory_lock` simultâneos devolvem `true`). Ver o
 * comentário em src/lib/apitou/lock.ts e na migration 0013.
 *
 * `false` = outro processo (lambda, cron ou outra máquina) está sincronizando
 * agora — o correto é sair verde sem baixar 22 MB.
 */
async function pegarLock(client) {
  dono = `actions:${process.pid}:${Date.now()}`;
  const r = await client.query(
    `insert into sync_lock (nome, dono, expira_em)
     values ($1, $2, now() + ($3 || ' seconds')::interval)
     on conflict (nome) do update
       set dono = excluded.dono,
           expira_em = excluded.expira_em,
           atualizado_em = now()
       where sync_lock.expira_em < now()
     returning dono, expira_em`,
    [LOCK_NOME, dono, String(LOCK_TTL_S)],
  );
  if (r.rows[0]?.dono !== dono) {
    const atual = await client.query("select dono, expira_em from sync_lock where nome = $1", [LOCK_NOME]);
    if (atual.rows[0]) {
      log(`   · lock com ${atual.rows[0].dono} até ${new Date(atual.rows[0].expira_em).toISOString()}`);
    }
    dono = null;
    return false;
  }
  return true;
}

async function soltarLock(client) {
  if (!dono) return;
  try {
    // Só apaga o MEU lock: se a lease venceu e outro processo pegou, este
    // delete não casa nada (é o que impede um processo lento de roubar o lock
    // de quem já está trabalhando).
    await client.query("delete from sync_lock where nome = $1 and dono = $2", [LOCK_NOME, dono]);
  } catch {
    // Sem drama: lease viva expira sozinha.
  }
  dono = null;
}

/**
 * Grava o resumo PARTICIONADO (meta/dia/jogo/desajustes) + `semana-v2`.
 *
 * As partições vêm de `particionar()` — a mesma função que o app usa — e a
 * gravação é UMA transação: ou a semana inteira entra, ou nada entra. Sem isso,
 * uma falha no meio deixaria `meta:` novo apontando para `dia:` velho.
 */
async function gravarNoBanco(client, resumo) {
  const { particoes } = PARSER;
  const gravado = { ...resumo, salvadoEm: Date.now() };
  const json = JSON.stringify(gravado);
  const { meta, linhas, tamanhos } = particoes.particionar(gravado);

  const gravarLegado = process.env.APITOU_LEGADO_SEMANA !== "0";
  const todas = gravarLegado
    ? [...linhas, { cacheKey: CACHE.key, kind: CACHE.kind, geradoEm: resumo.geradoEm, payload: gravado }]
    : linhas;

  await client.query("begin");
  try {
    for (const l of todas) {
      await client.query(
        `insert into apitou_cache (cache_key, kind, gerado_em, payload, updated_at)
         values ($1, $2, $3, $4::jsonb, now())
         on conflict (cache_key) do update
           set kind = excluded.kind,
               gerado_em = excluded.gerado_em,
               payload = excluded.payload,
               updated_at = now()`,
        [l.cacheKey, l.kind, l.geradoEm, JSON.stringify(l.payload)],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }

  /*
   * Verificação pós-gravação: lê de volta as linhas COM AS MESMAS CHAVES que o
   * app usa. Se alguém voltar a divergir as chaves, o job falha em vez de
   * reportar sucesso gravando em lugar nenhum.
   */
  const chaves = [particoes.chaveMeta(), particoes.chaveDesajustes("semana")];
  if (meta.dias[0]) chaves.push(particoes.chaveDia(meta.dias[0]));
  if (resumo.jogos[0]) chaves.push(particoes.chaveJogo(resumo.jogos[0].id));
  if (gravarLegado) chaves.push(CACHE.key);

  const r = await client.query(
    `select cache_key, length(payload::text) as tam
       from apitou_cache where cache_key = any($1::text[]) order by cache_key`,
    [chaves],
  );
  const achadas = new Set(r.rows.map((x) => x.cache_key));
  const faltando = chaves.filter((c) => !achadas.has(c));
  if (faltando.length) {
    throw new Error(
      `gravação não confirmada nas chaves: ${faltando.join(", ")}. ` +
        `Se o app lê outra chave, o job não serve para nada — confira src/lib/apitou/cache-key.json e particoes.ts`,
    );
  }

  const gravadoMeta = await client.query(
    `select payload->>'geradoEm' as gerado_em, payload->>'versao' as versao
       from apitou_cache where cache_key = $1`,
    [particoes.chaveMeta()],
  );
  if (gravadoMeta.rows[0]?.gerado_em !== resumo.geradoEm) {
    throw new Error(
      `meta:apitou tem geradoEm=${gravadoMeta.rows[0]?.gerado_em}, esperado ${resumo.geradoEm}`,
    );
  }

  const maiorKb = tamanhos.reduce((m, t) => Math.max(m, t.kb), 0);
  const grandes = tamanhos.filter((t) => t.kb > particoes.LIMITE_KB);
  if (grandes.length) {
    log(
      `   ! partição acima do teto de ${particoes.LIMITE_KB} KB: ` +
        grandes.map((t) => `${t.chave} (${t.kb} KB)`).join(", "),
    );
  }

  /*
   * Expurgo de órfãs: partições do sync ANTERIOR que não existem neste (jogo
   * que saiu da semana, dia que ficou vazio). Não são lidas — a `versao` não
   * bate — mas ocupam espaço, e num cache que cresce por jogo isso vira lixo
   * permanente enquanto o M6 de retenção não existe.
   */
  const orfas = await client.query(
    `delete from apitou_cache
      where (cache_key like 'dia:%' or cache_key like 'jogo:%' or cache_key like 'desajustes:%')
        and cache_key <> all($1::text[])`,
    [linhas.map((l) => l.cacheKey)],
  );

  log(`   ✓ ${todas.length} linhas gravadas (maior ${maiorKb} KB, versão ${meta.versao})`);
  log(`   ✓ verificado: ${chaves.length} chaves presentes, geradoEm confere`);
  log(`   ✓ órfãs removidas: ${orfas.rowCount}`);
  return {
    linhas: todas.length,
    maiorKb,
    versao: meta.versao,
    tamanhoLegado: json.length,
    orfas: orfas.rowCount,
  };
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  log("\n╔══════════════════════════════════════════════════════╗");
  log(`║  apitou sync ${DRY_RUN ? "(DRY-RUN — não grava no banco)" : "(gravação no Neon)"}      ║`);
  log("╚══════════════════════════════════════════════════════╝");

  /*
   * 0) Watchdog: se outro agendador já sincronizou dentro da janela, sair
   *    AQUI (código 0) — antes de baixar 22 MB. É o que impede o Actions e o
   *    Vercel Cron de se sobrescreverem: quem chega primeiro faz o trabalho,
   *    o outro vira no-op e o job fica verde nos dois casos.
   */
  if (SE_VELHO_MIN != null && !DRY_RUN) {
    log(`\n0) Watchdog (janela de ${SE_VELHO_MIN} min)`);
    const idade = await idadeAtualMin();
    if (idade != null && Number.isFinite(idade) && idade < SE_VELHO_MIN) {
      log(`   ✓ cache com ${idade.toFixed(0)} min — fresco, nada a fazer.`);
      log(`\n✅ Nada a sincronizar (janela de ${SE_VELHO_MIN} min).\n`);
      return;
    }
    log(
      idade == null
        ? "   · sem resumo legível — sincronizando"
        : `   · cache com ${idade.toFixed(0)} min — sincronizando`,
    );
  }

  log("\n1) Carregando parser e particionador");
  const { fonte: F, particoes } = await carregarParser();
  PARSER = { fonte: F, particoes };
  log("   ✓ compilados de src/lib/apitou/fonte.ts e particoes.ts");

  /*
   * 1.5) LOCK GLOBAL (lease em `sync_lock` — o mesmo lock do app).
   *
   * A partir daqui, dois processos NÃO baixam 22 MB ao mesmo tempo: o Actions,
   * o Vercel Cron e o sync preguiçoso de request disputam o mesmo nome,
   * `apitou-sync`. Quem perde sai com código 0 (nada a fazer) e deixa o cache
   * atual de pé — o objetivo não é "rodar", é "não duplicar trabalho".
   */
  if (!DRY_RUN) {
    log(`\n1.5) Lock global (${LOCK_NOME})`);
    cliente = await abrirConexao();
    const pegou = await pegarLock(cliente);
    if (!pegou) {
      log("   · outro processo está sincronizando agora — saindo sem baixar.");
      log("\n✅ Nada a fazer (lock ocupado).\n");
      return;
    }
    log(`   ✓ lease adquirida (${LOCK_TTL_S}s, dono ${dono})`);
  }

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

  // Canário: valida ANTES de gravar (também no --dry-run, que é como o
  // operador testa se a origem mudou sem mexer no banco).
  validarResumo(resumo, props);

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
  const stats = await gravarNoBanco(cliente, resumo);
  log(`   ✓ apitou_cache particionado: ${stats.linhas} linhas, maior ${stats.maiorKb} KB`);
  log(`   ✓ legado semana-v2 ${process.env.APITOU_LEGADO_SEMANA === "0" ? "NÃO gravado (Release C)" : `gravado (${mb(stats.tamanhoLegado)})`}`);
  log("\n✅ Sincronização concluída.\n");
}

main()
  .catch((e) => {
    erro(e.message);
    if (VERBOSE) console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    /*
     * O lock e a conexão são liberados SEMPRE — inclusive quando o parse falha
     * ou o processo é interrompido no meio do download. Se o processo morrer de
     * vez (kill -9, timeout do runner), a lease expira sozinha em LOCK_TTL_S.
     */
    try {
      if (cliente) {
        await soltarLock(cliente);
        await cliente.end();
      }
    } catch {
      // nada a fazer no encerramento
    }
  });
