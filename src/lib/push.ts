import webpush from "web-push";
import { db } from "@/db";
import { pushSubs, alertPrefs, alertState } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAllMatches, getSummaryRaw, normEvents, normStats, todayYmd, type Match } from "./espn";
import { getKey } from "./keys";
import { cached } from "./cache";

export const ONESIGNAL_APP_ID = "f06a705d-ebd0-4390-9a11-207fe769b81d";

/**
 * Chaves VAPID.
 *
 * SEGURANÇA: a chave PRIVADA só é lida de `process.env.VAPID_PRIVATE_KEY`.
 * Antes havia um fallback literal no código — a chave privada ficava no
 * histórico do git e em qualquer cópia do repositório, permitindo que
 * terceiros assinassem pushes em nome do app. O fallback foi removido;
 * se a variável não estiver definida, o push nativo fica desabilitado
 * (degradação controlada) em vez de usar uma chave vazada.
 *
 * TODO(segurança): rotacionar o par VAPID que estava no código, pois o
 * valor anterior deve ser considerado comprometido (`npx web-push
 * generate-vapid-keys`).
 *
 * A chave PÚBLICA pode ter fallback: ela é enviada ao navegador por design.
 */
export const VAPID_PUBLIC =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BKhuZ7nBFVRlc05eRSMpZylx3OVimtudepf-5qLEHVIM83frLg50lyTz8qnHuMLA01BIw8DBAza5pONrM8sSh7M";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contato@greenscore.app";

/** true quando há par VAPID válido configurado via ambiente. */
export const VAPID_ENABLED = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);

if (VAPID_ENABLED) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  } catch (e) {
    console.error("[push] VAPID malformada; push nativo desabilitado", e instanceof Error ? e.message : e);
  }
} else if (process.env.NODE_ENV === "production") {
  console.warn("[push] VAPID_PRIVATE_KEY ausente — push nativo desabilitado (use OneSignal ou configure a env).");
}

/* ============ OneSignal REST (rich push) ============ */
export async function pushOneSignal(opts: { title: string; body: string; url?: string; icon?: string; tagKey?: string; extraTags?: Record<string, string> }) {
  const restKey = await getKey("onesignal_rest");
  if (!restKey) return { ok: false, reason: "REST key não configurada (Admin → APIs → OneSignal REST)" };
  const payload: any = {
    app_id: ONESIGNAL_APP_ID,
    headings: { en: opts.title, pt: opts.title },
    contents: { en: opts.body, pt: opts.body },
    url: opts.url ? `${siteUrl()}${opts.url}` : siteUrl(),
    large_icon: opts.icon || `${siteUrl()}/icon.png`,
    chrome_web_icon: opts.icon || `${siteUrl()}/icon.png`,
    target_channel: "push",
  };
  if (opts.tagKey) payload.filters = [{ field: "tag", key: opts.tagKey, relation: "=", value: "true" }];
  else payload.included_segments = ["Subscribed Users"];
  try {
    const res = await fetch("https://api.onesignal.com/notifications", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Key ${restKey}` }, body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, id: j?.id, reason: j?.errors?.[0] };
  } catch (e: any) { return { ok: false, reason: e?.message }; }
}
export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://3000-ih165z0jra26etpu1uray.e2b.app";
}

/* ============ Web Push nativo (VAPID) ============ */
export async function enviarNotificacao(userId: number | null, titulo: string, mensagem: string, url = "/", icon = "/icon.png") {
  // Sem par VAPID configurado não há como assinar o push: retorna 0 em vez de
  // deixar o web-push lançar erro por subscription sem auth.
  if (!VAPID_ENABLED) return 0;
  const rows = userId != null ? await db.select().from(pushSubs).where(eq(pushSubs.userId, userId)) : await db.select().from(pushSubs);
  let sent = 0;
  for (const r of rows) {
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: r.keys as any }, JSON.stringify({ title: titulo, body: mensagem, url, icon, tag: "gs-" + Date.now() }));
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 410 || e?.statusCode === 404) { try { await db.delete(pushSubs).where(eq(pushSubs.endpoint, r.endpoint)); } catch {} }
    }
  }
  return sent;
}

/* ============ Alerta rico do MONEY TIPS (Money Sênior) ============ */
export async function enviarNotificacaoMoneySenior(matchId: string, jogoNome: string, pickTitulo: string, pickDescricao: string, avatarUrl?: string) {
  const title = "🧙‍️ Bet do Money TIPS Disponível!";
  const body = `A aposta do Money TIPS para ${jogoNome}: ${pickTitulo}. ${pickDescricao} Clique para ver.`;
  const url = `/jogos/${matchId}?tab=money-tips`;
  const one = await pushOneSignal({ title, body, url, icon: avatarUrl, tagKey: "MoneyTIPS" });
  const native = await enviarNotificacao(null, title, body, url, avatarUrl || "/icon.png");
  return { onesignal: one, webpush: native };
}

/* ============ ALERT ENGINE (polling + agrupamento inteligente) ============ */
export type LiveAlert = { id: string; ts: number; type: string; matchId: string; league: string; teamId: string; title: string; body: string; url: string; minor?: boolean };
const g = globalThis as any;
const ring: LiveAlert[] = g.__gsAlerts || (g.__gsAlerts = []);
export const recentAlerts = (since = 0) => ring.filter((a) => a.ts > since).slice(-25);

const FLAG: Record<string, string> = { goal: "goals", pen: "goals", own: "goals", pen_miss: "goals", yellow: "yellowCards", red: "redCards", sub: "substitutions", start: "matchStart", end: "matchEnd", lineup: "lineups", corner: "corners", foul: "fouls", offside: "offsides" };
const ICON: Record<string, string> = { goal: "⚽", pen: "🎯", own: "😱", pen_miss: "❌", yellow: "🟨", red: "🟥", sub: "🔄", start: "🟢", end: "🏁", corner: "🚩", foul: "⚠️", offside: "🚫", lineup: "📋" };

async function dispatch(alert: LiveAlert) {
  ring.push(alert);
  if (ring.length > 60) ring.splice(0, ring.length - 60);
  const flag = FLAG[alert.type] || "goals";
  try {
    const prefs = await db.select().from(alertPrefs);
    const users = new Set<number>();
    for (const p of prefs) {
      const alerts = (p.alerts || {}) as Record<string, boolean>;
      if ((p.teamId === "*" || p.teamId === alert.teamId) && alerts[flag]) users.add(p.userId);
    }
    for (const uid of users) await enviarNotificacao(uid, alert.title, alert.body, alert.url);
  } catch {}
  await pushOneSignal({ title: alert.title, body: alert.body, url: alert.url, tagKey: `alerts_${flag === "goals" ? "goals" : flag}` });
}

export async function scanLiveAlerts() {
  return cached("alert-scan-lock", 25000, async () => {
    const matches = (await getAllMatches(todayYmd())).filter((m) => m.live).slice(0, 12);
    const minorBuffer: Record<string, { count: number; teamId: string; match: Match; corners: number; shots: number }> = {};
    for (const m of matches) {
      try {
        const sm = await getSummaryRaw(m.league, m.id, "in");
        const evs = normEvents(sm, m.home.id, m.away.id);
        const stats = normStats(sm, m.home.id);
        const sv = (k: string, side: "home" | "away") => { const r = stats.find((s: any) => s.key === k); const v = r ? (side === "home" ? r.home : r.away) : null; return v == null ? 0 : parseFloat(String(v).replace("%", "")) || 0; };
        const rows = await db.select().from(alertState).where(eq(alertState.matchId, m.id)).limit(1);
        const prev = (rows[0]?.state || {}) as any;
        const keys = evs.map((e) => `${e.type}:${e.minute}:${e.player}`);
        const seen: string[] = prev.keys || [];
        const fresh = evs.filter((e) => !seen.includes(`${e.type}:${e.minute}:${e.player}`) && ["goal", "pen", "own", "pen_miss", "yellow", "red"].includes(e.type));
        const scoreStr = `${m.home.score ?? 0} x ${m.away.score ?? 0}`;
        for (const e of fresh.slice(-5)) {
          const teamName = e.side === "home" ? m.home.name : m.away.name;
          const teamId = e.side === "home" ? m.home.id : m.away.id;
          const label = e.type === "goal" || e.type === "pen" ? `GOL DO ${teamName.toUpperCase()}!` : e.type === "own" ? `GOL CONTRA — ${teamName}` : e.type === "pen_miss" ? `PÊNALTI PERDIDO — ${teamName}` : e.type === "red" ? `CARTÃO VERMELHO — ${teamName}` : `Cartão amarelo — ${teamName}`;
          await dispatch({ id: `${m.id}:${keys.length}:${e.player}`, ts: Date.now(), type: e.type, matchId: m.id, league: m.league, teamId, title: `${ICON[e.type]} ${label}`, body: `${e.player}${e.minute ? ` aos ${e.minute}` : ""}. ${m.home.name} ${scoreStr} ${m.away.name}.`, url: `/jogos/${m.id}?league=${m.league}` });
        }
        // menores: escanteios/faltas/impedimentos → agrupados (anti-spam)
        const cH = sv("wonCorners", "home"), cA = sv("wonCorners", "away");
        const dC = (cH + cA) - (prev.corners ?? cH + cA);
        const dF = (sv("foulsCommitted", "home") + sv("foulsCommitted", "away")) - (prev.fouls ?? 0);
        const dO = (sv("offsides", "home") + sv("offsides", "away")) - (prev.offsides ?? 0);
        if (prev.keys && (dC > 0 || dF >= 2 || dO > 0)) {
          const buf = minorBuffer[m.id] || { count: 0, teamId: cH >= cA ? m.home.id : m.away.id, match: m, corners: 0, shots: 0 };
          buf.corners += Math.max(0, dC); buf.count += Math.max(0, dC) + Math.max(0, dO);
          minorBuffer[m.id] = buf;
        }
        if (prev.keys && prev.state !== "in" && m.finished) { /* noop */ }
        if (!prev.keys && m.live) await dispatch({ id: `${m.id}:start`, ts: Date.now(), type: "start", matchId: m.id, league: m.league, teamId: m.home.id, title: `🟢 BOLA ROLANDO!`, body: `${m.home.name} x ${m.away.name} — ${m.leagueName}.`, url: `/jogos/${m.id}?league=${m.league}` });
        await db.insert(alertState).values({ matchId: m.id, state: { keys, corners: cH + cA, fouls: sv("foulsCommitted", "home") + sv("foulsCommitted", "away"), offsides: sv("offsides", "home") + sv("offsides", "away"), state: m.state } as any, updatedAt: new Date() })
          .onConflictDoUpdate({ target: alertState.matchId, set: { state: { keys, corners: cH + cA, fouls: sv("foulsCommitted", "home") + sv("foulsCommitted", "away"), offsides: sv("offsides", "home") + sv("offsides", "away"), state: m.state } as any, updatedAt: new Date() } });
      } catch {}
    }
    // fim de jogo
    const finishedNow = (await getAllMatches(todayYmd())).filter((m) => m.finished).slice(0, 20);
    for (const m of finishedNow) {
      try {
        const rows = await db.select().from(alertState).where(eq(alertState.matchId, m.id)).limit(1);
        const prev = (rows[0]?.state || {}) as any;
        if (prev.keys && prev.state === "in" && !prev.endSent) {
          await dispatch({ id: `${m.id}:end`, ts: Date.now(), type: "end", matchId: m.id, league: m.league, teamId: m.home.id, title: `🏁 FIM DE JOGO`, body: `${m.home.name} ${m.home.score} x ${m.away.score} ${m.away.name} — ${m.leagueName}.`, url: `/jogos/${m.id}?league=${m.league}` });
          await db.update(alertState).set({ state: { ...prev, state: "post", endSent: true } as any }).where(eq(alertState.matchId, m.id));
        }
      } catch {}
    }
    for (const buf of Object.values(minorBuffer)) {
      if (buf.count >= 3) {
        const m = buf.match;
        await dispatch({ id: `${m.id}:press:${Date.now()}`, ts: Date.now(), type: "corner", matchId: m.id, league: m.league, teamId: buf.teamId, minor: true, title: `🔥 Pressão em ${m.home.name} x ${m.away.name}!`, body: `${buf.corners} escanteios e lances seguidos nos últimos minutos.`, url: `/jogos/${m.id}?league=${m.league}` });
      }
    }
    return { scanned: matches.length };
  }).catch(() => ({ scanned: 0 }));
}

export async function testarAlerta(teamId: string, teamName = "Seu Time") {
  const alert: LiveAlert = { id: `test:${Date.now()}`, ts: Date.now(), type: "goal", matchId: "teste", league: "bra.1", teamId, title: `⚽ GOL DO ${teamName.toUpperCase()}! (TESTE)`, body: `Notificação de teste do GreenScore — motor de alertas funcionando.`, url: "/" };
  await dispatch(alert);
  return { ok: true, alert };
}