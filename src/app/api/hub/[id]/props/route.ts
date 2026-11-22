import { NextRequest, NextResponse } from "next/server";
import { getPropsDoTime, montarJogadores, PROPS_DISABLED } from "@/lib/playerProps";
import { montarDestaques } from "@/lib/playerPropsEngine";
import { getUser } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/hub/[id]/props?home=Flamengo&away=Palmeiras
 *
 * Bloco "Top jogadores por mercado" do detalhe do jogo no Hub.
 *
 * Regras de custo e de verdade:
 *  - Cache-first (24h em `player_props_cache`). Só quem tem acesso ativo
 *    (VIP/admin) pode gastar a cota da API-Football para aquecer a janela de
 *    10 jogos; os demais leem a amostra real já cacheada — ou recebem
 *    `semDados`, nunca um número inventado.
 *  - Cada card só exibe média com pelo menos MIN_AMOSTRA jogos do dado. Abaixo
 *    disso, o item vem com `media: null` e a UI mostra "Amostra insuficiente".
 */
const JANELA = Math.max(3, Math.min(10, Math.floor(Number(process.env.HUB_PROPS_MAX_JOGOS || 10))));

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const home = String(sp.get("home") || "").trim();
  const away = String(sp.get("away") || "").trim();

  if (!home || !away) {
    return NextResponse.json({ error: "Informe os nomes dos dois times (home/away)." }, { status: 400 });
  }

  if (PROPS_DISABLED) {
    return NextResponse.json({
      grupos: [],
      semDados: true,
      desativado: true,
      motivo: "Módulo de props desativado por configuração.",
      amostra: { janela: JANELA, casa: 0, fora: 0, temporadaCasa: null, temporadaFora: null },
    });
  }

  // Rate limit por IP: o bloco é carregado a cada abertura de jogo.
  const limite = await rateLimit(`hub-props:${id}`, clientIp(req), { limit: 30, windowSec: 3600 });
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente em instantes." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfterSec) } },
    );
  }

  // Props gastam cota paga: quem não tem acesso ativo recebe o cache, não a API.
  const user = await getUser().catch(() => null);
  const vip = !!user && (user.isAdmin || user.access.active);

  try {
    const [casa, fora] = await Promise.all([
      getPropsDoTime(home, { permitirApi: vip, jogos: JANELA }),
      getPropsDoTime(away, { permitirApi: vip, jogos: JANELA }),
    ]);

    const grupos = casa || fora ? montarDestaques(montarJogadores(casa, fora)) : [];
    const semDados = grupos.length === 0 || grupos.every((g) => g.itens.length === 0);

    return NextResponse.json({
      grupos,
      semDados,
      exclusivo: !vip && !casa && !fora,
      motivo: semDados
        ? vip
          ? "A API-Football não devolveu estatísticas individuais dos últimos jogos para estes times."
          : !vip && !casa && !fora
            ? "O scout individual é exclusivo para assinantes. Entre com uma conta ativa para liberar a coleta."
            : "A amostra cacheada ainda não cobre os últimos jogos destes times."
        : null,
      amostra: {
        janela: JANELA,
        casa: casa?.sample ?? 0,
        fora: fora?.sample ?? 0,
        temporadaCasa: casa?.season ?? null,
        temporadaFora: fora?.season ?? null,
      },
      fontes: { casa: casa?.fonte ?? null, fora: fora?.fonte ?? null },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Falha ao montar os destaques do confronto." },
      { status: 502 },
    );
  }
}
