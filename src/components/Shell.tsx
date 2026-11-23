"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  CircleHelp,
  Gem,
  LayoutGrid,
  Menu,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useApp } from "@/context/AppContext";
import LegalFooter from "@/components/LegalFooter";
import TrialBanner from "@/components/TrialBanner";
import InstallApp from "@/components/InstallApp";
import Onboarding from "@/components/Onboarding";
import StripeReturn from "@/components/StripeReturn";
import ExploreSheet from "@/components/ExploreSheet";
import {
  GRUPOS,
  ROTAS_IA,
  ROTAS_JOGOS,
  pertence,
  rotaAtiva,
  type NavItem,
} from "@/lib/navigation";

/**
 * Casca do app (header + navegação + toasts).
 *
 * ESTRUTURA DE NAVEGAÇÃO (mobile-first)
 *  · 4 abas fixas: Jogos · IA · Explorar · Conta.
 *  · "Explorar" abre um bottom sheet com os 3 grupos principais — substitui a
 *    antiga faixa de 13 chips que empurrava o conteúdo para baixo em toda tela.
 *  · O menu lateral guarda a árvore completa, agrupada por intenção. O grupo
 *    "Mais ferramentas" nasce recolhido: 12 destinos de uso ocasional não
 *    precisam competir com os 15 do dia a dia.
 */

const TABS = [
  { id: "jogos", label: "Jogos", icon: CalendarDays, href: "/" },
  { id: "ia", label: "IA", icon: Sparkles, href: "/supertips/palpites" },
  { id: "explorar", label: "Explorar", icon: LayoutGrid, href: null },
  { id: "conta", label: "Conta", icon: CircleHelp, href: "/config" },
] as const;

/** Item do menu lateral. */
function ItemMenu({ n, ativo, onClick }: { n: NavItem; ativo: boolean; onClick: () => void }) {
  const Icon = n.icon;
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 px-4 text-sm font-semibold ${
        ativo ? "bg-live text-white" : "text-ink"
      }`}
    >
      <Icon size={16} />
      {n.label}
    </button>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { theme, toggleTheme, user, toasts, dismissToast, favorites } = useApp();
  const [open, setOpen] = useState(false); // menu lateral
  const [explorar, setExplorar] = useState(false); // bottom sheet
  const favCount = favorites.length;

  const go = (href: string) => {
    setOpen(false);
    setExplorar(false);
    router.push(href);
  };

  const tabAtiva = (id: (typeof TABS)[number]["id"]) => {
    if (id === "explorar") return explorar;
    if (id === "jogos") return pertence(path, ROTAS_JOGOS);
    if (id === "ia") return pertence(path, ROTAS_IA);
    return (
      rotaAtiva(path, "/config") ||
      rotaAtiva(path, "/favoritos") ||
      rotaAtiva(path, "/desempenho") ||
      path === "/login" ||
      path === "/cadastro"
    );
  };

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
          <button
            onClick={() => setOpen(true)}
            aria-label="Abrir menu completo"
            className="w-10 h-10 rounded-xl border border-line flex items-center justify-center text-ink"
          >
            <Menu size={18} />
          </button>
          {user?.isAdmin && (
            <Link href="/admin" aria-label="Admin" className="w-11 h-11 flex items-center justify-center text-warn">
              <ShieldCheck size={18} />
            </Link>
          )}
          <button onClick={toggleTheme} aria-label="Alternar tema" className="w-11 h-11 flex items-center justify-center text-ink">
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link href="/config#alertas" aria-label="Notificações" className="w-11 h-11 flex items-center justify-center text-ink">
            <Bell size={18} />
          </Link>
          <Link
            href={user ? "/config" : "/login"}
            aria-label="Conta"
            className="w-8 h-8 rounded-full bg-panel2 border border-line text-ink font-display font-bold flex items-center justify-center text-sm"
          >
            {user ? user.name.slice(0, 1).toUpperCase() : "?"}
          </Link>
        </div>
      </header>
      <TrialBanner />

      {/* ---------------- MENU LATERAL (árvore completa) ---------------- */}
      {open && (
        <div className="fixed inset-0 z-[80] flex">
          <aside className="w-[min(100%,330px)] h-full bg-[#042833] text-ink overflow-y-auto pb-8">
            <div className="flex items-center justify-between px-4 h-14 border-b border-white/5">
              <span className="font-display font-bold">GreenScore</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="w-11 h-11 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>

            {GRUPOS.map((g) => {
              const itens = g.itens.map((n) => (
                <ItemMenu key={n.href} n={n} ativo={rotaAtiva(path, n.href)} onClick={() => go(n.href)} />
              ));

              if (g.recolhido) {
                return (
                  <details key={g.id} className="group border-t border-white/5">
                    <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-[10px] font-black uppercase tracking-widest text-mut">
                      {g.titulo}
                      <span className="flex items-center gap-1 text-[9px] font-bold normal-case tracking-normal">
                        {g.itens.length} itens
                        <ChevronDown size={14} className="transition-transform group-open:rotate-180" />
                      </span>
                    </summary>
                    <div>{itens}</div>
                  </details>
                );
              }

              return (
                <section key={g.id} className="border-t border-white/5 pt-1">
                  <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-mut">
                    {g.titulo}
                  </p>
                  {itens}
                </section>
              );
            })}

            {user?.isAdmin && (
              <button
                onClick={() => go("/admin")}
                className="flex h-11 w-full items-center gap-3 border-t border-white/5 px-4 text-sm font-semibold text-warn"
              >
                <ShieldCheck size={16} /> Painel admin
              </button>
            )}

            <div className="mx-4 mt-4 rounded-xl bg-[#063644] border border-line p-3">
              <span className="w-10 h-10 rounded-lg bg-acc text-black flex items-center justify-center">
                <Gem size={18} />
              </span>
              <p className="font-bold mt-3">Dados reais, decisões melhores.</p>
              <p className="text-[12px] text-mut mt-1">
                Probabilidade estimada e valor esperado com fonte e horário em cada número. Sem odd de
                mercado, o EV não aparece.
              </p>
              <button onClick={() => go("/metodologia")} className="mt-3 text-live text-sm font-bold">
                Ver metodologia
              </button>
            </div>
            <button onClick={() => go("/jogo-responsavel")} className="mx-4 mt-4 text-[12px] text-mut">
              +18 · Jogo responsável
            </button>
          </aside>
          <button className="flex-1 bg-black/60" aria-label="Fechar" onClick={() => setOpen(false)} />
        </div>
      )}

      <main className="flex-1 w-full max-w-3xl mx-auto px-3 pt-3 pb-28">
        {children}
        <LegalFooter />
      </main>

      <div className="fixed top-16 right-2 left-2 sm:left-auto sm:w-90 z-[75] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto bg-panel border border-acc/40 rounded-xl p-3 shadow-xl flex gap-2">
            <button
              className="flex-1 text-left"
              onClick={() => {
                dismissToast(t.id);
                if (t.url) router.push(t.url);
              }}
            >
              <p className="text-sm font-bold leading-tight">{t.title}</p>
              <p className="text-xs text-mut mt-0.5">{t.body}</p>
            </button>
            <button onClick={() => dismissToast(t.id)} className="text-mut">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* ---------------- TABS INFERIORES (4) ---------------- */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-[70] bg-panel border-t border-line"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="max-w-3xl mx-auto grid grid-cols-4">
          {TABS.map((n) => {
            const active = tabAtiva(n.id);
            const Icon = n.icon;
            const conteudo = (
              <>
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {n.label}
                {n.id === "conta" && favCount > 0 && (
                  <span className="absolute top-1 right-[18%] min-w-4 h-4 px-1 rounded-full bg-live text-white text-[9px] leading-4 text-center">
                    {favCount}
                  </span>
                )}
              </>
            );
            const classe = `relative flex flex-col items-center gap-0.5 py-2 min-h-14 text-[11px] font-bold ${
              active ? "text-acc" : "text-mut"
            }`;

            return n.href ? (
              <Link key={n.id} href={n.href} className={classe}>
                {conteudo}
              </Link>
            ) : (
              <button
                key={n.id}
                onClick={() => setExplorar(true)}
                aria-expanded={explorar}
                aria-label="Explorar seções"
                className={classe}
              >
                {conteudo}
              </button>
            );
          })}
        </div>
      </nav>

      {/* bottom sheet que substituiu a faixa de chips */}
      <ExploreSheet
        aberto={explorar}
        onFechar={() => setExplorar(false)}
        onMenuCompleto={() => {
          setExplorar(false);
          setOpen(true);
        }}
        path={path}
      />

      {/* convite de instalação: só aparece quando o navegador diz que dá para instalar */}
      <InstallApp />

      {/* tutorial de 4 telas: só para conta logada que ainda não viu (localStorage) */}
      <Onboarding />

      {/* retorno do Stripe: atualiza o VIP na hora e limpa ?assinou da URL */}
      <StripeReturn />
    </div>
  );
}
