/**
 * Sincronização das fontes do apitou.
 *
 * GET  /api/apitou/sync   -> dispara o sync (usado pelo Vercel Cron)
 * POST /api/apitou/sync   -> idem (para chamadas manuais/curl)
 * GET  /api/apitou/sync?estado=1 -> só informa o estado, não baixa nada
 * GET  /api/apitou/sync?forcar=1 -> ignora a janela de frescor e baixa de novo
 *
 * DONO ÚNICO: existe uma janela mínima entre sincronizações reais
 * (`MIN_REFRESH_MS`, padrão 6h). Quem chega dentro da janela recebe o resumo
 * atual com `pulado: true` — sem baixar 22 MB para reescrever o mesmo dado.
 * Os agendadores (Vercel Cron e GitHub Actions) respeitam a janela; a chave
 * manual força, porque quem chama é gente pedindo explicitamente.
 *
 * Duas formas de autorizar:
 *  1. Vercel Cron: envia `Authorization: Bearer $CRON_SECRET` automaticamente
 *     quando a env CRON_SECRET existe. É o caminho recomendado em produção.
 *  2. Manual: header `x-apitou-key` (ou ?key=) igual a APITOU_SYNC_KEY.
 *
 * Duração: o download é de ~22 MB e leva ~36s no total. O plano Hobby da Vercel
 * permite 300s por invocação com Fluid Compute (default e máximo), então cabe
 * com folga. `maxDuration` abaixo existe para deixar isso explícito — sem ele,
 * o default de alguns ambientes ainda pode ser 10s e a função morreria no meio.
 *
 * O plano B (GitHub Actions) está em .github/workflows/apitou-sync.yml, para o
 * caso de o limite de duração mudar ou de o projeto migrar de plano.
 */
import { NextRequest, NextResponse } from "next/server";
import { sincronizarEGravar, lerResumo, MIN_REFRESH_MS } from "@/lib/apitou/store";

export const dynamic = "force-dynamic";
// 300s = teto do Hobby. O sync real leva ~36s; a margem é para o pior caso
// (origem lenta ou arquivo maior em semana de muitas ligas).
export const maxDuration = 300;

/**
 * Compara em tempo constante para não vazar o tamanho/prefixo do segredo por
 * diferença de tempo de resposta. Simples, mas é o mínimo para um segredo.
 */
function iguaisSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Motivo da autorização, ou null se não autorizado. */
function motivoAutorizado(req: NextRequest): "cron" | "chave" | null {
  // 1) Vercel Cron com CRON_SECRET configurada.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth.startsWith("Bearer ") && iguaisSeguro(auth.slice(7), cronSecret)) return "cron";
  }

  // 2) Chave manual (operador).
  const chave = process.env.APITOU_SYNC_KEY;
  const enviada = req.headers.get("x-apitou-key") ?? req.nextUrl.searchParams.get("key") ?? "";
  if (chave && enviada && iguaisSeguro(enviada, chave)) return "chave";

  return null;
}

async function executarSync(req: NextRequest) {
  const motivo = motivoAutorizado(req);

  // Falha fechada: sem nenhum segredo configurado, ninguém dispara download.
  if (!motivo) {
    const nadaConfigurado = !process.env.CRON_SECRET && !process.env.APITOU_SYNC_KEY;
    return NextResponse.json(
      nadaConfigurado
        ? { error: "nenhum segredo configurado (CRON_SECRET ou APITOU_SYNC_KEY)" }
        : { error: "não autorizado" },
      { status: nadaConfigurado ? 503 : 401 },
    );
  }

  // ?estado=1: só consulta, nunca baixa. Útil para o cron verificar saúde.
  if (req.nextUrl.searchParams.get("estado") === "1") {
    const r = await lerResumo();
    const idadeMin = r ? Math.round((Date.now() - r.salvadoEm) / 60000) : null;
    return NextResponse.json({
      existe: Boolean(r),
      geradoEm: r?.geradoEm ?? null,
      salvoEm: r ? new Date(r.salvadoEm).toISOString() : null,
      idadeMin,
      /** A janela de frescor ainda vale? (false = próximo sync vai baixar) */
      dentroDaJanela: idadeMin != null && idadeMin < MIN_REFRESH_MS / 60000,
      janelaMin: Math.round(MIN_REFRESH_MS / 60000),
      jogos: r?.jogos.length ?? 0,
      avisos: r?.avisos.length ?? 0,
    });
  }

  try {
    const t0 = Date.now();
    // Agendador respeita a janela; operador com a chave manual força.
    const forcar = motivo === "chave" || req.nextUrl.searchParams.get("forcar") === "1";
    const r = await sincronizarEGravar({ forcar, origem: motivo });
    const dados = r.dados;
    console.log(`[apitou/sync] origem=${motivo} forcar=${forcar} em ${Date.now() - t0}ms`);
    return NextResponse.json({
      ok: true,
      origem: motivo,
      forcar,
      /** true = nada foi baixado, o dado já estava dentro da janela de frescor. */
      pulado: r.pulado,
      duracaoMs: Date.now() - t0,
      geradoEm: dados.geradoEm,
      atualizadoEm: new Date(dados.salvadoEm).toISOString(),
      idadeMin: Math.round((Date.now() - dados.salvadoEm) / 60000),
      jogos: dados.jogos.length,
      props: dados.jogos.reduce(
        (a, j) => a + j.jogadores.reduce((b, p) => b + Object.keys(p.props).length, 0),
        0,
      ),
      avisos: dados.avisos.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro desconhecido";
    console.error("[apitou/sync]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** O Vercel Cron chama com GET. */
export async function GET(req: NextRequest) {
  return executarSync(req);
}

/** Chamadas manuais e integrações preferem POST. */
export async function POST(req: NextRequest) {
  return executarSync(req);
}
