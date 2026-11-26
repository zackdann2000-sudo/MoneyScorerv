import { NextRequest, NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { fcmTokens } from "@/db/schema";
import { cronConfigurado, motivoCronAutorizado, respostaNaoAutorizado } from "@/lib/cronAuth";
import { FCM_ENABLED, sendFcmToTokens } from "@/lib/fcm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET|POST /api/cron/test-push  —  ROTA TEMPORÁRIA DE DIAGNÓSTICO
 *
 * Dispara UM push real (FCM HTTP v1) para TODOS os tokens salvos em
 * `fcm_tokens`, com o mesmo payload de um gol — serve para provar que o push
 * NATIVO chega com o app FECHADO (tela de bloqueio / bandeja do sistema).
 *
 * Payload fixo (não aceita texto do usuário: era assim que a rota antiga
 * `/api/testar-alerta` deixava qualquer visitante injetar título):
 *   title: "⚽ Teste GreenScore"
 *   body:  "Se você recebeu isso com o app fechado, o Push Nativo está funcionando!"
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel) ou `?secret=` /
 * `x-cron-secret` com o MESMO segredo (`src/lib/cronAuth`). Sem segredo
 * configurado responde 503 — falha fechada.
 *
 * Query opcionais:
 *   ?dry=1  → conta os tokens e NÃO envia (confere a infraestrutura).
 *
 * SEGURANÇA: mandar para toda a base é o objetivo do teste, então esta rota
 * deve ser removida (ou desativada) depois da validação.
 */
const TITULO = "⚽ Teste GreenScore";
const CORPO = "Se você recebeu isso com o app fechado, o Push Nativo está funcionando!";

async function handler(req: NextRequest) {
  // 1) autorização: mesmo CRON_SECRET usado pelo resto do projeto
  const auth = motivoCronAutorizado(req);
  if (!auth) {
    const bloqueio = respostaNaoAutorizado();
    return NextResponse.json(bloqueio.body, { status: bloqueio.status });
  }

  const dry = req.nextUrl.searchParams.get("dry") === "1";

  try {
    // 2) todos os tokens do banco (uma query)
    const linhas = await db.select({ token: fcmTokens.token }).from(fcmTokens);
    const tokens = [...new Set(linhas.map((l) => l.token).filter(Boolean))];

    const diagnostico = {
      rota: "/api/cron/test-push",
      autorizadoPor: auth,
      fcmConfigurado: FCM_ENABLED,
      segredoConfigurado: cronConfigurado(),
    };

    if (!tokens.length) {
      return NextResponse.json({
        ok: false,
        ...diagnostico,
        tokens: 0,
        erro: "Nenhum token em fcm_tokens — abra o app, permita notificações e registre o token antes do teste.",
      });
    }

    if (dry) {
      return NextResponse.json({
        ok: true,
        ...diagnostico,
        dry: true,
        tokens: tokens.length,
        enviados: 0,
        mensagem: "dry-run: nenhum push enviado.",
      });
    }

    // 3) envio real — mesmo caminho do alerta de gol (`sendFcmToTokens`)
    const r = await sendFcmToTokens(tokens, {
      title: TITULO,
      body: CORPO,
      url: "/",
      tag: "teste-greenscore",
      data: { tipo: "teste", url: "/" },
    });

    // 4) limpa tokens que a FCM reportou como inválidos/desregistrados
    if (r.invalidos.length) {
      await db.delete(fcmTokens).where(inArray(fcmTokens.token, r.invalidos)).catch(() => {});
    }

    return NextResponse.json(
      {
        ok: r.ok,
        ...diagnostico,
        tokens: tokens.length,
        enviados: r.enviados,
        falhas: r.falhas,
        removidos: r.invalidos.length,
        ...(r.erro ? { erro: r.erro } : {}),
        payload: { title: TITULO, body: CORPO },
      },
      { status: r.ok ? 200 : r.enviados > 0 ? 207 : 502 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Falha ao disparar o push de teste." },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
