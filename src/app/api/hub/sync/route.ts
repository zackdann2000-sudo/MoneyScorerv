import { NextRequest, NextResponse } from "next/server";
import { runHubSync, type HubSyncOptions } from "@/lib/hub/sync-runner";
import { motivoCronAutorizado, cronConfigurado } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Teto do plano Hobby (Fluid Compute). Ajuste os limites abaixo se a execução
// encostar no teto — eles existem justamente para caber aqui.
export const maxDuration = 300;

const SEGREDO = "HUB_SYNC_SECRET";

/**
 * POST /api/hub/sync — roda o SISTEMA DE CASCATA do Hub no servidor.
 *
 * A ideia: o Termux não aguenta o `hub:sync` inteiro, mas a Vercel sim. Esta
 * rota executa exatamente a mesma orquestração do CLI (`src/lib/hub/sync-runner.ts`),
 * buscando os dados nas 4 APIs (ESPN, Football-Data.org, Sportmonks, Bzzoiro).
 *
 * Segurança (mesmo esquema das outras rotas internas):
 *   - Vercel Cron: `Authorization: Bearer $CRON_SECRET`
 *   - Manual: header `x-cron-secret: <HUB_SYNC_SECRET>` ou `?secret=`
 *
 * Query/body opcionais (todos com teto para caber no maxDuration):
 *   dates=1   dias futuros de fixtures (0 = só hoje)
 *   odds=6    janela de odds em horas
 *   lineups=3 janela de escalações em horas
 *   context=24 janela de stats/H2H em horas
 *   maxOdds=40 / maxLineups=30 / maxContext=20  tetos por etapa
 *   analyze=0 / settle=0  desliga as etapas finais
 *
 * Dica de execução no celular: chame em pedaços, ex.
 *   ?analyze=0&settle=0            (só coleta)
 *   ?dates=0&odds=0&lineups=0&context=0   (só análise + liquidação)
 */
function naoAutorizado() {
  return NextResponse.json(
    cronConfigurado(SEGREDO)
      ? { error: "não autorizado." }
      : { error: "nenhum segredo configurado (CRON_SECRET ou HUB_SYNC_SECRET)." },
    { status: cronConfigurado(SEGREDO) ? 401 : 503 },
  );
}

function montarOpcoes(body: Record<string, unknown>, sp: URLSearchParams): HubSyncOptions {
  const num = (v: unknown, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const flag = (v: unknown, def: boolean) => {
    if (v === undefined || v === null || v === "") return def;
    const s = String(v).toLowerCase();
    return !(s === "0" || s === "false" || s === "no" || s === "off");
  };
  const pick = (k: string) => body?.[k] ?? sp.get(k) ?? undefined;

  return {
    dates: Math.max(0, num(pick("dates"), 1)),
    odds: Math.max(0, num(pick("odds"), 6)),
    lineups: Math.max(0, num(pick("lineups"), 3)),
    context: Math.max(0, num(pick("context"), 24)),
    analyze: flag(pick("analyze"), true),
    settle: flag(pick("settle"), true),
    // Tetos conservadores para a função serverless: menos jogos por passo.
    maxOdds: Math.max(1, num(pick("maxOdds"), 40)),
    maxLineups: Math.max(1, num(pick("maxLineups"), 30)),
    maxContext: Math.max(1, num(pick("maxContext"), 20)),
  };
}

async function executar(req: NextRequest, body: Record<string, unknown>) {
  const motivo = motivoCronAutorizado(req, SEGREDO);
  if (!motivo) return naoAutorizado();

  const opcoes = montarOpcoes(body, req.nextUrl.searchParams);
  try {
    const report = await runHubSync(opcoes);
    return NextResponse.json({ ok: true, motivo, opcoes, report });
  } catch (e) {
    return NextResponse.json(
      { ok: false, motivo, opcoes, error: String((e as Error)?.message || e) },
      { status: 502 },
    );
  }
}

/** GET = Vercel Cron / navegador com ?secret=... */
export async function GET(req: NextRequest) {
  return executar(req, {});
}

/** POST = curl manual, aceita body JSON igual à query. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* body opcional */
  }
  return executar(req, body);
}
