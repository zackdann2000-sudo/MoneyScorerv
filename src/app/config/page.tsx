"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun, Bell, BellRing, Star, ShieldCheck, TrendingUp, Trash2, Crown, CreditCard, Loader2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { mensagemAcesso } from "@/lib/accessMessage";
import { VENDAS_ATIVAS } from "@/lib/vendas";
import { Toggle, Crest } from "@/components/ui";

function urlB64ToUint8(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function Config() {
  const { user, refreshUser, vip, theme, toggleTheme, flags, setFlags, favorites, toggleFavorite, addToast } = useApp();
  const router = useRouter();
  const [osState, setOsState] = useState<"idle" | "pending" | "granted" | "denied">("idle");
  const [nativeState, setNativeState] = useState<"idle" | "pending" | "ok" | "fail">("idle");
  const [pushOk, setPushOk] = useState(false);
  const [delEmail, setDelEmail] = useState("");
  const [delConfirm, setDelConfirm] = useState(false);
  const [delMsg, setDelMsg] = useState("");
  const [portalCarregando, setPortalCarregando] = useState(false);

  /* Portal do Stripe: cancelar/trocar cartão/faturas sem passar pelo suporte. */
  const abrirPortal = async () => {
    setPortalCarregando(true);
    try {
      const r = await fetch("/api/stripe/portal", { method: "POST" });
      const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error ?? `HTTP ${r.status}`);
      window.location.href = j.url;
    } catch (e) {
      addToast({
        title: "Não foi possível abrir o portal",
        body: e instanceof Error ? e.message : "Tente novamente em instantes.",
      });
      setPortalCarregando(false);
    }
  };

  // permissão inicial lida de forma preguiçosa (sem efeito de montagem com setState)
  useEffect(() => {
    let perm: NotificationPermission | null = null;
    try { perm = typeof Notification !== "undefined" ? Notification.permission : null; } catch { perm = null; }
    const t = setTimeout(() => setOsState(perm === "granted" ? "granted" : perm === "denied" ? "denied" : "idle"), 0);
    return () => clearTimeout(t);
  }, []);

  // OneSignal: permissão SOMENTE no clique (nunca automática)
  const askOneSignal = () => {
    if (!pushOk) { alert("Marque o consentimento de push antes de pedir permissão."); return; }
    setOsState("pending");
    const w = window as any;
    const timeout = setTimeout(() => {
      setOsState((s) => (s === "pending" ? "idle" : s));
      try { if (Notification.permission !== "granted") alert("O SDK do OneSignal não respondeu (possível bloqueador). Use o botão 'Push Nativo (VAPID)' abaixo como alternativa."); } catch {}
    }, 12000);
    try {
      if (!w.OneSignalDeferred) { clearTimeout(timeout); setOsState("idle"); alert("SDK OneSignal ainda carregando ou bloqueado. Tente o Push Nativo (VAPID)."); return; }
      w.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          await OneSignal.Notifications.requestPermission();
          clearTimeout(timeout);
          const granted = typeof Notification !== "undefined" && Notification.permission === "granted";
          setOsState(granted ? "granted" : "denied");
          if (granted) {
            try {
              await OneSignal.User.addTags({ MoneyTIPS: String(flags.MoneyTIPS), alerts_goals: String(flags.goals), alerts_redCards: String(flags.redCards), alerts_yellowCards: String(flags.yellowCards), alerts_corners: String(flags.corners), alerts_matchEnd: String(flags.matchEnd), alerts_matchStart: String(flags.matchStart), alerts_lineups: String(flags.lineups) });
              for (const t of favorites) await OneSignal.User.addTag(`fav_${t.id}`, "true");
              await OneSignal.User.PushSubscription.optIn();
            } catch {}
            addToast({ title: "🔔 Push ativado!", body: "Você receberá alertas mesmo com o site fechado." });
          } else {
            alert("Permissão negada. Libere as notificações nas configurações do navegador (cadeado na barra de endereço).");
          }
        } catch (e: any) {
          clearTimeout(timeout);
          setOsState("idle");
          alert("Erro ao pedir permissão: " + (e?.message || e) + ". Se você bloqueou antes, libere pelo cadeado do navegador.");
        }
      });
    } catch (e: any) { clearTimeout(timeout); setOsState("idle"); alert("Erro: " + (e?.message || e)); }
  };

  const askNative = async () => {
    if (!pushOk) { alert("Marque o consentimento de push antes de inscrever o navegador."); return; }
    setNativeState("pending");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Navegador sem suporte a Web Push.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setNativeState("fail"); alert("Permissão negada nas configurações do navegador."); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push/subscribe")).json();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(publicKey) as BufferSource });
      await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub }) });
      setNativeState("ok");
      addToast({ title: "✅ Web Push nativo ativo", body: "Inscrição VAPID salva no servidor." });
    } catch (e: any) {
      setNativeState("fail");
      alert("Falha no push nativo: " + (e?.message || e));
    }
  };

  return (
    <div className="space-y-3">
      {/* Conta */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        {user ? (
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-full bg-acc/15 border border-acc/40 text-acc font-display font-bold text-xl flex items-center justify-center">{user.name.slice(0, 1).toUpperCase()}</span>
            <div className="flex-1 min-w-0">
              <p className="font-bold truncate">{user.name}</p>
              <p className="text-[11px] text-mut truncate">{user.email}</p>
              <p className={`text-[10px] font-extrabold ${vip ? "text-acc" : "text-danger"}`}>{user.access.label}{user.access.active && !user.isAdmin ? ` · ${user.access.daysLeft} dia${user.access.daysLeft === 1 ? "" : "s"}` : ""}</p>
            </div>
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); await refreshUser(); router.push("/"); }} className="p-2 text-danger"><LogOut size={18} /></button>
          </div>
        ) : (
          <div className="text-center py-2">
            <p className="font-display font-bold uppercase text-lg">Entre na sua conta</p>
            <p className="text-[11px] text-mut">1 análise grátis por dia. O contador zera à meia-noite.</p>
            <div className="flex gap-2 justify-center mt-3">
              <Link href="/login" className="px-5 py-2 rounded-full bg-panel2 border border-line text-xs font-extrabold">ENTRAR</Link>
              <Link href="/cadastro" className="px-5 py-2 rounded-full bg-acc text-black text-xs font-extrabold">CRIAR CONTA</Link>
            </div>
          </div>
        )}
      </div>

      {/* Planos */}
      <div id="planos" className="rounded-2xl overflow-hidden border border-warn/40 bg-gradient-to-br from-warn/10 via-panel to-panel">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-warn/15 border border-warn/40 text-warn flex items-center justify-center shrink-0">
              <Crown size={18} />
            </span>
            <p className="font-display font-bold text-xl uppercase">Seu acesso, todo dia</p>
          </div>
          <p className="text-[12px] mt-2 text-ink">
            O cadastro libera o app completo por <strong>24 horas</strong>. Depois disso você continua com{" "}
            <strong>1 análise por dia</strong> — o contador zera à meia-noite (horário de Brasília).
            Placares, ligas e estatísticas de partida continuam gratuitos o dia inteiro.
          </p>
          {user && (
            <p className={`text-[12px] mt-2 font-bold ${vip ? "text-acc" : "text-danger"}`}>
              {mensagemAcesso({ isAdmin: user.isAdmin, accessActive: user.access.active, expiresAt: user.expiresAt })}
            </p>
          )}
          {VENDAS_ATIVAS && (
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Link
                href="/planos"
                className="flex-1 h-10 rounded-xl bg-acc text-black text-xs font-extrabold inline-flex items-center justify-center gap-1.5"
              >
                <CreditCard size={14} /> {vip ? "Ver planos" : "Assinar VIP no cartão"}
              </Link>
              {user && vip && (
                <button
                  onClick={abrirPortal}
                  disabled={portalCarregando}
                  className="flex-1 h-10 rounded-xl bg-panel2 border border-line text-ink text-xs font-extrabold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {portalCarregando ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  Gerenciar assinatura
                </button>
              )}
            </div>
          )}
          {!VENDAS_ATIVAS && !user && (
            <Link
              href="/cadastro"
              className="mt-3 h-10 rounded-xl bg-acc text-black text-xs font-extrabold inline-flex items-center justify-center gap-1.5 px-4"
            >
              Criar conta grátis
            </Link>
          )}
        </div>
      </div>

      {/* Aparência */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        <p className="font-display font-bold uppercase mb-1">Aparência</p>
        <button onClick={toggleTheme} className="w-full flex items-center justify-between py-2">
          <span className="text-sm font-semibold flex items-center gap-2">{theme === "dark" ? <Moon size={16} /> : <Sun size={16} />} Tema {theme === "dark" ? "escuro" : "claro"}</span>
          <span className="text-[10px] font-extrabold text-acc">ALTERNAR →</span>
        </button>
      </div>

      {/* Notificações */}
      <div id="alertas" className="bg-panel border border-line rounded-2xl p-4">
        <p className="font-display font-bold uppercase flex items-center gap-2"><Bell size={16} className="text-warn" /> Notificações</p>
        <label className="mt-2 flex items-start gap-2 text-[12px]">
          <input type="checkbox" checked={pushOk} onChange={(e) => { setPushOk(e.target.checked); if (e.target.checked) fetch("/api/conta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consent", push: true, terms: true }) }).catch(() => {}); }} className="mt-0.5 accent-[var(--acc)]" />
          <span>Quero receber alertas neste navegador. O botão só funciona com esta caixa marcada.</span>
        </label>
        <button onClick={askOneSignal} className={`w-full mt-2 py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 ${osState === "granted" ? "bg-acc/15 text-acc border border-acc/40" : "bg-acc text-black"}`}>
          <BellRing size={16} />
          {osState === "granted" ? "PUSH ONESIGNAL ATIVO ✓" : osState === "pending" ? "Aguardando permissão…" : osState === "denied" ? "BLOQUEADO — LIBERE NO CADEADO" : "NOTIFICAÇÕES NO NAVEGADOR (ONESIGNAL)"}
        </button>
        <button onClick={askNative} className="w-full mt-2 py-2.5 rounded-xl bg-panel2 border border-line font-bold text-xs">
          {nativeState === "ok" ? "✅ Push Nativo (VAPID) ativo" : nativeState === "pending" ? "Inscrevendo…" : "Ativar Push Nativo (VAPID) — alternativa sem OneSignal"}
        </button>
        <p className="text-[9px] text-mut mt-2">SDK via proxy Cloudflare (à prova de bloqueadores) · App ID embutido · permissão pedida somente no clique.</p>

        <p className="font-display font-bold uppercase mt-4 mb-1 text-sm">Tipos de alerta</p>
        <div className="divide-y divide-line">
          <Toggle on={flags.MoneyTIPS} onChange={(v) => setFlags({ ...flags, MoneyTIPS: v })} label="🧙‍♂️ Picks do Money TIPS" desc="Aviso quando a bet do dia sair, com link direto" />
          <Toggle on={flags.goals} onChange={(v) => setFlags({ ...flags, goals: v })} label="⚽ Gols ao vivo" desc="Inclui pênaltis marcados/perdidos" />
          <Toggle on={flags.redCards} onChange={(v) => setFlags({ ...flags, redCards: v })} label="🟥 Cartões vermelhos" />
          <Toggle on={flags.yellowCards} onChange={(v) => setFlags({ ...flags, yellowCards: v })} label="🟨 Cartões amarelos" />
          <Toggle on={flags.corners} onChange={(v) => setFlags({ ...flags, corners: v })} label="🚩 Escanteios" desc="Agrupados anti-spam: '🔥 Pressão…'" />
          <Toggle on={flags.fouls} onChange={(v) => setFlags({ ...flags, fouls: v })} label="⚠️ Faltas" />
          <Toggle on={flags.offsides} onChange={(v) => setFlags({ ...flags, offsides: v })} label="🚫 Impedimentos" />
          <Toggle on={flags.matchStart} onChange={(v) => setFlags({ ...flags, matchStart: v })} label="🟢 Início de jogo" />
          <Toggle on={flags.matchEnd} onChange={(v) => setFlags({ ...flags, matchEnd: v })} label="🏁 Fim de jogo" />
          <Toggle on={flags.lineups} onChange={(v) => setFlags({ ...flags, lineups: v })} label="📋 Escalações divulgadas" />
          <Toggle on={flags.substitutions} onChange={(v) => setFlags({ ...flags, substitutions: v })} label="🔄 Substituições" />
        </div>
        {/* O disparo de teste faz broadcast para toda a base de push — rota restrita ao admin.
            Exibimos o botão apenas para quem pode usá-lo (§8.7 do RELATORIO_AUDITORIA.md). */}
        {user?.isAdmin && (
          <button onClick={async () => { const r = await fetch(`/api/testar-alerta?teamId=teste&name=GreenScore`); const j = await r.json().catch(() => ({})); if (r.ok && j.ok) addToast({ title: "🧪 Alerta de teste enviado", body: "Se o push estiver ativo, ele chega no celular." }); else addToast({ title: "Não foi possível enviar", body: j?.error || "Apenas o administrador pode disparar notificações de teste." }); }} className="w-full mt-2 py-2 rounded-xl bg-panel2 border border-line text-xs font-bold text-cyanx">ENVIAR NOTIFICAÇÃO DE TESTE</button>
        )}
        {!user && <p className="text-[10px] text-warn mt-2">💡 Faça login para salvar preferências no servidor e receber push direcionado aos seus times.</p>}
      </div>

      {/* Favoritos */}
      <div className="bg-panel border border-line rounded-2xl p-4">
        <p className="font-display font-bold uppercase flex items-center gap-2 mb-2"><Star size={16} className="text-warn" /> Times favoritos ({favorites.length})</p>
        {favorites.length === 0 && <p className="text-[11px] text-mut">Toque na ⭐ de qualquer time/jogo para seguir. Favoritos ganham alertas e destaque na Home.</p>}
        <div className="space-y-1.5">
          {favorites.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-1">
              <Crest src={t.logo} size={22} />
              <Link href={`/times/${t.id}?league=${t.league}`} className="text-[12px] font-bold flex-1 truncate">{t.name}</Link>
              <button onClick={() => toggleFavorite(t)} className="text-danger p-1"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Atalhos */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/desempenho" className="bg-panel border border-line rounded-2xl p-3 flex items-center gap-2 card-hover"><TrendingUp size={16} className="text-acc" /><span className="text-xs font-bold">Track Record</span></Link>
        {user?.isAdmin ? (
          <Link href="/admin" className="bg-panel border border-warn/40 rounded-2xl p-3 flex items-center gap-2 card-hover"><ShieldCheck size={16} className="text-warn" /><span className="text-xs font-bold">Painel Admin</span></Link>
        ) : (
          <Link href="/money-tips" className="bg-panel border border-line rounded-2xl p-3 flex items-center gap-2 card-hover"><span>🧙‍♂️</span><span className="text-xs font-bold">Money Tips</span></Link>
        )}
      </div>

      <div id="excluir" className="bg-panel border border-danger/30 rounded-2xl p-4">
        <p className="font-display font-bold uppercase text-sm">Excluir meus dados</p>
        <p className="text-[11px] text-ink/75 mt-1">Canal LGPD. Logado, a exclusão da sua conta é imediata. Sem login, registramos o pedido para o administrador concluir — não apagamos a conta de outra pessoa só com o e-mail.</p>
        <input value={delEmail} onChange={(e) => setDelEmail(e.target.value)} placeholder={user?.email || "seu e-mail"} className="w-full mt-2 bg-panel2 border border-line rounded-xl px-3 py-2 text-sm" />
        <label className="mt-2 flex items-start gap-2 text-[12px]">
          <input type="checkbox" checked={delConfirm} onChange={(e) => setDelConfirm(e.target.checked)} className="mt-0.5 accent-[var(--danger)]" />
          <span>Confirmo que quero excluir os dados desta conta.</span>
        </label>
        <button onClick={async () => {
          setDelMsg("");
          const r = await fetch("/api/conta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "excluir", email: delEmail || user?.email, confirm: delConfirm }) });
          const j = await r.json();
          setDelMsg(j.error || j.message || "Pedido enviado.");
          if (j.immediate) { await refreshUser(); router.push("/"); }
        }} className="mt-2 px-4 py-2 rounded-xl bg-danger text-white text-xs font-extrabold">PEDIR EXCLUSÃO</button>
        {delMsg && <p className="text-[11px] mt-2">{delMsg}</p>}
      </div>
      <p className="text-center text-[11px] text-ink/75 pb-2">GreenScore · +18 · Sem garantia de lucro. <Link href="/termos" className="underline">Termos</Link> · <Link href="/privacidade" className="underline">Privacidade</Link> · <Link href="/jogo-responsavel" className="underline">Ajuda</Link></p>
    </div>
  );
}