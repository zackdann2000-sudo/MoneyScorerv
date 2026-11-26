import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { fcmTokens, users } from "@/db/schema";
import { cronConfigurado, motivoCronAutorizado, respostaNaoAutorizado } from "@/lib/cronAuth";
import { fcmDiagnostico } from "@/lib/fcm";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET|POST /api/push/status  —  DIAGNÓSTICO DO PUSH NATIVO (FCM)
 *
 * Responde a única pergunta que importa: "por que o push não sai?".
 *
 * Devolve, sem vazar segredo nenhum (só booleanos, contagens e domínio):
 *   - `servidor`: quais variáveis `FCM_*` existem e se a chave privada ASSINA
 *     de verdade (não basta estar preenchida);
 *   - `cliente`: quais `NEXT_PUBLIC_FIREBASE_*` chegaram ao build;
 *   - `tokens`: quantos aparelhos estão registrados em `fcm_tokens`, quantos
 *     são VIP/trial (os únicos que o alerta de valor usa) e quantos estão
 *     ligados a um usuário;
 *   - `deploy`: ambiente e commit, para confirmar que a Vercel está servindo
 *     o build novo (e não um preview com outro conjunto de envs).
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`, `x-cron-secret` ou `?secret=`
 * (mesmo `src/lib/cronAuth` do resto do projeto). Sem segredo configurado
 * responde 503 — falha fechada.
 */
async function handler(req: NextRequest) {
  const auth = motivoCronAutorizado(req);
  if (!auth) {
    const bloqueio = respostaNaoAutorizado();
    return NextResponse.json(bloqueio.body, { status: bloqueio.status });
  }

  const servidor = fcmDiagnostico();

  // O servidor também enxerga as NEXT_PUBLIC_*, mas quem decide o push no
  // navegador é o valor INLINE no bundle do build — aqui só indicamos se a
  // variável existia no ambiente desta execução.
  const cliente = {
    NEXT_PUBLIC_FIREBASE_API_KEY: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    NEXT_PUBLIC_FIREBASE_APP_ID: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    NEXT_PUBLIC_FIREBASE_VAPID_KEY: Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
  };

  const tokens = { total: 0, comUsuario: 0, vipTrial: 0, erro: undefined as string | undefined };
  try {
    const [linha] = await db
      .select({
        total: sql<number>`count(*)::int`,
        comUsuario: sql<number>`count(${fcmTokens.userId})::int`,
      })
      .from(fcmTokens);
    tokens.total = linha?.total ?? 0;
    tokens.comUsuario = linha?.comUsuario ?? 0;

    const vip = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(fcmTokens)
      .innerJoin(users, eq(fcmTokens.userId, users.id))
      .where(inArray(users.plan, ["vip", "trial"]));
    tokens.vipTrial = vip[0]?.n ?? 0;
  } catch (e: unknown) {
    tokens.erro = e instanceof Error ? e.message : String(e);
  }

  const pronto = servidor.ativo && tokens.total > 0;

  return NextResponse.json(
    {
      ok: pronto,
      autorizadoPor: auth,
      segredoConfigurado: cronConfigurado(),
      servidor,
      cliente,
      tokens,
      deploy: {
        ambiente: servidor.ambiente,
        commit: servidor.commit,
        regiao: process.env.VERCEL_REGION || "",
      },
      /** Checklist em ordem de causa, para ler o que falta sem interpretar JSON. */
      checklist: [
        servidor.ativo
          ? "1) OK — FCM do servidor configurado (projeto + service account + chave que assina)."
          : `1) FALTA — configure na Vercel as 3 variáveis de SERVIDOR: ${servidor.faltando.join(" | ")}. ATENÇÃO: as NEXT_PUBLIC_FIREBASE_* NÃO substituem estas.`,
        servidor.ativo
          ? "2) Envio de push habilitado no backend."
          : "2) Sem o item 1 nenhum push sai, mesmo com token salvo.",
        tokens.total > 0
          ? `3) OK — ${tokens.total} aparelho(s) com token registrado.`
          : "3) FALTA — abra /config no celular, marque o consentimento e toque em 'Ativar Notificações Push' (gera o token e faz POST /api/push/fcm-token).",
        tokens.vipTrial > 0
          ? `4) OK — ${tokens.vipTrial} token(s) de VIP/trial recebem os alertas de valor.`
          : "4) AVISO — nenhum token VIP/trial: os alertas de valor (EV ≥ 15%) não têm destinatário; o teste manual /api/cron/test-push usa todos os tokens.",
        pronto
          ? "Pronto: dispare GET /api/cron/test-push?dry=1 e depois sem `dry` para o teste real."
          : "Depois de corrigir, faça um NOVO deploy (não 'Redeploy' com cache) para o build pegar as NEXT_PUBLIC_*.",
      ],
    },
    { status: 200 },
  );
}

export async function GET(req: NextRequest) {
  return handler(req);
}

export async function POST(req: NextRequest) {
  return handler(req);
}
