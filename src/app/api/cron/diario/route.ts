/**
 * Cron diário — separado em 3 invocações por causa do TEMPO, não da cota.
 *
 * Histórico: esta rota já fez apitou + rankings + Hub numa invocação só, porque
 * o plano Hobby tinha cota de 2 cron jobs. Isso deixou de existir: desde jan/2026
 * todo plano aceita 100 crons por projeto (o Hobby só exige que cada um rode no
 * máximo 1x por dia). O efeito colateral da versão antiga era grave: apitou
 * (~36s) + rankings (~50s) + Hub (orçamento 120s) encostavam no teto de 300s e
 * o Hub era o primeiro a ser PULADO pelo `budgetMs` — o banco ficou 41h sem
 * fixture nova e ninguém viu, porque etapa pulada não é erro.
 *
 * Agora cada etapa tem a sua invocação e o seu orçamento inteiro:
 *   03:00 UTC  ?acao=apitou    → fontes do apitou (`sincronizarEGravar`)
 *   04:00 UTC  ?acao=hub       → Hub: fixtures (histórico primeiro), context, análise, liquidação
 *   05:00 UTC  ?acao=rankings  → pré-aquece os rankings das 6 ligas e grava no Neon
 *   13:00 UTC  /api/track-record/run → ledger de picks de valor
 *
 * Atenção (Hobby): o cron roda 1x por dia dentro da hora escolhida (±59 min),
 * então a ORDEM vem da distância de 1h entre os horários, não do minuto. Como
 * cada etapa é idempotente, uma ordem trocada não corrompe nada — só atrasa.
 *
 * `?acao=tudo` continua funcionando para rodar as três de uma vez na mão.
 *
 * Sobre o Hub: função serverless NÃO continua rodando depois de responder, então
 * "background" aqui é um orçamento de tempo (`budgetMs`) dentro do maxDuration —
 * se o relógio estourar, as etapas seguintes são PULADAS e marcadas em
 * `hub.skipped`, nunca deixamos a função morrer no meio de uma escrita.
 * As odds ficam de fora do cron (a Sportmonks free bloqueia) e continuam na
 * rota manual `/api/hub/sync`. Desligue com `?hub=0`.
 *
 * Autorização (mesmo esquema das outras rotas internas):
 *   - Vercel Cron: `Authorization: Bearer $CRON_SECRET`
 *   - Manual: header `x-cron-secret: <PUSH_CRON_SECRET>` ou `?secret=`
 *   - Fail-closed: sem nenhum segredo configurado → 503.
 *
 * Saúde do sync: `npm run hub:status` (última escrita por liga, fixtures
 * finalizadas, análises degeneradas). Uma etapa pulada por tempo NÃO aparece
 * como erro em lugar nenhum — esse script é o que mostra.
 */

import { NextRequest, NextResponse } from "next/server";
import { cronConfigurado, motivoCronAutorizado } from "@/lib/cronAuth";
import { aquecerRankings } from "@/lib/rankingsWarm";
import { lerResumo, sincronizarEGravar } from "@/lib/apitou/store";
import { runHubSync } from "@/lib/hub/sync-runner";

export const dynamic = "force-dynamic";
// 300s = maxDuration padrão do Fluid Compute em todos os planos (doc Vercel,
// 2026). Cada cron agora roda UMA etapa, então o teto é usado por inteiro.
export const maxDuration = 300;

const erro = (e: any) => String(e?.message || e || "falha").slice(0, 200);

export async function GET(req: NextRequest) {
  const motivo = motivoCronAutorizado(req, "PUSH_CRON_SECRET");
  if (!motivo) {
    return NextResponse.json(
      {
        error: cronConfigurado("PUSH_CRON_SECRET")
          ? "não autorizado."
          : "nenhum segredo configurado (CRON_SECRET ou PUSH_CRON_SECRET).",
      },
      { status: cronConfigurado("PUSH_CRON_SECRET") ? 401 : 503 },
    );
  }

  const acao = req.nextUrl.searchParams.get("acao") ?? "tudo";
  const out: Record<string, unknown> = { acao, motivo };

  if (acao === "estado") {
    out.apitou = await lerResumo().catch(() => null);
    return NextResponse.json(out);
  }

  if (acao === "tudo" || acao === "apitou") {
    const t0 = Date.now();
    try {
      const r = await sincronizarEGravar({ origem: "cron" });
      out.apitou = {
        ok: true,
        pulado: r.pulado,
        duracaoMs: Date.now() - t0,
        jogos: r.dados.jogos.length,
        geradoEm: r.dados.geradoEm,
      };
    } catch (e) {
      out.apitou = { ok: false, duracaoMs: Date.now() - t0, erro: erro(e) };
    }
  }

  if (acao === "tudo" || acao === "rankings") {
    const ligas = (req.nextUrl.searchParams.get("ligas") || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      out.rankings = await aquecerRankings({ ligas: ligas.length ? ligas : undefined });
    } catch (e) {
      out.rankings = { ok: false, erro: erro(e) };
    }
  }

  if (acao === "tudo" || acao === "hub") {
    const hubAtivo = req.nextUrl.searchParams.get("hub") !== "0";
    if (!hubAtivo) {
      out.hub = { skipped: true, reason: "desligado por ?hub=0" };
    } else {
      /* Orçamento por invocação: `?acao=hub` roda sozinho e pode usar quase todo
         o teto. Em `?acao=tudo` (manual) apitou e rankings já consumiram tempo,
         então o Hub fica com o pedaço menor. Era exatamente esse teto apertado
         que fazia o Hub ser pulado todo dia sem erro visível. */
      const budgetHub = (acao === "hub" ? 240 : 120) * 1000;
      const budgetParam = Number(req.nextUrl.searchParams.get("hubBudget"));
      const budgetMs = Number.isFinite(budgetParam) && budgetParam > 0 ? budgetParam * 1000 : budgetHub;
      try {
        out.hub = await runHubSync({
          // Hoje, amanhã e depois de amanhã: sem isto a base só tinha o dia
          // corrente e uma liga de elite sem jogo hoje (Champions, Europa
          // League) ficava ausente do hub mesmo com partidas marcadas.
          dates: 3,
          // 3 dias passados: alimenta `recentMatches` e evita a análise igual
          // para todos os jogos da liga (motor sem histórico).
          historyDays: 3,
          context: 24,
          // Odds dependem do plano pago da Sportmonks: ficam na rota manual.
          oddsEnabled: false,
          lineupsEnabled: false,
          analyze: true,
          settle: true,
          maxContext: 20,
          budgetMs,
        });
      } catch (e) {
        out.hub = { ok: false, erro: erro(e) };
      }
    }
  }

  const rankings = out.rankings as { falhas?: number; puladas?: string[] } | undefined;
  const todasOk = acao === "rankings" ? rankings?.falhas === 0 : true;
  return NextResponse.json(out, { status: todasOk ? 200 : 207 });
}

export const POST = GET;
