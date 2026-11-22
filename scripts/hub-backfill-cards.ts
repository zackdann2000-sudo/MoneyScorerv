/**
 * BACKFILL de cartões — preenche `hub_fixture.yellow_cards`/`red_cards` a partir
 * do contexto de partida já gravado.
 *
 *   npx tsx scripts/hub-backfill-cards.ts                 # simulação (não escreve)
 *   npx tsx scripts/hub-backfill-cards.ts --apply          # grava o que falta
 *   npx tsx scripts/hub-backfill-cards.ts --apply --force  # regrava tudo
 *   npx tsx scripts/hub-backfill-cards.ts --league=BSA     # só o Brasileirão
 *   npx tsx scripts/hub-backfill-cards.ts --limit=50 --apply
 *
 * Por que este script existe:
 *
 *   As colunas `yellow_cards`/`red_cards` nasceram DEPOIS de o banco já ter
 *   meses de `hub_fixture_context`. O sync só escreve cartão quando coleta o
 *   contexto de novo, então os jogos antigos ficariam sem cartão para sempre —
 *   e a média da liga mostraria "não coletado" mesmo com o dado no banco.
 *
 * Regras de segurança:
 *
 *   - NÃO faz nenhuma chamada de rede. Lê só o JSON que já está em
 *     `hub_fixture_context.stats` (o sync é quem busca do fornecedor).
 *   - Padrão é SIMULAÇÃO. Escrever exige `--apply` explícito.
 *   - Só preenche o que está NULL. Jogo que já tem cartão gravado pelo sync é
 *     preservado; `--force` existe para o caso de o dado ter vindo errado.
 *   - Lote único `UPDATE ... FROM (VALUES ...)`: milhares de linhas custam
 *     poucas queries em vez de milhares de idas e voltas (Termux + banco
 *     remoto não perdoa N+1).
 */
import "dotenv/config";
import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "../src/db";
import { hubFixture, hubFixtureContext, hubLeague } from "../src/db/hub-schema";
import { extrairCartoes } from "../src/lib/hub/cartoes";
import { fdCompetitionCode } from "../src/lib/providers";

function arg(nome: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${nome}=`));
  if (hit) return hit.split("=")[1];
  return undefined;
}

const flag = (nome: string) => process.argv.includes(`--${nome}`);

const num = (v: string | undefined, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : def;
};

type Candidato = {
  fixtureId: number;
  stats: unknown;
  yellowAtual: number | null;
  redAtual: number | null;
};

type Patch = { fixtureId: number; yellow: number | null; red: number | null };

const TAMANHO_LOTE = 200;

/** Um UPDATE por lote, com COALESCE para nunca apagar o que já existe. */
async function aplicarLote(lote: Patch[]): Promise<number> {
  if (!lote.length) return 0;
  const valores = sql.join(
    lote.map((p) => sql`(${p.fixtureId}::int, ${p.yellow}::int, ${p.red}::int)`),
    sql`, `,
  );
  const res = await db.execute(sql`
    update ${hubFixture} as f
       set yellow_cards = coalesce(v.yellow, f.yellow_cards),
           red_cards    = coalesce(v.red, f.red_cards)
      from (values ${valores}) as v(fixture_id, yellow, red)
     where f.id = v.fixture_id
  `);
  // node-pg devolve rowCount; o driver do pool do projeto expõe como número.
  const rowCount = (res as unknown as { rowCount?: number | null }).rowCount;
  return rowCount ?? lote.length;
}

async function main() {
  const aplicar = flag("apply");
  const forcar = flag("force");
  const limite = arg("limit") ? num(arg("limit"), 0) : null;
  const liga = arg("league") ?? null;
  const tamanhoLote = num(arg("batch"), TAMANHO_LOTE);

  console.log(
    `[backfill-cards] modo=${aplicar ? "APPLY" : "SIMULAÇÃO"} sobrescrever=${forcar ? "sim" : "não"}` +
      `${limite ? ` limite=${limite}` : ""}${liga ? ` liga=${liga}` : ""}\n`,
  );

  /* ── 1. Lê contexto + estado atual das colunas ──
     `--league` aceita id interno, código do fornecedor ("BSA") ou código ESPN
     ("bra.1"). Os dois códigos são testados porque o Hub guarda uma linha de
     `hub_league` por FORNECEDOR: filtrar por um nome só deixaria metade dos
     jogos de fora.

     Select pelo construtor (e não SQL cru) de propósito: o retorno vem com as
     chaves já em camelCase. Em SQL cru as chaves seriam `fixture_id`,
     `yellow_atual`... e o lote do UPDATE receberia `undefined` em silêncio. */
  const codigos = liga
    ? [...new Set([liga.toUpperCase(), fdCompetitionCode(liga) ?? liga.toUpperCase()])]
    : [];

  const condicoes = [isNotNull(hubFixtureContext.stats)];
  if (!forcar) condicoes.push(or(isNull(hubFixture.yellowCards), isNull(hubFixture.redCards))!);
  if (liga) {
    const porLiga = [
      eq(hubLeague.slug, liga.toLowerCase()),
      inArray(hubLeague.externalRef, codigos),
    ];
    if (Number.isFinite(Number(liga))) porLiga.push(eq(hubFixture.leagueId, Number(liga)));
    condicoes.push(or(...porLiga)!);
  }

  /* Sem `--limit` o teto é alto de propósito: é um job de manutenção único. */
  const linhas: Candidato[] = await db
    .select({
      fixtureId: hubFixtureContext.fixtureId,
      stats: hubFixtureContext.stats,
      yellowAtual: hubFixture.yellowCards,
      redAtual: hubFixture.redCards,
    })
    .from(hubFixtureContext)
    .innerJoin(hubFixture, eq(hubFixture.id, hubFixtureContext.fixtureId))
    .innerJoin(hubLeague, eq(hubLeague.id, hubFixture.leagueId))
    .where(and(...condicoes))
    .orderBy(desc(hubFixture.matchDate))
    .limit(limite ?? 100_000);

  /* ── 2. Extrai os cartões e monta o que realmente muda ── */
  const patches: Patch[] = [];
  let comCartao = 0;
  let semCartao = 0;
  let jaPreenchidos = 0;

  for (const linha of linhas) {
    const cartoes = extrairCartoes(linha.stats);
    if (!cartoes) {
      semCartao++;
      continue;
    }
    comCartao++;

    const yellow = cartoes.yellow != null && (forcar || linha.yellowAtual == null) ? cartoes.yellow : null;
    const red = cartoes.red != null && (forcar || linha.redAtual == null) ? cartoes.red : null;

    if (yellow == null && red == null) {
      jaPreenchidos++;
      continue;
    }
    patches.push({ fixtureId: linha.fixtureId, yellow, red });
  }

  const soAmarelo = patches.filter((p) => p.yellow != null && p.red == null).length;
  const soVermelho = patches.filter((p) => p.red != null && p.yellow == null).length;
  const ambos = patches.filter((p) => p.yellow != null && p.red != null).length;

  console.log(
    JSON.stringify(
      {
        contextosLidos: linhas.length,
        comCartaoNoContexto: comCartao,
        contextoSemCartao: semCartao,
        jaPreenchidosIgnorados: jaPreenchidos,
        aGravar: patches.length,
        detalhe: { somenteAmarelo: soAmarelo, somenteVermelho: soVermelho, ambos },
        aplicado: aplicar,
      },
      null,
      2,
    ),
  );

  if (!aplicar) {
    console.log("\n[backfill-cards] simulação — nada foi gravado. Rode com --apply para escrever.");
    if (linhas.length === 0) {
      console.log("[backfill-cards] nenhum contexto com cartão faltando: nada a fazer (ou o sync já preencheu tudo).");
    }
    return;
  }

  /* ── 3. Grava em lotes ── */
  let gravados = 0;
  for (let i = 0; i < patches.length; i += tamanhoLote) {
    const lote = patches.slice(i, i + tamanhoLote);
    gravados += await aplicarLote(lote);
    console.log(`[backfill-cards] lote ${i / tamanhoLote + 1}: ${lote.length} linhas → ${gravados} acumuladas`);
  }
  console.log(`\n[backfill-cards] concluído: ${gravados} fixture(s) atualizada(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[backfill-cards] falhou:", e);
    process.exit(1);
  });
