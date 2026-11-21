/**
 * Teste unitário do particionamento do apitou (M3) — PADRÃO DOS FIXXTURES REAIS.
 *
 * Roda pela suíte de unit-tests.sh (compila particoes.ts + dependências e copia
 * este teste para perto do JS). O ponto é garantir que o recorte do resumo em
 * meta/dia/jogo/desajustes bate com o que as rotas leem — inclusive a borda de
 * fuso (jogo de 21h local não pode cair no dia seguinte) e o teto de 120 KB.
 *
 * NOTA sobre caminho: o harness roda o teste compilado com cwd = raiz do repo,
 * então os fixtures são achados por process.cwd(), não por __dirname (que aqui
 * é o diretório temporário do build).
 */
const fs = require("fs");
const path = require("path");
const P = require("./particoes.js");
const F = require("./fonte.js");

const ROOT = process.cwd();
let falhas = 0;
function check(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "✅" : "❌"} ${nome.padEnd(52)} obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`);
}
function ok_cond(nome, cond) {
  if (!cond) falhas++;
  console.log(`${cond ? "✅" : "❌"} ${nome}`);
}

console.log("\n=== 0. Monta um resumo a partir dos fixtures reais ===");
const semana = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/apitou/__fixtures__/mock-semana.json"), "utf8"));
const linhas = JSON.parse(fs.readFileSync(path.join(ROOT, "src/lib/apitou/__fixtures__/mock-linhas.json"), "utf8"));
const comoSite = (n, o) => `window.${n}=${JSON.stringify(o)};`;
const resumo = F.parseDados(comoSite("SC_SEMANA", semana), comoSite("SC_LINHAS", linhas));
const gravado = { ...resumo, salvadoEm: 1700000000000 };
ok_cond("resumo tem 1 jogo (fixture)", resumo.jogos.length === 1);

console.log("\n=== 1. Estrutura das partições ===");
const out = P.particionar(gravado);
const chaves = out.linhas.map((l) => l.cacheKey).sort();
const esperadas = [
  P.chaveMeta(),
  P.chaveDesajustes("semana"),
  P.chaveDia(P.diaSaoPaulo(resumo.jogos[0].kickoff)),
  P.chaveJogo(resumo.jogos[0].id),
  P.chaveDesajustes(P.diaSaoPaulo(resumo.jogos[0].kickoff)),
].sort();
check("conjunto de chaves", chaves, esperadas);

const meta = out.meta;
ok_cond("meta.jogosTotal bate", meta.jogosTotal === resumo.jogos.length);
ok_cond("meta.versao = salvadoEm", meta.versao === String(gravado.salvadoEm));
ok_cond("meta.dias contém o dia local", meta.dias.includes(P.diaSaoPaulo(resumo.jogos[0].kickoff)));
ok_cond("todo particao carrega versao do sync", out.linhas.every((l) => l.payload.versao === meta.versao));

console.log("\n=== 2. Teto de tamanho (critério do M3: nada acima de 120 KB) ===");
ok_cond("nenhuma partição passa de 120 KB", out.tamanhos.every((t) => t.kb <= P.LIMITE_KB));
console.log("  tamanhos: " + out.tamanhos.map((t) => `${t.chave}=${t.kb}KB`).join(", "));

console.log("\n=== 3. Enxuto da lista (/jogos) ===");
const dia = P.chaveDia(P.diaSaoPaulo(resumo.jogos[0].kickoff));
const linhaDia = out.linhas.find((l) => l.cacheKey === dia);
const e = linhaDia.payload.jogos[0];
ok_cond("dia tem jogos enxutos", Boolean(e));
ok_cond("enxuto não carrega props (só contagens)",
  "props" in e === false && "jogadores" in e && "mercados" in e);
check("enxuto.dia", e.dia, P.diaSaoPaulo(resumo.jogos[0].kickoff));

console.log("\n=== 4. Jogo carrega props JÁ calculadas (/jogo/:id) ===");
const linhaJogo = out.linhas.find((l) => l.cacheKey === P.chaveJogo(resumo.jogos[0].id));
const A = require("./analise.js");
check("jogo.props.length == calcularJogo()", linhaJogo.payload.props.length, A.calcularJogo(resumo.jogos[0]).length);
check("jogo.versao == meta.versao", linhaJogo.payload.versao, meta.versao);
ok_cond("jogo guarda o jogo bruto para a UI", Boolean(linhaJogo.payload.jogo) && linhaJogo.payload.jogo.id === resumo.jogos[0].id);

console.log("\n=== 5. Desajustes da semana: ordenados por edge desc ===");
const linhaSemana = out.linhas.find((l) => l.cacheKey === P.chaveDesajustes("semana"));
const itens = linhaSemana.payload.itens;
ok_cond("itens vêm ordenados por edge decrescente", itens.every((d, i) => i === 0 || itens[i - 1].edge >= d.edge));

console.log("\n=== 6. Filtro e contagem (o que a rota /desajustes aplica) ===");
const fake = [
  { nivel: "quente", edge: 0.09, competicao: "Premier League" },
  { nivel: "bom", edge: 0.06, competicao: "Série A" },
  { nivel: "neutro", edge: 0.04, competicao: "Liga Y" },
];
check("filtro por nivel", P.filtrarDesajustes(fake, { nivel: "bom" }).length, 1);
ok_cond("filtro de edge (opcional)", P.filtrarDesajustes(fake, { minimoEdge: 0.05 }).length === 2);
const contagem = P.contarPorNivel(fake);
check("contagem por nivel", contagem, { quente: 1, bom: 1, neutro: 1 });

console.log("\n=== 7. Borda do fuso: jogo de 21h local não cai no dia seguinte ===");
// UTC já é o dia 17, mas em São Paulo ainda é 16/11 às 23:30.
check("2026-11-17T02:30:00Z (23:30 local de 16/11)", P.diaSaoPaulo("2026-11-17T02:30:00Z"), "2026-11-16");
// Meio-dia UTC é o mesmo dia local.
check("2026-11-16T12:00:00Z (09:00 local)", P.diaSaoPaulo("2026-11-16T12:00:00Z"), "2026-11-16");
// 23h local ainda é o mesmo dia.
check("2026-11-16T23:00:00Z (20:00 local)", P.diaSaoPaulo("2026-11-16T23:00:00Z"), "2026-11-16");

console.log("\n=== 8. Chaves determinísticas ===");
check("chaveMeta", P.chaveMeta(), "meta:apitou");
check("chaveDia", P.chaveDia("2026-11-16"), "dia:2026-11-16");
check("chaveJogo", P.chaveJogo(123), "jogo:123");
check("chaveDesajustes semana", P.chaveDesajustes("semana"), "desajustes:semana");

console.log(falhas ? `\n❌ ${falhas} falha(s)` : "\n✅ particoes ok");
process.exit(falhas ? 1 : 0);