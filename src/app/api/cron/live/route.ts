import { NextRequest, NextResponse } from "next/server";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertPrefs, alertState, fcmTokens } from "@/db/schema";
import { getAllMatches, todayYmd, type Match } from "@/lib/espn";
import { cronConfigurado, motivoCronAutorizado, respostaNaoAutorizado } from "@/lib/cronAuth";
import { sendFcmToTokens } from "@/lib/fcm";
import { enviarNotificacao } from "@/lib/push";
import {
  chaveEvento,
  detectarMudancas,
  destinatarios,
  jaEnviado,
  lerSnapshot,
  naJanelaKickoff,
  podarEnviados,
  textoGol,
  type Enviados,
  type Snapshot,
} from "@/lib/alertDiff";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/live
 *
 * Watcher de alertas em tempo real (1×/minuto no Vercel Cron).
 *
 * Custo: UMA varredura em lote do scoreboard (`getAllMatches`, 18 ligas
 * canônicas, cache de 45 s) + DUAS queries (estado e preferências). Nenhum
 * `summary` por jogo — era isso que estourava a cota da ESPN no motor antigo.
 *
 * Só envia para quem tem opt-in explícito (`alerts.gol` / `alerts.kickoff`) e
 * nunca repete um evento já marcado em `alert_state.sent`.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel) ou `?secret=`/`x-cron-secret`
 * com o MESMO `CRON_SECRET`. Sem segredo configurado responde 503 (falha fechada).
 */
export async function GET(req: NextRequest) {
  const auth = motivoCronAutorizado(req);
  if (!auth) {
    const bloqueio = respostaNaoAutorizado();
    return NextResponse.json(bloqueio.body, { status: bloqueio.status });
  }

  const agora = Date.now();
  const debug = req.nextUrl.searchParams.get("debug") === "1";

  try {
    const todos = await getAllMatches(todayYmd());
    const vivos = todos.filter((m) => m.live);
    const proximos = todos.filter((m) => m.state === "pre" && naJanelaKickoff(m.date, agora));

    // ---------- estado anterior (uma query para vivos + candidatos a kickoff) ----------
    const idsEstado = [...new Set([...vivos.map((m) => m.id), ...proximos.map((m) => m.id)])];
    const linhas = idsEstado.length
      ? await db.select().from(alertState).where(inArray(alertState.matchId, idsEstado))
      : [];
    const estPorJogo = new Map<string, any>();
    for (const l of linhas) estPorJogo.set(l.matchId, (l.state || {}) as any);

    // ---------- opt-in (tabela pequena: uma query) ----------
    const prefs = await db.select().from(alertPrefs);
    const prefsLimpas = prefs.map((p) => ({
      userId: p.userId,
      teamId: p.teamId,
      matchId: p.matchId,
      alerts: (p.alerts || {}) as Record<string, boolean>,
    }));

    interface Evento {
      match: Match;
      chave: string;
      titulo: string;
      corpo: string;
      url: string;
      tipo: "gol" | "kickoff";
      usuarios: number[];
      snap: Snapshot | null;
    }

    const eventos: Evento[] = [];
    const snapshots = new Map<string, Snapshot>();

    // ------------------------------- gols -------------------------------
    for (const m of vivos) {
      const prev = estPorJogo.get(m.id) || {};
      const anterior = lerSnapshot(prev.snap);
      const minuto = Number(String(m.clock || "").replace(/\D/g, "")) || undefined;
      const atual: Snapshot = {
        h: m.home.score ?? 0,
        a: m.away.score ?? 0,
        estado: m.state,
        ...(minuto ? { min: minuto } : {}),
      };
      snapshots.set(m.id, atual);

      const enviados: Enviados = (prev.sent || {}) as Enviados;
      for (const mudanca of detectarMudancas(anterior, atual)) {
        if (mudanca.tipo !== "gol") continue;
        const chave = chaveEvento(m.id, mudanca);
        if (jaEnviado(enviados, chave)) continue;
        const usuarios = destinatarios(prefsLimpas, {
          matchId: m.id,
          teamIds: [m.home.id, m.away.id],
          tipo: "gol",
        });
        if (!usuarios.length) continue;
        const msg = textoGol({
          lado: mudanca.lado,
          placar: mudanca.placar,
          home: m.home.name,
          away: m.away.name,
          minuto,
        });
        eventos.push({
          match: m,
          chave,
          titulo: msg.titulo,
          corpo: `${msg.corpo} ${m.leagueName}.`,
          url: `/jogos/${m.id}?league=${m.league}`,
          tipo: "gol",
          usuarios,
          snap: atual,
        });
      }
    }

    // ----------------------------- kickoff -----------------------------
    for (const m of proximos) {
      const prev = estPorJogo.get(m.id) || {};
      const enviados: Enviados = (prev.sent || {}) as Enviados;
      const chave = `${m.id}:kickoff`;
      if (jaEnviado(enviados, chave)) continue;
      const usuarios = destinatarios(prefsLimpas, {
        matchId: m.id,
        teamIds: [m.home.id, m.away.id],
        tipo: "kickoff",
      });
      if (!usuarios.length) continue;
      eventos.push({
        match: m,
        chave,
        titulo: `⏰ Começa em 15 min: ${m.home.name} × ${m.away.name}`,
        corpo: `${m.leagueName} · apito inicial às ${new Date(m.date).toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        })}.`,
        url: `/jogos/${m.id}?league=${m.league}`,
        tipo: "kickoff",
        usuarios,
        snap: null,
      });
    }

    if (!eventos.length) {
      return NextResponse.json({
        ok: true,
        vivos: vivos.length,
        eventos: 0,
        enviados: 0,
        ...(debug ? { vistos: vivos.map((m) => `${m.id}:${m.home.score}-${m.away.score}`) } : {}),
      });
    }

    // ------------- tokens FCM dos destinatários (uma query) -------------
    const uids = [...new Set(eventos.flatMap((e) => e.usuarios))];
    const tokens = uids.length
      ? await db.select().from(fcmTokens).where(inArray(fcmTokens.userId, uids))
      : [];
    const tokensPorUsuario = new Map<number, string[]>();
    for (const t of tokens) {
      if (t.userId == null) continue;
      const arr = tokensPorUsuario.get(t.userId) || [];
      arr.push(t.token);
      tokensPorUsuario.set(t.userId, arr);
    }

    let enviados = 0;
    const falhas: string[] = [];

    for (const ev of eventos) {
      // Um envio FCM por evento, com os tokens de todos os opt-in (mesma msg).
      const alvo = ev.usuarios.flatMap((u) => tokensPorUsuario.get(u) || []);
      if (alvo.length) {
        try {
          const r = await sendFcmToTokens(alvo, {
            title: ev.titulo,
            body: ev.corpo,
            data: { matchId: ev.match.id, league: ev.match.league, tipo: ev.tipo },
          });
          enviados += r.enviados;
          if (r.invalidos.length) {
            await db.delete(fcmTokens).where(inArray(fcmTokens.token, r.invalidos)).catch(() => {});
          }
        } catch (e: any) {
          falhas.push(`fcm:${ev.chave}:${e?.message || "erro"}`);
        }
      }
      // Web Push (VAPID) — por usuário, porque a subscription é por dispositivo.
      for (const uid of ev.usuarios) {
        try {
          enviados += await enviarNotificacao(uid, ev.titulo, ev.corpo, ev.url);
        } catch (e: any) {
          falhas.push(`webpush:${ev.chave}:${e?.message || "erro"}`);
        }
      }
    }

    // ---------------- grava snapshots + sent (upsert em lote) ----------------
    const porJogo = new Map<string, any>(estPorJogo);
    for (const ev of eventos) {
      const prev = porJogo.get(ev.match.id) || {};
      porJogo.set(ev.match.id, {
        ...prev,
        sent: marcar(prev.sent, ev.chave, agora),
        state: ev.match.state,
      });
    }
    // Snapshot de TODOS os vivos (inclusive os sem evento), para o próximo
    // ciclo comparar com o placar certo.
    for (const [id, snap] of snapshots) {
      const prev = porJogo.get(id) || {};
      porJogo.set(id, { ...prev, snap });
    }
    // Kickoff já entrou no laço acima (mesma linha em `alert_state`), então o
    // dedupe `sent` persiste entre ciclos e o lembrete não repete.

    if (porJogo.size) {
      const agoraData = new Date();
      const valores = [...porJogo].map(([id, estado]) => ({
        matchId: id,
        state: { ...estado, sent: podarEnviados(estado.sent, agora) },
        updatedAt: agoraData,
      }));
      // Um único INSERT ... ON CONFLICT para todos os jogos do ciclo.
      await db
        .insert(alertState)
        .values(valores)
        .onConflictDoUpdate({
          target: alertState.matchId,
          set: { state: sql`excluded.state`, updatedAt: sql`excluded.updated_at` },
        });
    }
    return NextResponse.json({
      ok: true,
      vivos: vivos.length,
      eventos: eventos.length,
      enviados,
      ...(falhas.length ? { falhas: falhas.slice(0, 5) } : {}),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Falha no watcher ao vivo." }, { status: 500 });
  }
}

/** Marca um evento como enviado sem depender de import extra no meio do laço. */
function marcar(enviados: unknown, chave: string, agora: number): Enviados {
  return { ...((enviados as Enviados) || {}), [chave]: agora };
}
