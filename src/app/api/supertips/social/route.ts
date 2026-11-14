import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { tipVotes, tipComments, tipLikes, tickets } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { commentList, likeCount } from "@/lib/supertips";
import { str, oneOf, objArray, jsonBytes } from "@/lib/validate";

const ACTIONS = ["vote", "comment", "like", "ticket"] as const;
/** Teto do jsonb de um bilhete — `legs` é gravado cru em `tickets.legs`. */
const MAX_TICKET_BYTES = 8192;

export const dynamic = "force-dynamic";

const CHOICES = new Set(["1", "X", "2"]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const matchId = sp.get("matchId") || "geral";
  const voter = sp.get("voter") || "";
  const target = sp.get("target") || "";
  try {
    const comments = await commentList(matchId);
    const likes = target ? await likeCount(target, voter) : null;
    return NextResponse.json({ comments, likes });
  } catch (e: any) {
    return NextResponse.json({ comments: [], error: e?.message });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = oneOf(body.action, ACTIONS);
    if (!action) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    const voterKey = str(body.voterKey, 64) || "";
    if (action === "vote") {
      if (!voterKey || voterKey.length < 8) return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
      const matchId = str(body.matchId, 64) || "";
      const choice = str(body.choice, 2) || "";
      if (!matchId || !CHOICES.has(choice)) return NextResponse.json({ error: "Voto inválido." }, { status: 400 });
      await db.insert(tipVotes).values({ matchId, voterKey, choice })
        .onConflictDoUpdate({ target: [tipVotes.matchId, tipVotes.voterKey], set: { choice } });
      return NextResponse.json({ ok: true });
    }
    if (action === "comment") {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: "Entre na conta para comentar." }, { status: 401 });
      const matchId = str(body.matchId, 40) || "geral";
      const text = (str(body.body, 400) || "").replace(/<[^>]*>/g, "").trim().slice(0, 280);
      if (text.length < 2) return NextResponse.json({ error: "Comentário muito curto." }, { status: 400 });
      await db.insert(tipComments).values({ matchId, userId: user.id, author: user.name, body: text });
      return NextResponse.json({ ok: true, comments: await commentList(matchId) });
    }
    if (action === "like") {
      if (!voterKey || voterKey.length < 8) return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
      const target = str(body.target, 80) || "";
      if (!target) return NextResponse.json({ error: "Alvo inválido." }, { status: 400 });
      const existing = await db.select().from(tipLikes).where(and(eq(tipLikes.voterKey, voterKey), eq(tipLikes.target, target))).limit(1);
      if (existing.length) await db.delete(tipLikes).where(eq(tipLikes.id, existing[0].id));
      else await db.insert(tipLikes).values({ voterKey, target });
      return NextResponse.json(await likeCount(target, voterKey));
    }
    if (action === "ticket") {
      const user = await getUser();
      // `legs` é jsonb gravado cru: exige array de objetos, com teto de itens e de bytes.
      const legs = objArray(body.legs, 12, 12);
      if (!legs) return NextResponse.json({ error: "Bilhete inválido." }, { status: 400 });
      if (jsonBytes(legs) > MAX_TICKET_BYTES) return NextResponse.json({ error: "Bilhete muito grande." }, { status: 400 });
      const title = str(body.title, 80) || "Múltipla";
      const rows = await db.insert(tickets).values({ userId: user?.id ?? null, title, legs }).returning();
      return NextResponse.json({ ok: true, id: rows[0].id });
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha." }, { status: 500 });
  }
}