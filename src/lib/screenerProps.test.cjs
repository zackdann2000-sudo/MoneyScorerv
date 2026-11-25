/**
 * Teste do Screener avançado (motor puro).
 *
 * As asserções são invariantes que qualquer screener honesto precisa cumprir:
 * janela recortada, nulo não vira zero, amostra mínima respeitada, sequência
 * contada do jogo mais recente para trás e filtro por taxa mínima.
 *
 * Rodar:
 *   ./scripts/unit-tests.sh screenerProps
 */
const {
  avaliarSerie,
  filtrarOrdenar,
  normalizarConsulta,
  descreverConsulta,
  metricaPorId,
  metricasDe,
  passou,
  MIN_AMOSTRA,
} = require("./screenerProps.js");

let falhas = 0;
function ok(nome, cond, detalhe = "") {
  if (cond) console.log(`✅ ${nome}`);
  else {
    falhas++;
    console.log(`❌ ${nome}${detalhe ? `\n   ${detalhe}` : ""}`);
  }
}

const OPTS = { condicao: "pelo_menos", linha: 2.5, janela: 5, taxaMinima: 60 };

/* ---------- condição ---------- */
ok("pelo_menos é estrito (3 > 2,5 e 2,5 não passa)", passou(3, "pelo_menos", 2.5) && !passou(2.5, "pelo_menos", 2.5));
ok("abaixo é estrito (2 < 2,5 e 2,5 não passa)", passou(2, "abaixo", 2.5) && !passou(2.5, "abaixo", 2.5));

/* ---------- janela e taxa ---------- */
const serie = [3, 4, 1, 5, 4]; // cronológica: o último (4) é o mais recente
const r = avaliarSerie(serie, OPTS);
ok("5 jogos na janela → amostra 5", r.amostra === 5, JSON.stringify(r));
ok("acertos = 4 (o 1 não passa)", r.acertos === 4, `acertos=${r.acertos}`);
ok("taxa = 80%", r.taxa === 80, `taxa=${r.taxa}`);
ok("sequência atual = 2 (4 e 4 no fim)", r.sequencia === 2, `seq=${r.sequencia}`);
ok("série é 1/0 na ordem cronológica", JSON.stringify(r.serie) === JSON.stringify([1, 1, 0, 1, 1]), JSON.stringify(r.serie));
ok("média confere", r.media === 3.4, `media=${r.media}`);

/* janela menor recorta só o fim da série */
const r3 = avaliarSerie(serie, { ...OPTS, janela: 3 });
ok("janela 3 usa os 3 jogos recentes (1,5,4) → 2/3", r3.amostra === 3 && r3.acertos === 2 && r3.taxa === 67, JSON.stringify(r3));

/* ---------- nulo NUNCA vira zero ---------- */
const comFalhas = [3, null, 4, undefined, 5, 6];
const rn = avaliarSerie(comFalhas, { ...OPTS, janela: 10 });
ok("nulos são pulados, não contados como 0", rn.amostra === 4 && rn.acertos === 4, JSON.stringify(rn));
ok("nulos não quebram a sequência", rn.sequencia === 4, `seq=${rn.sequencia}`);

/* ---------- amostra mínima ---------- */
ok("2 jogos com dado → null (não publica)", avaliarSerie([3, null, 4], OPTS) === null);
ok(`MIN_AMOSTRA = ${MIN_AMOSTRA}`, MIN_AMOSTRA === 3);

/* ---------- filtro e ordem ---------- */
const cand = (nome, taxa, sequencia, amostra) => ({
  id: nome,
  nome,
  contexto: "Time",
  avaliacao: { amostra, acertos: Math.round((taxa / 100) * amostra), taxa, serie: [], sequencia, media: 3, aprovado: taxa >= 60 },
});
const ordenado = filtrarOrdenar(
  [cand("C", 80, 1, 5), cand("A", 80, 3, 5), cand("B", 60, 9, 5), cand("D", 40, 0, 5)],
  70,
);
ok("descarta quem está abaixo da taxa mínima", ordenado.every((c) => c.avaliacao.taxa >= 70), ordenado.map((c) => c.nome).join(","));
ok("mesma taxa → sequência maior primeiro", ordenado[0].nome === "A", ordenado.map((c) => c.nome).join(","));
ok("D (40%) ficou de fora", !ordenado.some((c) => c.nome === "D"));

/* ---------- normalização da consulta ---------- */
const n1 = normalizarConsulta({ entidade: "time", metrica: "t_escanteios", condicao: "abaixo", linha: 3.5, janela: 10, taxaMinima: 65, liga: "bra.1" });
ok("consulta válida normaliza", n1.ok && n1.consulta.metrica === "t_escanteios" && n1.consulta.janela === 10 && n1.consulta.taxaMinima === 65);

const n2 = normalizarConsulta({ metrica: "t_cartoes", entidade: "jogador" });
ok("métrica de outra entidade cai na primeira da entidade", n2.ok && n2.consulta.metrica === metricasDe("jogador")[0].id, n2.ok ? n2.consulta.metrica : "falhou");

const n3 = normalizarConsulta({ entidade: "jogador", janela: 7, taxaMinima: 10, linha: 999 });
ok("janela inválida vira 5", n3.consulta.janela === 5);
ok("taxa mínima tem piso (50)", n3.consulta.taxaMinima === 50);
ok("linha tem teto (50)", n3.consulta.linha === 50);

const n4 = normalizarConsulta(null);
ok("corpo vazio não explode", n4.ok === true);
ok("entidade padrão é jogador", n4.consulta.entidade === "jogador");

/* ---------- metadados ---------- */
ok("métrica inexistente → null", metricaPorId("nao_existe") === null);
ok("jogador tem passes certos", !!metricaPorId("j_passes_certos"));
ok("time tem escanteios em etapa B", metricaPorId("t_escanteios")?.etapa === "B");
ok("time tem gols em etapa A", metricaPorId("t_gols_marcados")?.etapa === "A");

const desc = descreverConsulta(normalizarConsulta({ entidade: "jogador", metrica: "j_passes_certos", linha: 29.5, janela: 5, taxaMinima: 70 }).consulta);
ok("descrição cita métrica, linha, taxa e janela", /passes certos/i.test(desc) && /29.5/.test(desc) && /70%/.test(desc) && /5 jogos/.test(desc), desc);

if (falhas) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nscreenerProps: tudo certo.");
