/**
 * Sincronização das fontes do apitou.
 *
 * POST /api/apitou/sync   (protegido por header x-apitou-key)
 *
 * Roda o download dos 22 MB e grava o resumo no Neon. Fica FORA do fluxo do
 * usuário: a tela nunca espera esse download. Chame pelo cron da Vercel ou
 * manualmente após o deploy.
 *
 * Proteção: compara o header com APITOU_SYNC_KEY. Sem a env configurada a rota
 * responde 503 — falha fechada, para ninguém conseguir disparar downloads em
 * loop contra o site de origem.
 */
import { NextRequest, NextResponse } from "next/server";
import { sincronizarEGravar, lerResumo } from "@/lib/apitou/store";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function autorizado(req: NextRequest): boolean {
  const esperado = process.env.APITOU_SYNC_KEY;
  if (!esperado) return false;
  const enviado = req.headers.get("x-apitou-key") ?? req.nextUrl.searchParams.get("key");
  // Comparação simples: a chave é um segredo de operação, não de usuário.
  return enviado === esperado;
}

export async function POST(req: NextRequest) {
  if (!process.env.APITOU_SYNC_KEY) {
    return NextResponse.json(
      { error: "APITOU_SYNC_KEY não configurada; sincronização desabilitada" },
      { status: 503 },
    );
  }
  if (!autorizado(req)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  try {
    const t0 = Date.now();
    const dados = await sincronizarEGravar();
    return NextResponse.json({
      ok: true,
      duracaoMs: Date.now() - t0,
      geradoEm: dados.geradoEm,
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

/** Estado atual da sincronização (sem disparar download). */
export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const r = await lerResumo();
  if (!r) return NextResponse.json({ existe: false });
  return NextResponse.json({
    existe: true,
    geradoEm: r.geradoEm,
    salvadoEm: new Date(r.salvadoEm).toISOString(),
    idadeMin: Math.round((Date.now() - r.salvadoEm) / 60000),
    jogos: r.jogos.length,
    avisos: r.avisos.length,
  });
}
