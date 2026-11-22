/**
 * Sonda de desempate — SÓ LEITURA, 2 requisições, zero escrita.
 *
 * Pergunta que este script responde: a ordem que a regra de desempate produz
 * bate com o `position` que o fornecedor publica?
 *
 * Compara duas regras no MESMO payload (nenhuma requisição extra):
 *   FIFA        -> points, goalDifference, goalsFor
 *   BRASILEIRAO -> points, wins, goalDifference      (vitórias antes do saldo)
 *
 * Uso:  node scripts/probe-tiebreak.mjs
 */
import "dotenv/config";

const TOKEN = process.env.FOOTBALL_DATA_TOKEN;
if (!TOKEN) {
  console.error("FOOTBALL_DATA_TOKEN ausente.");
  process.exit(1);
}

const COMPETICOES = [
  { code: "SA", nome: "Serie A (ITA)" },
  { code: "BSA", nome: "Brasileirao Serie A" },
];

/*
 * ATENÇÃO ao nome do campo: o Football-Data v4 entrega `won`, `draw`, `lost`
 * — NÃO `wins`/`draws`/`losses`. Usar o nome errado lê `undefined -> 0`, o
 * termo desaparece do comparador e as duas regras passam a dar o mesmo
 * resultado. Foi exatamente esse o bug da primeira versão desta sonda.
 */
const REGRAS = {
  FIFA: ["points", "goalDifference", "goalsFor"],
  BRASILEIRAO: ["points", "won", "goalDifference"],
};

const cmpPorRegra = (regra) => (a, b) => {
  for (const campo of regra) {
    const va = Number(a[campo] ?? 0);
    const vb = Number(b[campo] ?? 0);
    if (va !== vb) return vb - va; // descendente
  }
  return String(a.team.name).localeCompare(String(b.team.name)); // desempate determinístico
};

async function buscarTabela(code) {
  const url = `https://api.football-data.org/v4/competitions/${code}/standings`;
  const res = await fetch(url, { headers: { "X-Auth-Token": TOKEN } });
  if (!res.ok) {
    throw new Error(`${code}: HTTP ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const tabela = (json.standings || []).find((b) => b.type === "TOTAL")?.table;
  if (!Array.isArray(tabela) || tabela.length === 0) {
    throw new Error(`${code}: resposta sem tabela TOTAL`);
  }
  return { linhas: tabela, temporada: json.season?.startDate ?? "?" };
}

/**
 * Falha cedo se algum campo da regra não existir no payload.
 * Sem isto, um nome de campo errado vira `undefined -> 0` e o comparador
 * fica cego em silêncio (foi o bug da v1 desta sonda).
 */
function validarCampos(linhas, regra, nomeRegra) {
  const faltando = regra.filter((c) => !Object.prototype.hasOwnProperty.call(linhas[0], c));
  if (faltando.length) {
    throw new Error(
      `Regra ${nomeRegra} usa campo(s) inexistente(s) no payload: ${faltando.join(", ")}. ` +
        `Campos disponíveis: ${Object.keys(linhas[0]).join(", ")}`,
    );
  }
}

/** Onde cada posição da regra diverge do `position` oficial do fornecedor. */
function divergencias(linhas, regra, nomeRegra) {
  const ordenado = [...linhas].sort(cmpPorRegra(regra));
  const out = [];
  ordenado.forEach((row, idx) => {
    const nossa = idx + 1;
    const oficial = Number(row.position);
    if (oficial !== nossa) {
      out.push({ oficial, nossa, time: row.team.name, pts: row.points, sg: row.goalDifference, v: row.won });
    }
  });
  return out;
}

const fmt = (l) => `#${String(l.position ?? "?").padStart(2)} ${l.team.name.padEnd(24).slice(0, 24)} P=${l.points} V=${l.won} E=${l.draw} D=${l.lost} GP=${l.goalsFor} GC=${l.goalsAgainst} SG=${l.goalDifference}`;

let falhou = false;

for (const comp of COMPETICOES) {
  console.log(`\n${"=".repeat(78)}\n${comp.nome} (${comp.code})`);
  let dados;
  try {
    dados = await buscarTabela(comp.code);
  } catch (e) {
    console.log(`  ERRO: ${e.message}`);
    falhou = true;
    continue;
  }
  console.log(`  temporada ${dados.temporada} · ${dados.linhas.length} times\n`);

  console.log("  Tabela como o fornecedor entrega (position oficial):");
  for (const l of [...dados.linhas].sort((a, b) => a.position - b.position)) {
    console.log("   " + fmt(l));
  }

  for (const [nomeRegra, regra] of Object.entries(REGRAS)) {
    let div;
    try {
      validarCampos(dados.linhas, regra, nomeRegra);
      div = divergencias(dados.linhas, regra, nomeRegra);
    } catch (e) {
      console.log(`\n  Regra ${nomeRegra} -> ERRO: ${e.message}`);
      falhou = true;
      continue;
    }
    console.log(`\n  Regra ${nomeRegra} -> ${regra.join(" > ")}`);
    if (div.length === 0) {
      console.log("    OK: bate 100% com o fornecedor.");
    } else {
      console.log(`    DIVERGE em ${div.length} posicao(oes):`);
      for (const d of div) {
        console.log(`      oficial #${d.oficial} vs regra #${d.nossa}  ${d.time}  (P=${d.pts} V=${d.v} SG=${d.sg})`);
      }
    }
  }
}

console.log(`\n${"=".repeat(78)}`);
console.log(falhou ? "Terminou COM erro em alguma competicao." : "Terminou sem erro de rede.");
