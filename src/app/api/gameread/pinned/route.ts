/**
 * Props fixadas no radar do GameRead ("Pinar no Radar").
 *
 *   GET    /api/gameread/pinned           → lista as props do usuário
 *   POST   /api/gameread/pinned           → { prop, on }  (on=false remove)
 *
 * Escopo por usuário, como /api/favorites. Sem login, a rota responde `anon`
 * e o cliente mantém o estado apenas na sessão (não gravamos nada anônimo:
 * não há chave estável para amarrar o registro).
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { gamereadPinnedProps } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { str, MAX_STR } from "@/lib/validate";

export const dynamic = "force-dynamic";

/** Limite de pins por usuário: lista útil, sem virar lixeira. */
const MAX_PINS = 200;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ pinned: [], anon: true });

  try {
    const rows = await db
      .select()
      .from(gamereadPinnedProps)
      .where(eq(gamereadPinnedProps.userId, user.id))
      .orderBy(desc(gamereadPinnedProps.createdAt))
      .limit(MAX_PINS);

    return NextResponse.json({
      pinned: rows.map((r) => ({
        id: r.id,
        propKey: r.propKey,
        market: r.market,
        marketLabel: r.marketLabel,
        selection: r.selection,
        line: r.line,
        odd: r.odd,
        bookmaker: r.bookmaker,
        subjectName: r.subjectName,
        subjectPhoto: r.subjectPhoto,
        homeName: r.homeName,
        awayName: r.awayName,
        leagueName: r.leagueName,
        fixtureId: r.fixtureId,
        kickoffUtc: r.kickoffUtc,
        hitRateL10: r.hitRateL10,
        score: r.score,
        createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    // Tabela ainda não criada no banco (SQL não rodado): a UI não deve quebrar.
    return NextResponse.json(
      { pinned: [], error: "Não foi possível ler as props fixadas.", detail: e instanceof Error ? e.message : String(e) },
      { status: 200 },
    );
  }
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ ok: false, anon: true });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as { prop?: Record<string, unknown>; on?: boolean };
  const prop = b?.prop ?? {};
  const propKey = str(prop.id, 200);
  if (!propKey) return NextResponse.json({ error: "Prop inválida." }, { status: 400 });

  try {
    if (b?.on === false) {
      await db
        .delete(gamereadPinnedProps)
        .where(and(eq(gamereadPinnedProps.userId, user.id), eq(gamereadPinnedProps.propKey, propKey)));
      return NextResponse.json({ ok: true, pinned: false });
    }

    // Limite defensivo: não deixa a tabela crescer sem controle.
    const existing = await db
      .select({ id: gamereadPinnedProps.id })
      .from(gamereadPinnedProps)
      .where(eq(gamereadPinnedProps.userId, user.id));
    if (existing.length >= MAX_PINS) {
      return NextResponse.json({ error: `Limite de ${MAX_PINS} props fixadas atingido.` }, { status: 400 });
    }

    await db
      .insert(gamereadPinnedProps)
      .values({
        userId: user.id,
        propKey,
        market: str(prop.market, 80) ?? "",
        marketLabel: str(prop.marketLabel, 120) ?? "",
        selection: str(prop.selection, 16) ?? "",
        line: num(prop.line),
        odd: num(prop.odd),
        bookmaker: str(prop.bookmaker, 60) ?? "",
        subjectName: str(prop.subjectName, MAX_STR) ?? "",
        subjectPhoto: str(prop.subjectPhoto, 500) ?? "",
        homeName: str(prop.homeName, MAX_STR) ?? "",
        awayName: str(prop.awayName, MAX_STR) ?? "",
        leagueName: str(prop.leagueName, MAX_STR) ?? "",
        fixtureId: str(prop.fixtureId, 80) ?? "",
        kickoffUtc: str(prop.kickoffUtc, 40) ?? "",
        hitRateL10: num(prop.hitRateL10),
        score: num(prop.score),
      })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true, pinned: true });
  } catch (e) {
    return NextResponse.json(
      { error: "Não foi possível salvar.", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
