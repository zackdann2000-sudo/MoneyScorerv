"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Radio, Star, Newspaper, Trophy, Sun, Moon, Bell, ShieldCheck, X, CalendarDays, Menu, Home, Sparkles, Gem, CircleDollarSign, Scale, Activity, Users, BookOpen, Cable, CircleHelp, Radar, Whistle, Crown, BrainCircuit } from "lucide-react";
import { useApp } from "@/context/AppContext";
import LegalFooter from "@/components/LegalFooter";
import TrialBanner from "@/components/TrialBanner";

const NAV = [
  { href: "/ao-vivo", label: "Ao vivo", icon: Radio },
  { href: "/", label: "Jogos", icon: CalendarDays },
  { href: "/supertips/palpites", label: "IA", icon: Sparkles },
  { href: "/jogadores", label: "Jogadores", icon: Users },
  { href: "/config", label: "Conta", icon: CircleHelp },
];

const DRAWER_NAV = [
  { href: "/", label: "Hoje", icon: Home },
  { href: "/ao-vivo", label: "Ao Vivo", icon: Radio },
  { href: "/favoritos", label: "Favoritos", icon: Star },
  { href: "/noticias", label: "Notícias", icon: Newspaper },
  { href: "/ligas", label: "Ligas", icon: Trophy },
];

const DRAWER_ANALYSIS = [
  { href: "/palpites-ia", label: "Palpites IA", icon: Sparkles },
  { href: "/forebet", label: "Forebet (tabela)", icon: Trophy },
  { href: "/supertips/palpites", label: "SuperTips IA", icon: Sparkles },
  { href: "/money-tips", label: "Money Tips", icon: Gem },
  { href: "/ev", label: "Oportunidades +EV", icon: CircleDollarSign },
  { href: "/gameread", label: "GameRead (props)", icon: Radar },
  { href: "/apitou", label: "Apitou (props)", icon: Whistle },
  { href: "/kingstats", label: "King STATS", icon: Crown },
  { href: "/nerdytips", label: "NerdyTips", icon: BrainCircuit },
  { href: "/desempenho", label: "Track Record", icon: Scale },
  { href: "/detector", label: "Detector", icon: Activity },
  { href: "/jogadores", label: "Estatísticas", icon: Users },
  { href: "/metodologia", label: "Metodologia", icon: BookOpen },
  { href: "/config#alertas", label: "APIs e alertas", icon: Cable },
  { href: "/config", label: "Conta e planos", icon: CircleHelp },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, user, toasts, dismissToast, favorites } = useApp();
  const [open, setOpen] = useState(false);
  const favCount = favorites.length;
  const go = (href: string) => { setOpen(false); router.push(href); };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-bg/95 backdrop-blur border-b border-line">
        <div className="max-w-3xl mx-auto px-3 h-14 flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 mr-auto min-w-0">
            <img src="/icon.png" alt="" className="w-9 h-9 rounded-xl shrink-0" />
            <span className="leading-none">
              <span className="block font-display font-bold text-base">GreenScore</span>
              <span className="block text-[9px] font-bold tracking-widest text-acc">LIVE ANALYTICS</span>
            </span>
          </Link>
          <button onClick={() => setOpen(true)} aria-label="Abrir menu" className="w-10 h-10 rounded-xl border border-line flex items-center justify-center text-ink"><Menu size={18} /></button>
          {user?.isAdmin && <Link href="/admin" aria-label="Admin" className="w-11 h-11 flex items-center justify-center text-warn"><ShieldCheck size={18} /></Link>}
          <button onClick={toggleTheme} aria-label="Alternar tema" className="w-11 h-11 flex items-center justify-center text-ink">{theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}</button>
          <Link href="/config#alertas" aria-label="Notificações" className="w-11 h-11 flex items-center justify-center text-ink"><Bell size={18} /></Link>
          <Link href={user ? "/config" : "/login"} aria-label="Conta" className="w-8 h-8 rounded-full bg-panel2 border border-line text-ink font-display font-bold flex items-center justify-center text-sm">
            {user ? user.name.slice(0, 1).toUpperCase() : "?"}
          </Link>
        </div>
      </header>
      <TrialBanner />
      <div className="sticky top-14 z-40 bg-bg/95 border-b border-line">
        <div className="max-w-3xl mx-auto px-3 py-2 flex gap-2 overflow-x-auto no-scrollbar">
          {[
            ["/ao-vivo", "Ao vivo agora"],
            ["/times", "Times"],
            ["/jogadores", "Jogadores"],
            ["/supertips/palpites", "IA"],
            ["/ligas", "Ligas"],
            ["/money-tips", "Money Tips"],
            ["/detector", "Detector"],
            ["/supertips/tendencias", "Desapitos"],
            ["/fontes/sportmonks", "Sports Alert"],
            ["/fontes/football-data", "FD.org"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className={`shrink-0 px-3 h-8 rounded-full border text-[11px] font-bold inline-flex items-center ${path === href || path.startsWith(href) ? "border-acc text-acc" : "border-line text-mut"}`}>{label}</Link>
          ))}
          {user?.isAdmin && <Link href="/admin" className="shrink-0 px-3 h-8 rounded-full border border-warn text-warn text-[11px] font-bold inline-flex items-center">Admin</Link>}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] flex">
          <aside className="w-[min(100%,320px)] h-full bg-[#042833] text-ink overflow-y-auto pb-8">
            <div className="flex items-center justify-between px-4 h-14">
              <span className="font-display font-bold">GreenScore</span>
              <button onClick={() => setOpen(false)} aria-label="Fechar menu" className="w-11 h-11 flex items-center justify-center"><X size={18} /></button>
            </div>
            <p className="px-4 text-[10px] font-bold tracking-widest text-mut">NAVEGAÇÃO</p>
            <div className="mt-1">
              {DRAWER_NAV.map((n) => {
                const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
                const Icon = n.icon;
                return (
                  <button key={n.href} onClick={() => go(n.href)} className={`w-full flex items-center gap-3 px-4 h-11 text-sm font-semibold ${on ? "bg-live text-white" : "text-ink"}`}>
                    <Icon size={16} /> {n.label}
                  </button>
                );
              })}
            </div>
            <p className="px-4 mt-5 text-[10px] font-bold tracking-widest text-mut">ANÁLISE</p>
            <div className="mt-1">
              {DRAWER_ANALYSIS.map((n) => {
                const Icon = n.icon;
                return (
                  <button key={n.href} onClick={() => go(n.href)} className="w-full flex items-center gap-3 px-4 h-11 text-sm font-semibold text-ink">
                    <Icon size={16} /> {n.label}
                  </button>
                );
              })}
              {user?.isAdmin && (
                <button onClick={() => go("/admin")} className="w-full flex items-center gap-3 px-4 h-11 text-sm font-semibold text-warn">
                  <ShieldCheck size={16} /> Painel admin
                </button>
              )}
            </div>
            <div className="mx-4 mt-4 rounded-xl bg-[#063644] border border-line p-3">
              <span className="w-10 h-10 rounded-lg bg-acc text-black flex items-center justify-center"><Gem size={18} /></span>
              <p className="font-bold mt-3">Dados reais, decisões melhores.</p>
              <p className="text-[12px] text-mut mt-1">Probabilidade estimada e valor esperado com fonte e horário em cada número. Sem odd de mercado, o EV não aparece.</p>
              <button onClick={() => go("/metodologia")} className="mt-3 text-live text-sm font-bold">Ver metodologia</button>
            </div>
            <button onClick={() => go("/jogo-responsavel")} className="mx-4 mt-4 text-[12px] text-mut">+18 · Jogo responsável</button>
          </aside>
          <button className="flex-1 bg-black/60" aria-label="Fechar" onClick={() => setOpen(false)} />
        </div>
      )}

      <main className="flex-1 w-full max-w-3xl mx-auto px-3 pt-3 pb-28">{children}<LegalFooter /></main>

      <div className="fixed top-16 right-2 left-2 sm:left-auto sm:w-90 z-[75] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto bg-panel border border-acc/40 rounded-xl p-3 shadow-xl flex gap-2">
            <button className="flex-1 text-left" onClick={() => { dismissToast(t.id); if (t.url) router.push(t.url); }}>
              <p className="text-sm font-bold leading-tight">{t.title}</p>
              <p className="text-xs text-mut mt-0.5">{t.body}</p>
            </button>
            <button onClick={() => dismissToast(t.id)} className="text-mut"><X size={14} /></button>
          </div>
        ))}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-[70] bg-panel border-t border-line" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-3xl mx-auto grid grid-cols-5">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            const Icon = n.icon;
            return (
              <Link key={n.href} href={n.href} className={`relative flex flex-col items-center gap-0.5 py-2 min-h-14 text-[11px] font-bold ${active ? "text-acc" : "text-mut"}`}>
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {n.label}
                {n.href === "/favoritos" && favCount > 0 && <span className="absolute top-1 right-[18%] min-w-4 h-4 px-1 rounded-full bg-live text-white text-[9px] leading-4 text-center">{favCount}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}