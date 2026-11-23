"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Users, KeyRound, BellRing, PlugZap, Save, Trash2, Crown, Ban } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { SourceFoot } from "@/components/ui";

export default function Admin() {
  const { user, addToast } = useApp();
  const [tab, setTab] = useState<"users" | "apis" | "alerts">("users");
  const [ud, setUd] = useState<any>(null);
  const [keys, setKeys] = useState<any>(null);
  const [q, setQ] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [days, setDays] = useState<Record<number, number>>({});
  const [testResult, setTestResult] = useState<Record<string, any>>({});
  const [testing, setTesting] = useState("");
  const [testTeam, setTestTeam] = useState("");

  const loadUsers = useCallback(() => fetch("/api/admin/users").then((r) => r.json()).then(setUd).catch(() => {}), []);
  const loadKeys = useCallback(() => fetch("/api/admin/keys").then((r) => r.json()).then(setKeys).catch(() => {}), []);
  useEffect(() => { if (user?.isAdmin) { loadUsers(); loadKeys(); } }, [user?.isAdmin, loadUsers, loadKeys]);

  if (!user) return (
    <div className="text-center py-16">
      <ShieldCheck size={36} className="mx-auto text-mut mb-2" />
      <p className="font-display font-bold text-xl uppercase">Painel do Administrador</p>
      <p className="text-xs text-mut mt-1">Faça login com a conta de administrador/dono.</p>
      <Link href="/login" className="inline-block mt-4 px-5 py-2 rounded-full bg-acc text-black text-xs font-extrabold">ENTRAR</Link>
    </div>
  );
  if (!user.isAdmin) return <p className="text-center py-16 text-mut text-sm">⛔ Acesso restrito ao administrador/dono.</p>;

  const act = async (id: number, action: string, d?: number) => {
    await fetch("/api/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, days: d }) });
    addToast({ title: "✅ Usuário atualizado", body: `Ação "${action}" aplicada.` });
    loadUsers();
  };
  const saveKey = async (provider: string) => {
    await fetch("/api/admin/keys", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, token: inputs[provider] || "" }) });
    setInputs((p) => ({ ...p, [provider]: "" }));
    addToast({ title: "🔑 Chave salva com segurança", body: "Armazenada apenas no servidor (banco de dados)." });
    loadKeys();
  };
  const test = async (provider: string) => {
    setTesting(provider);
    try { const r = await fetch(`/api/admin/test?provider=${provider}`); const j = await r.json(); setTestResult((p) => ({ ...p, [provider]: j })); }
    catch { setTestResult((p) => ({ ...p, [provider]: { ok: false, message: "Falha de rede." } })); }
    setTesting("");
  };

  const users = (ud?.users || []).filter((u: any) => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.includes(q.toLowerCase()));
  const st = ud?.stats || {};

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="text-warn" size={26} />
        <div>
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide leading-none">Painel Admin</h1>
          <p className="text-[10px] text-mut">Logado como {user.role === "owner" ? "DONO 👑" : "administrador"} · {user.email}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-panel border border-line rounded-full p-0.5 mb-3">
        {([["users", "USUÁRIOS", Users], ["apis", "APIS", KeyRound], ["alerts", "ALERTAS", BellRing]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-full text-[10px] font-extrabold ${tab === id ? "bg-acc text-black" : "text-mut"}`}><Icon size={13} /> {label}</button>
        ))}
      </div>

      {tab === "users" && (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-2 text-center">
            {[["Total", st.total, "text-ink"], ["Ativos", st.ativos, "text-acc"], ["Expirados", st.expirados, "text-danger"], ["Online agora", st.online, "text-cyanx"], ["Visitas 24h", st.visits24h, "text-warn"], ["Sessões", st.sessions, "text-mut"]].map(([l, v, c]: any, i) => (
              <div key={i} className="bg-panel border border-line rounded-xl p-2"><p className={`font-display font-bold text-xl ${c}`}>{v ?? 0}</p><p className="text-[8px] text-mut uppercase">{l}</p></div>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou e-mail…" className="w-full bg-panel border border-line rounded-xl px-3 py-2 text-[12px] mb-2" />
          <div className="space-y-2">
            {users.map((u: any) => (
              <div key={u.id} className="bg-panel border border-line rounded-xl p-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${u.online ? "bg-acc live-dot" : u.active ? "bg-acc/50" : "bg-danger"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold truncate">{u.name} {u.role === "owner" && "👑"} {u.role === "admin" && "🛡️"}</p>
                    <p className="text-[10px] text-mut truncate">{u.email}</p>
                  </div>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${u.plan === "vip" ? "bg-warn/15 text-warn" : u.plan === "trial" ? "bg-cyanx/15 text-cyanx" : "bg-panel2 text-mut"}`}>{u.plan.toUpperCase()}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-mut mt-1.5 flex-wrap">
                  <span className={u.active ? "text-acc" : "text-danger"}>{u.lifetime ? "Vitalício" : u.active ? `Ativo · ${u.daysLeft}d restantes` : "Expirado"}</span>
                  {u.expiresAt && <span>Expira: {new Date(u.expiresAt).toLocaleDateString("pt-BR")}</span>}
                  <span>Visto: {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca"}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <input type="number" min={1} value={days[u.id] ?? 30} onChange={(e) => setDays((p) => ({ ...p, [u.id]: Number(e.target.value) }))} className="w-14 bg-panel2 border border-line rounded-lg px-2 py-1 text-[11px]" />
                  <button onClick={() => act(u.id, "vip", days[u.id] ?? 30)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-warn text-black text-[10px] font-extrabold"><Crown size={11} /> +VIP</button>
                  <button onClick={() => act(u.id, "expire")} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-panel2 border border-line text-[10px] font-bold text-danger"><Ban size={11} /> Expirar</button>
                  {u.role !== "owner" && <button onClick={() => { if (u.role === "admin" && !confirm("Remover o acesso de administrador desta conta?")) return; act(u.id, "role"); }} className="px-2.5 py-1 rounded-lg bg-panel2 border border-line text-[10px] font-bold">{u.role === "admin" ? "Remover admin" : "Tornar admin"}</button>}
                  {u.role !== "owner" && <button onClick={() => { if (confirm(`Excluir a conta de ${u.email}? Esta ação não volta atrás.`)) act(u.id, "delete"); }} className="ml-auto p-1.5 text-danger"><Trash2 size={13} /></button>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[9px] text-mut mt-2">Regra: o bônus de 24h é uma vez por dispositivo/IP. Vencido o prazo, a conta cai no Free (1 análise por dia) — não bloqueia. O dono não expira.</p>
        </>
      )}

      {tab === "apis" && (
        <div className="space-y-2">
          {(keys?.providers || []).map((p: any) => (
            <div key={p.id} className="bg-panel border border-line rounded-2xl p-3">
              <div className="flex items-center gap-2">
                <PlugZap size={16} className={p.configured ? "text-acc" : "text-mut"} />
                <p className="font-display font-bold uppercase">{p.name}</p>
                <span className={`ml-auto text-[9px] font-extrabold px-2 py-0.5 rounded-full ${p.configured ? "bg-acc/15 text-acc" : "bg-panel2 text-mut"}`}>{p.configured ? "CONECTADA" : "SEM CHAVE"}</span>
              </div>
              <p className="text-[10px] text-mut mt-1">{p.desc} {p.masked && <span className="text-ink">· {p.masked}</span>}</p>
              {p.needsKey && (
                <div className="flex gap-1.5 mt-2">
                  <input type="password" value={inputs[p.id] || ""} onChange={(e) => setInputs((prev) => ({ ...prev, [p.id]: e.target.value }))} placeholder="Cole a chave/token aqui…" className="flex-1 bg-panel2 border border-line rounded-lg px-2.5 py-2 text-[11px]" />
                  <button onClick={() => saveKey(p.id)} className="px-3 rounded-lg bg-acc text-black"><Save size={14} /></button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => test(p.id)} disabled={testing === p.id} className="px-3 py-1.5 rounded-lg bg-panel2 border border-line text-[10px] font-extrabold text-cyanx">{testing === p.id ? "TESTANDO…" : "TESTAR CONEXÃO"}</button>
                <a href={p.doc} target="_blank" rel="noreferrer" className="text-[10px] text-mut underline">Obter chave ↗</a>
              </div>
              {testResult[p.id] && (
                <div className={`mt-2 rounded-lg p-2 text-[10px] ${testResult[p.id].ok ? "bg-acc/10 text-acc" : "bg-danger/10 text-danger"}`}>
                  {testResult[p.id].message}
                  {Array.isArray(testResult[p.id].sample) && testResult[p.id].sample.length > 0 && (
                    <div className="mt-1.5 max-h-40 overflow-y-auto text-ink/80">
                      <p className="font-bold uppercase text-[9px] text-mut mb-1">Competições/dados disponíveis no seu plano:</p>
                      {testResult[p.id].sample.map((c: any, i: number) => <p key={i} className="border-b border-line/40 py-0.5">{c.name} {c.country ? `— ${c.country}` : ""} {c.code ? `(${c.code})` : ""} {c.plan ? `· ${c.plan}` : ""}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          <p className="text-[9px] text-mut">🔒 Chaves ficam somente no servidor (tabela api_keys). Nunca aparecem no frontend nem em respostas públicas. A ESPN funciona sem chave e é a fonte padrão.</p>
        </div>
      )}

      {tab === "alerts" && (
        <div className="space-y-3">
          <div className="bg-panel border border-line rounded-2xl p-4">
            <p className="font-display font-bold uppercase mb-1"> Testar motor de alertas</p>
            <p className="text-[10px] text-mut mb-2">Simula um gol e dispara push para inscritos com o alerta de gols ativo.</p>
            <div className="flex gap-1.5">
              <input value={testTeam} onChange={(e) => setTestTeam(e.target.value)} placeholder="ID do time (ex: 819) ou vazio" className="flex-1 bg-panel2 border border-line rounded-lg px-2.5 py-2 text-[11px]" />
              <button onClick={async () => { const r = await fetch(`/api/testar-alerta?teamId=${testTeam || "teste"}&name=${encodeURIComponent(testTeam ? "Time " + testTeam : "GreenScore")}`); const j = await r.json().catch(() => ({})); addToast({ title: r.ok && j.ok ? "🚀 Teste disparado" : "Falha no teste", body: r.ok && j.ok ? "Verifique o toast e as notificações push." : j?.error || "Falha no teste." }); }} className="px-4 rounded-lg bg-acc text-black text-[11px] font-extrabold">DISPARAR</button>
            </div>
          </div>
          <div className="bg-panel border border-line rounded-2xl p-4 text-[11px] text-mut leading-relaxed">
            <p className="font-bold text-ink uppercase text-[10px] mb-1">Como o motor funciona</p>
            • Polling de 25–45s nos jogos ao vivo da ESPN (sem WebSocket na fonte gratuita).<br />
            • Novos gols/cartões/pênaltis → push segmentado por preferência (OneSignal tags + Web Push VAPID).<br />
            • Escanteios/impedimentos em sequência → agrupados: &quot;🔥 Pressão…&quot; (anti-spam).<br />
            • Fim de jogo detectado pela mudança de status → alerta 🏁.<br />
            • Para push com o site fechado: cole a <b>OneSignal REST Key</b> na aba APIS.
          </div>
          <SourceFoot fonte="Alert Engine próprio" />
        </div>
      )}
    </div>
  );
}