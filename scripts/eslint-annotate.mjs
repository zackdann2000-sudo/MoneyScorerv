#!/usr/bin/env node
/**
 * Transforma o relatório JSON do ESLint em anotações do GitHub Actions.
 *
 * Por que existe: o log do job de lint no Actions exige autenticação para ser
 * lido (mesmo em repositório público). As ANOTAÇÕES do check run, não — são
 * públicas e legíveis pela API. Emitindo `::error file=...,line=...::mensagem`
 * no stdout, cada problema do ESLint vira uma anotação com arquivo, linha e
 * regra, visível sem token.
 *
 * Uso no workflow:
 *   npx eslint . --format json --output-file eslint-report.json || true
 *   node scripts/eslint-annotate.mjs eslint-report.json
 *
 * Sai com código 1 se houver qualquer erro (severity 2); avisos não quebram o
 * job, mas aparecem anotados. Assim o gate é "zero erros", sem exigir
 * --max-warnings=0 (que hoje viraria uma parede de `<img>` e useMemo).
 */

import { readFileSync } from "node:fs";
import { relative } from "node:path";

const ARQ = process.argv[2] ?? "eslint-report.json";

// Escapa os caracteres reservados dos comandos de workflow do Actions.
const esc = (s) =>
  String(s)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/,/g, "%2C")
    .replace(/:/g, "%3A");

let relatorio;
try {
  relatorio = JSON.parse(readFileSync(ARQ, "utf8"));
} catch (e) {
  console.log(
    `::error file=${ARQ}::Relatório do ESLint ausente ou ilegível — o eslint provavelmente falhou antes de escrever (exit 2: erro de configuração, não de código). ${esc(e.message)}`
  );
  process.exit(1);
}

const raiz = process.cwd();
let erros = 0;
let avisos = 0;
let arquivosComProblema = 0;

for (const arquivo of relatorio) {
  if (!arquivo.messages?.length) continue;
  arquivosComProblema += 1;
  // O ESLint devolve caminho absoluto; o Actions quer relativo à raiz do repo.
  const caminho = relative(raiz, arquivo.filePath) || arquivo.filePath;

  for (const msg of arquivo.messages) {
    const ehErro = msg.severity === 2;
    const nivel = ehErro ? "error" : "warning";
    if (ehErro) erros += 1;
    else avisos += 1;

    const regra = msg.ruleId ?? "fatal";
    const linha = msg.line ?? 1;
    const coluna = msg.column ?? 1;
    console.log(
      `::${nivel} file=${caminho},line=${linha},col=${coluna},title=${esc(regra)}::${esc(msg.message)}`
    );
  }
}

console.log(
  `::notice::ESLint: ${erros} erro(s) e ${avisos} aviso(s) em ${arquivosComProblema} arquivo(s).`
);

process.exit(erros > 0 ? 1 : 0);
