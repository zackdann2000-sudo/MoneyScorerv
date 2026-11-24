/**
 * Cron diário — separado em 3 invocações por causa do TEMPO, não da cota.
 *
 * Histórico: esta rota já fez apitou + rankings + Hub numa invocação só, porque
 * o plano Hobby limita os cron jobs do projeto. Juntar tudo tinha efeito
 * colateral grave: apitou (~36s) + rankings (~50s) + Hub (orçamento 120s)
 * encostavam no teto de execução e o Hub era o primeiro a ser PULADO pelo
 * `budgetMs` — o banco chegou a ficar 41h sem fixture nova e ninguém viu,
 * porque etapa pulada não é erro.
 *
 * DESENHO ATUAL — a rota sabe fazer cada etapa sozinha, mas quem chama é que
 * decide. A Vercel fica com 2 crons (o limite do Hobby que adotamos como teto),
 * e o resto vai de agendador externo gratuito (cron-job.org), que não tem esse
 * limite. Passo a passo: `docs/DEPLOY_CHECKLIST.md` §5.1.
 *
 *   Na Vercel (vercel.json):
 *     03:00 UTC  ?acao=apitou        → fontes do apitou (`sincronizarEGravar`)
 *     13:00 UTC  /api/track-record/run → ledger de picks de valor
 *
 *   No cron-job.org (ou qualquer agendador externo):
 *     04:00 UTC  ?acao=hub&fase=fixtures → Hub: fixtures (histórico primeiro)
 *     05:00 UTC  ?acao=rankings          → rankings das 6 ligas no Neon
 *     06:00 UTC  ?acao=hub&fase=context  → stats, H2H e contexto do dia
 *     07:00 UTC  ?acao=hub&fase=analyze  → análise + liquidação
 *     09:00 UTC  ?acao=pipeline          → sonda: "o app vai abrir vazio?"
 *     a cada 1 min  /api/cron/live       → alertas de gol e kickoff
 *
 * Nenhuma etapa depende de estar na Vercel: todas exigem só o segredo e a URL.
 *
 * POR QUE AS FASES: o teto de execução de uma função no Hobby é curto e o Hub
 * inteiro (fixtures + contexto + análise + liquidação) é longo. Rodando tudo
 * numa invocação, a função pode ser morta NO MEIO de uma escrita — e o sintoma
 * é exatamente "o app abriu vazio". Dividido em três, cada invocação faz uma
 * coisa, com orçamento de 45s, e cada uma é idempotente: se cair, roda de novo.
 *
 * SONDA: `?acao=pipeline` lê só o banco (e a fonte, com `&ping=1`) e diz se há
 * fixture para hoje/amanhã — é como saber se a tela vai abrir vazia antes do
 * usuário reclamar.
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
import { sincronizarArbitros } from "@/lib/arbitrosFonte";
import { runHubSync } from "@/lib/hub/sync-runner";
import { diagnosticarPipeline } from "@/lib/pipelineHealth";

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

  /* Sonda de dados: "vai abrir vazio?" — não escreve nada. `&ping=1` faz UMA
     chamada à ESPN (contagem + latência) e só deve ser usada na mão. */
  if (acao === "pipeline") {
    const ping = req.nextUrl.searchParams.get("ping") === "1";
    try {
      out.pipeline = await diagnosticarPipeline({ ping });
    } catch (e) {
      out.pipeline = { ok: false, erro: erro(e) };
    }
    return NextResponse.json(out, { status: 200 });
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

    /* MÓDULO ÁRBITROS: reaproveita o resumo que acabou de ser gravado. É uma
       leitura de cache + 2 upserts, sem chamada nova a fornecedor — por isso
       cabe aqui e não em um cron separado (o Hobby limita o número de jobs).
       Falha de árbitro nunca derruba o pipeline: a função devolve ok:false. */
    try {
      out.arbitros = await sincronizarArbitros();
    } catch (e) {
      out.arbitros = { ok: false, erro: erro(e) };
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
      /* Fases: cada uma cabe num teto curto de execução. Sem `fase`, roda o
         Hub inteiro (manual / Fluid Compute, orçamento maior). Com `fase`, o
         orçamento cai para 45s — folga para a função não ser morta no meio de
         uma escrita, que é o que produz "app abrindo vazio". */
      const fase = (req.nextUrl.searchParams.get("fase") || "").trim().toLowerCase();

      /** Opções parciais por fase; o resto vem do padrão abaixo. */
      const FASES: Record<string, Partial<Parameters<typeof runHubSync>[0]>> = {
        // 3 dias passados (histórico do motor) + hoje, amanhã e depois.
        fixtures: {
          dates: 3,
          historyDays: 3,
          contextEnabled: false,
          oddsEnabled: false,
          lineupsEnabled: false,
          analyze: false,
          settle: false,
        },
        // Só o contexto do dia: stats, H2H e classificação usados na análise.
        context: {
          dates: 0,
          historyDays: 0,
          contextEnabled: true,
          context: 24,
          maxContext: 20,
          oddsEnabled: false,
          lineupsEnabled: false,
          analyze: false,
          settle: false,
        },
        // Análise + liquidação: o que precisa do contexto já gravado.
        analyze: {
          dates: 0,
          historyDays: 0,
          contextEnabled: false,
          oddsEnabled: false,
          lineupsEnabled: false,
          analyze: true,
          settle: true,
        },
      };

      if (fase && !FASES[fase]) {
        out.hub = { ok: false, erro: `fase desconhecida: ${fase} (use fixtures, context ou analyze)` };
      } else {
        const budgetHub = (fase ? 45 : acao === "hub" ? 240 : 120) * 1000;
        const budgetParam = Number(req.nextUrl.searchParams.get("hubBudget"));
        const budgetMs = Number.isFinite(budgetParam) && budgetParam > 0 ? budgetParam * 1000 : budgetHub;
        if (fase) out.fase = fase;

        try {
          out.hub = await runHubSync({
            // Padrão (Hub inteiro): hoje, amanhã e depois de amanhã — sem isto
            // uma liga de elite sem jogo hoje ficava ausente do hub. E 3 dias
            // passados alimentam `recentMatches` (motor sem histórico analisa
            // todos os jogos da liga igual).
            dates: 3,
            historyDays: 3,
            context: 24,
            // Odds dependem do plano pago da Sportmonks: ficam na rota manual.
            oddsEnabled: false,
            lineupsEnabled: false,
            analyze: true,
            settle: true,
            maxContext: 20,
            ...FASES[fase],
            budgetMs,
          });
        } catch (e) {
          out.hub = { ok: false, erro: erro(e) };
        }
      }
    }
  }

  const rankings = out.rankings as { falhas?: number; puladas?: string[] } | undefined;
  const todasOk = acao === "rankings" ? rankings?.falhas === 0 : true;
  return NextResponse.json(out, { status: todasOk ? 200 : 207 });
}

export const POST = GET;
