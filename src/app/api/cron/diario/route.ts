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
 *     04:00 UTC  ?acao=hub&fase=fixtures   → Hub: hoje-4 … hoje+2
 *     05:00 UTC  ?acao=rankings           → rankings das 6 ligas no Neon
 *     06:00 UTC  ?acao=hub&fase=context   → stats, H2H e contexto do dia
 *     07:00 UTC  ?acao=hub&fase=analyze   → análise + liquidação
 *     09:00 UTC  ?acao=pipeline           → sonda: "o app vai abrir vazio?"
 *     seg 02:00  ?acao=hub&fase=historico → backfill de 7 dias passados (semanal)
 *     a cada 1 min  /api/cron/live       → alertas de gol e kickoff
 *
 * STATUS HTTP (é o que faz o alarme existir):
 *   200 tudo rodou · 207 rodou parcial (etapa pulada por tempo) · 500 falhou.
 *   Antes, falha de apitou/hub ainda devolvia 200: Vercel verde, cron-job.org
 *   sem e-mail, e o sync podia ficar dias parado sem ninguém ver.
 *
 * Nenhuma etapa depende de estar na Vercel: todas exigem só o segredo e a URL.
 *
 * POR QUE AS FASES: o teto de execução de uma função no Hobby é curto e o Hub
 * inteiro (fixtures + contexto + análise + liquidação) é longo. Rodando tudo
 * numa invocação, a função pode ser morta NO MEIO de uma escrita — e o sintoma
 * é exatamente "o app abriu vazio". Dividido em fases, cada invocação faz uma
 * coisa, com orçamento de 45s, e cada uma é idempotente: se cair, roda de novo.
 *
 * POR QUE `fixtures` BUSCA `hoje - 4 ... hoje + 2`: buscar 3 dias passados +
 * 4 à frente dava 7 chamadas ao fornecedor e ~44s, perto do corte de 60s do
 * agendador externo. Quatro dias para trás é o mínimo que alcança a rodada de
 * fim de semana (com 1 ou 2 dias, as ligas que só jogam sábado/domingo ficavam
 * com ZERO jogo finalizado numa quarta-feira) e dois para frente mantêm a tela
 * cheia. A semana inteira fica na fase `historico`, semanal, como reposição.
 * Para mudar a janela numa execução só: `&historyDays=7`.
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
 *   - Manual: header `x-cron-secret: <CRON_SECRET>` ou `?secret=<CRON_SECRET>`
 *   - Fail-closed: sem CRON_SECRET configurada → 503.
 *
 * `CRON_SECRET` é a ÚNICA env aceita (`lib/cronAuth`). Não existe mais fallback
 * para PUSH_CRON_SECRET: era ele que fazia a rota responder "nenhum segredo"
 * mesmo com a variável principal configurada.
 *
 * Saúde do sync: `npm run hub:status` (última escrita por liga, fixtures
 * finalizadas, análises degeneradas). Uma etapa pulada por tempo NÃO aparece
 * como erro em lugar nenhum — esse script é o que mostra.
 *
 * HOUSEKEEPING: a ação diária (`tudo` / `apitou`, 03:00 UTC) também poda
 * `rate_limits` vencidos (`limparRateLimitsExpirados`) e devolve o resultado em
 * `limpeza`. Antes essa poda era um DELETE dentro de `rateLimit()`, ou seja, em
 * TODA requisição que passava por limite (login, cadastro, props, mercados).
 */

import { NextRequest, NextResponse } from "next/server";
import { motivoCronAutorizado, respostaNaoAutorizado } from "@/lib/cronAuth";
import { aquecerRankings } from "@/lib/rankingsWarm";
import { lerResumo, sincronizarEGravar } from "@/lib/apitou/store";
import { sincronizarArbitros } from "@/lib/arbitrosFonte";
import { runHubSync } from "@/lib/hub/sync-runner";
import { diagnosticarPipeline } from "@/lib/pipelineHealth";
import { limparRateLimitsExpirados } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
// 300s = maxDuration padrão do Fluid Compute em todos os planos (doc Vercel,
// 2026). Cada cron agora roda UMA etapa, então o teto é usado por inteiro.
export const maxDuration = 300;

const erro = (e: any) => String(e?.message || e || "falha").slice(0, 200);

export async function GET(req: NextRequest) {
  const motivo = motivoCronAutorizado(req);
  if (!motivo) {
    const bloqueio = respostaNaoAutorizado();
    return NextResponse.json(bloqueio.body, { status: bloqueio.status });
  }

  const acao = req.nextUrl.searchParams.get("acao") ?? "tudo";
  const out: Record<string, unknown> = { acao, motivo };

  /* Coleta de problemas para o status HTTP. Um cron só serve de alarme se o
     CÓDIGO DE STATUS mudar quando a etapa falha — é isso que faz a Vercel
     pintar vermelho e o cron-job.org disparar o e-mail "job failed".
       falhas   → 500: a etapa quebrou, nada (ou pouco) foi gravado
       parciais → 207: rodou, mas alguma parte foi pulada por orçamento
       200      → tudo que foi pedido rodou */
  const falhas: string[] = [];
  const parciais: string[] = [];

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
      return NextResponse.json({ ...out, ok: false, falhas: ["pipeline"] }, { status: 500 });
    }
    /* "magra" não é falha de execução, mas o app abre pobre: 207 avisa sem
       acusar o cron de quebrado. Só "vazia" é alarme de verdade. */
    const cob = (out.pipeline as { cobertura?: string } | undefined)?.cobertura;
    if (cob === "vazia") {
      return NextResponse.json({ ...out, ok: false, falhas: ["pipeline:vazia"] }, { status: 500 });
    }
    if (cob === "magra") {
      return NextResponse.json({ ...out, ok: true, parciais: ["pipeline:magra"] }, { status: 207 });
    }
    return NextResponse.json({ ...out, ok: true }, { status: 200 });
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
      falhas.push("apitou");
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
      falhas.push("rankings");
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
        /* DIÁRIO, o que precisa ser rápido: 4 dias atrás + hoje/amanhã/depois.
           O passado é o único insumo que o motor não pode inventar: sem placar
           finalizado, `recentMatches` volta vazio e a análise de toda a liga
           vira a média da liga. Com 2 dias atrás o problema persistia: liga
           europeia joga no FIM DE SEMANA e, numa quarta-feira, `hoje - 2` só
           alcança segunda e terça — Premier League, Libertadores, Europa e
           Conference League ficavam com ZERO finalizada (não é filtro: as
           quatro passam em `isMainLeague` e têm código próprio na ESPN).
           4 para trás pegam o sábado/domingo anterior. */
        fixtures: {
          dates: 2,
          historyDays: 4,
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
        /* BACKFILL — semanal, não diário.
           Repõe uma SEMANA inteira de passado de uma vez (o que a fase
           `fixtures` não faz todo dia para caber no timeout). Sete dias é o que
           garante pelo menos UMA rodada de cada liga — inclusive as que jogam
           só no fim de semana e as de copa continental no meio da semana. É
           isto que recupera o buraco de quem perdeu execuções e o começo de
           temporada. Idempotente: rodar 7 vezes seguidas não duplica nada. */
        historico: {
          dates: 0,
          historyDays: 7,
          contextEnabled: false,
          oddsEnabled: false,
          lineupsEnabled: false,
          analyze: false,
          settle: false,
        },
      };

      if (fase && !FASES[fase]) {
        out.hub = { ok: false, erro: `fase desconhecida: ${fase} (use fixtures, historico, context ou analyze)` };
        falhas.push(`hub:fase-invalida:${fase}`);
      } else {
        const budgetHub = (fase ? 45 : acao === "hub" ? 240 : 120) * 1000;
        const budgetParam = Number(req.nextUrl.searchParams.get("hubBudget"));
        const budgetMs = Number.isFinite(budgetParam) && budgetParam > 0 ? budgetParam * 1000 : budgetHub;
        if (fase) out.fase = fase;

        /* Ajuste fino por query, para quando o timeout do agendador for menor
           que o orçamento: `&dates=0&historyDays=0` roda só as próximas datas.
           Lido com `!== null` porque `Number(null)` é 0 e viraria override
           silencioso de um parâmetro que ninguém mandou. */
        const ajustes: Partial<Parameters<typeof runHubSync>[0]> = {};
        for (const [chave, nome] of [
          ["dates", "dates"],
          ["historyDays", "historyDays"],
        ] as const) {
          const bruto = req.nextUrl.searchParams.get(nome);
          if (bruto !== null && Number.isFinite(Number(bruto)) && Number(bruto) >= 0) {
            ajustes[chave] = Math.floor(Number(bruto));
          }
        }

        try {
          out.hub = await runHubSync({
            // Padrão (Hub inteiro): janela `hoje - 4 ... hoje + 3` — 3 dias à
            // frente para uma liga de elite sem jogo hoje não desaparecer do
            // hub, e 4 atrás porque é o que alcança a rodada de fim de semana.
            dates: 3,
            historyDays: 4,
            context: 24,
            // Odds dependem do plano pago da Sportmonks: ficam na rota manual.
            oddsEnabled: false,
            lineupsEnabled: false,
            analyze: true,
            settle: true,
            maxContext: 20,
            ...FASES[fase],
            ...ajustes,
            budgetMs,
          });

          /* Etapa pulada por tempo não é erro de execução, mas também não é
             sucesso: 207 deixa isso visível sem pintar o job de vermelho. */
          const puladas = (out.hub as { skipped?: string[] } | undefined)?.skipped;
          if (Array.isArray(puladas) && puladas.length) {
            parciais.push(`hub:${puladas.join(",")}`);
          }
        } catch (e) {
          out.hub = { ok: false, erro: erro(e) };
          falhas.push("hub");
        }
      }
    }
  }

  /* Rankings devolve contagem de falhas por liga: >0 é degradação, não morte
     do cron, então vira 207 (e não 500). */
  const rankings = out.rankings as { falhas?: number; puladas?: string[] } | undefined;
  if (rankings && typeof rankings.falhas === "number" && rankings.falhas > 0) {
    parciais.push(`rankings:${rankings.falhas}`);
  }

  /* HOUSEKEEPING: poda de `rate_limits` vencidos.

     Fica AQUI (uma vez por execução do cron diário) e não mais dentro de
     `rateLimit()`, onde um DELETE rodava no caminho crítico de TODO login,
     cadastro e rota cara. Roda na ação diária (`tudo` ou `apitou`), nunca nas
     sondas de leitura (`estado`, `pipeline`).

     Falha de limpeza NÃO entra em `falhas`: tabela de rate limit com linha
     velha não é incidente de produto, e derrubar o status do cron por isso
     faria o alarme de sync perder credibilidade. */
  if (acao === "tudo" || acao === "apitou") {
    out.limpeza = await limparRateLimitsExpirados();
  }

  if (falhas.length) {
    return NextResponse.json({ ...out, ok: false, falhas, ...(parciais.length ? { parciais } : {}) }, { status: 500 });
  }
  if (parciais.length) {
    return NextResponse.json({ ...out, ok: true, parciais }, { status: 207 });
  }
  return NextResponse.json({ ...out, ok: true }, { status: 200 });
}

export const POST = GET;
