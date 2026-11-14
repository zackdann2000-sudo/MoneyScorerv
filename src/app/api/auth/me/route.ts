import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/db";
import { users, visits } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (user) {
    const path = req.nextUrl.searchParams.get("path") || "/";
    try {
      await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
      await db.insert(visits).values({ userId: user.id, path });
    } catch {}
  }
  return NextResponse.json({ user });
}