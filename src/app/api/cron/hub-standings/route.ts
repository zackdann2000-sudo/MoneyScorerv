/**
 * Cron de classificação — escreve o retrato em `hub_standing` (Gap G1).
 *
 *   GET /api/cron/hub-standings
 *   GET /api/cron/hub-standings?codes=BSA,SA       (subconjunto)
 *   GET /api/cron/hub-standings?codes=BSA&force=1
 *
 * Autorização no esquema único do projeto (`lib/cronAuth`):
 *   - Vercel Cron: `Authorization: Bearer $CRON_SECRET`
 *   - Manual: header `x-cron-secret` ou `?secret=` (mesmo $CRON_SECRET)
 *   - Fail-closed: sem CRON_SECRET configurada -> 503
 *
 * Por que as competições rodam em SÉRIE com pausa:
 * o plano gratuito do Football-Data.org aceita ~10 requisições por minuto.
 * Disparar 9 competições juntas estoura o limite e o fornecedor devolve 429
 * para TODAS, inclusive para o sync de fixtures de outros jobs. Uma pausa de
 * 6,5s entre competições mantém ~9 req/min e custa ~1 min no total.
 *
 * Uma competição que falha NÃO impede as outras: cada uma tem seu try/catch e
 * o relatório diz quem respondeu. O retrato anterior daquela liga continua
 * válido — tabela velha é melhor que tabela errada.
 */
import { NextRequest, NextResponse } from "next/server";
import { cronConfigurado, motivoCronAutorizado, respostaNaoAutorizado } from "@/lib/cronAuth";
import { db } from "@/db";
import { hubJobLog } from "@/db/hub-schema";
import { eq } from "drizzle-orm";
import {
  COMPETICOES_PADRAO,
  sincronizarClassificacao,
  type RelatorioClassificacao,
} from "@/lib/hub/standings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));
const erro = (e: unknown) => String((e as Error)?.message ?? e ?? "falha").slice(0, 300);

export async function GET(req: NextRequest) {
  if (!cronConfigurado()) {
    const bloqueio = respostaNaoAutorizado();
    return NextResponse.json(bloqueio.body, { status: bloqueio.status });
  }
  const motivo = motivoCronAutorizado(req);
  if (!motivo) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });

  const pedido = req.nextUrl.searchParams.get("codes");
  const codigos = pedido
    ? pedido.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : [...COMPETICOES_PADRAO];

  if (codigos.length === 0) {
    return NextResponse.json({ error: "Nenhum código de competição informado." }, { status: 400 });
  }
  // Teto duro: sem isto um `codes=` gigante segura a função por 300s e ainda
  // toma 429 do fornecedor.
  if (codigos.length > 12) {
    return NextResponse.json({ error: "Máximo de 12 competições por execução." }, { status: 400 });
  }

  const [log] = await db
    .insert(hubJobLog)
    .values({ jobName: "hub-standings", status: "running", detail: { codigos } })
    .returning({ id: hubJobLog.id });

  const inicio = Date.now();
  const ok: RelatorioClassificacao[] = [];
  const falhas: Array<{ codigo: string; erro: string }> = [];
  let parouPorTempo = false;

  for (let i = 0; i < codigos.length; i++) {
    // Orçamento de tempo: serverless não continua depois de responder.
    if (Date.now() - inicio > 240_000) {
      parouPorTempo = true;
      break;
    }
    const codigo = codigos[i];
    try {
      ok.push(await sincronizarClassificacao(codigo));
    } catch (e) {
      falhas.push({ codigo, erro: erro(e) });
    }
    // Polidez com o rate limit (e não depois da última, para não atrasar a resposta).
    if (i < codigos.length - 1) await pausa(6500);
  }

  const relatorio = {
    job: "hub-standings",
    motivo,
    duracaoMs: Date.now() - inicio,
    competencias: ok,
    falhas,
    parouPorTempo,
    /* Soma de divergências: > 0 significa que nossa regra discorda do
       fornecedor em alguma posição. Vale investigar — é o sintoma do bug de
       desempate que a sonda `scripts/probe-tiebreak.mjs` reproduz. */
    divergenciasTotais: ok.reduce((s, r) => s + r.divergencias, 0),
    tabelasNaoConfiaveis: ok.filter((r) => !r.confiavel).map((r) => r.codigo),
  };

  await db
    .update(hubJobLog)
    .set({
      status: falhas.length === 0 ? "ok" : ok.length > 0 ? "ok" : "error",
      finishedAt: new Date(),
      error: falhas.length ? falhas.map((f) => `${f.codigo}: ${f.erro}`).join(" | ").slice(0, 900) : null,
      detail: relatorio,
    })
    .where(eq(hubJobLog.id, log.id));

  return NextResponse.json(relatorio, { status: ok.length === 0 ? 502 : 200 });
}
