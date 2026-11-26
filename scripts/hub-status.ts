/**
 * Saúde do sync do Hub — responde em segundos "o cron está rodando?".
 *
 * O sintoma que motivou este script: o Hub ficou 2 dias sem gravar nada
 * (`hub_fixture.updated_at` parado em 21/11) e ninguém percebeu. Sem fixture
 * finalizada no banco, `recentMatches` devolve lista vazia para todo time, o
 * xG vira a média da liga (o mesmo vetor para todos os jogos) e o portão
 * `amostraUtilizavel` recusa publicar análise — ou seja, a tela fica vazia e o
 * SEO continua em noindex, sem nenhum erro aparecer em lugar nenhum.
 *
 * Só LÊ o banco. Não faz build, não chama API, não escreve nada.
 *
 *   npx tsx scripts/hub-status.ts
 *   npm run hub:status
 *   npm run hub:status -- --json     # para monitor
 *
 * Saída: código 1 quando a saúde reprova (última escrita > LIMITE_HORAS ou
 * nenhuma fixture finalizada), 0 quando está saudável.
 */
import "dotenv/config";
import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { hubAnalysis, hubFixture, hubLeague } from "@/db/hub-schema";

const LIMITE_HORAS = Number(process.env.HUB_STATUS_HORAS ?? 30);
const JSON_OUT = process.argv.includes("--json");

type LigaStatus = {
  slug: string;
  fixtures: number;
  finalizadas: number;
  futuras: number;
  ultimaEscritaHoras: number | null;
};

async function main() {
  const agora = Date.now();

  const ligas = await db
    .select({
      slug: hubLeague.slug,
      fixtures: sql<number>`count(*)::int`,
      finalizadas: sql<number>`count(*) filter (where ${hubFixture.liveState} in ('FT','AET','PEN'))::int`,
      futuras: sql<number>`count(*) filter (where ${hubFixture.matchDate} > now())::int`,
      ultima: sql<string | null>`max(${hubFixture.updatedAt})`,
    })
    .from(hubFixture)
    .innerJoin(hubLeague, sql`${hubLeague.id} = ${hubFixture.leagueId}`)
    .groupBy(hubLeague.slug)
    .orderBy(hubLeague.slug);

  const status: LigaStatus[] = ligas.map((l) => ({
    slug: l.slug,
    fixtures: Number(l.fixtures),
    finalizadas: Number(l.finalizadas),
    futuras: Number(l.futuras),
    ultimaEscritaHoras: l.ultima ? Math.round((agora - new Date(l.ultima).getTime()) / 3600_000) : null,
  }));

  const [analises] = await db
    .select({
      total: sql<number>`count(*)::int`,
      distintas: sql<number>`count(distinct ${hubAnalysis.summary}::text)::int`,
      ultima: sql<string | null>`max(${hubAnalysis.createdAt})`,
    })
    .from(hubAnalysis);

  /**
   * Clones de verdade: mesma fixture, MESMO tipo e MESMO resumo em mais de uma
   * linha. É o sintoma do job que se auto-regenera (ou de duas execuções
   * concorrentes) — e o único caso em que a tabela está duplicada.
   *
   * A conta antiga era `distintas < total`, que acusava falso positivo: um
   * jogo tem `Preview v1` e `Final v2` legítimos, e quando o XI não muda a
   * entrada, os dois resumos saem iguais. O alarme tocava sem haver duplicata.
   */
  const [clones] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(
      db
        .select({ fixtureId: hubAnalysis.fixtureId, tipo: hubAnalysis.analysisType })
        .from(hubAnalysis)
        .groupBy(hubAnalysis.fixtureId, hubAnalysis.analysisType, sql`${hubAnalysis.summary}::text`)
        .having(sql`count(*) > 1`)
        .as("clones"),
    );

  const [ultimaFixture] = await db
    .select({ quando: hubFixture.updatedAt })
    .from(hubFixture)
    .orderBy(desc(hubFixture.updatedAt))
    .limit(1);

  const horasSync = ultimaFixture?.quando
    ? Math.round((agora - new Date(ultimaFixture.quando).getTime()) / 3600_000)
    : null;
  const totalFinalizadas = status.reduce((s, l) => s + l.finalizadas, 0);
  const totalFixtures = status.reduce((s, l) => s + l.fixtures, 0);
  const analisesClonadas = Number(clones?.n ?? 0);

  const problemas: string[] = [];
  if (horasSync == null) problemas.push("hub_fixture vazio: nenhum sync gravou fixture ainda");
  else if (horasSync > LIMITE_HORAS) problemas.push(`sync parado há ${horasSync}h (limite ${LIMITE_HORAS}h)`);
  if (totalFinalizadas === 0) problemas.push("nenhuma fixture finalizada: o motor não tem histórico (xG = média da liga)");
  if (analisesClonadas > 0)
    problemas.push(`${analisesClonadas} análise(s) duplicada(s): mesma fixture, tipo e resumo em mais de uma linha`);
  const semHistorico = status.filter((l) => l.finalizadas === 0 && l.futuras > 0);
  if (semHistorico.length) problemas.push(`${semHistorico.length} liga(s) com jogo futuro e ZERO finalizada(s): ${semHistorico.map((l) => l.slug).join(", ")}`);

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        { horasSync, limiteHoras: LIMITE_HORAS, totalFixtures, totalFinalizadas, analises, analisesClonadas, ligas: status, problemas },
        null,
        2,
      ),
    );
    process.exit(problemas.length ? 1 : 0);
  }

  const larg = Math.max(5, ...status.map((s) => s.slug.length));
  console.log("── Hub: idade do sync por liga ──────────────────────────────");
  console.log(`${"liga".padEnd(larg)}  fixtures  fin.  fut.  ultima escrita`);
  for (const l of status) {
    const idade = l.ultimaEscritaHoras == null ? "—" : `${l.ultimaEscritaHoras}h`;
    console.log(
      `${l.slug.padEnd(larg)}  ${String(l.fixtures).padStart(8)}  ${String(l.finalizadas).padStart(4)}  ${String(l.futuras).padStart(4)}  ${idade}`,
    );
  }

  console.log("");
  console.log("── Análises ────────────────────────────────────────────────");
  console.log(
    `  ${analises?.total ?? 0} linha(s), ${analises?.distintas ?? 0} resumo(s) distinto(s)` +
      `, ${analisesClonadas} clone(s)` +
      `, última em ${analises?.ultima ? new Date(analises.ultima).toISOString().slice(0, 16).replace("T", " ") : "—"}`,
  );

  console.log("");
  console.log("── Veredito ────────────────────────────────────────────────");
  console.log(`  última escrita em hub_fixture: ${horasSync == null ? "nunca" : `há ${horasSync}h`} (limite ${LIMITE_HORAS}h)`);
  console.log(`  fixtures: ${totalFixtures} | finalizadas: ${totalFinalizadas}`);
  if (!problemas.length) {
    console.log("  ✅ saudável");
    process.exit(0);
  }
  for (const p of problemas) console.log(`  ❌ ${p}`);
  console.log("");
  console.log("  Próximo passo: ver o log de /api/cron/diario na Vercel (401/503 = segredo,");
  console.log("  skipped/budget = tempo) ou rodar /api/hub/sync manualmente.");
  process.exit(1);
}

main().catch((e) => {
  console.error("Falha:", e instanceof Error ? e.message : e);
  process.exit(1);
});
