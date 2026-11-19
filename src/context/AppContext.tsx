"use client";
import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { lerOuCriarDeviceId } from "@/lib/deviceId";

export type FavTeam = { id: string; name: string; league: string; logo: string };
export type User = { id: number; name: string; email: string; role: string; plan: string; expiresAt: string | null; isAdmin: boolean; access: { active: boolean; daysLeft: number; label: string } };
export type Toast = { id: string; title: string; body: string; url?: string };
export type AlertFlags = { goals: boolean; redCards: boolean; yellowCards: boolean; corners: boolean; fouls: boolean; offsides: boolean; matchStart: boolean; matchEnd: boolean; substitutions: boolean; lineups: boolean; MoneyTIPS: boolean };

export const DEFAULT_FLAGS: AlertFlags = { goals: true, redCards: true, yellowCards: false, corners: true, fouls: false, offsides: false, matchStart: true, matchEnd: true, substitutions: false, lineups: true, MoneyTIPS: true };

type Ctx = {
  user: User | null; refreshUser: () => Promise<void>; vip: boolean;
  /** UUID do aparelho (localStorage) usado no anti-fraude do trial. */
  deviceId: string | null;
  theme: string; toggleTheme: () => void;
  favorites: FavTeam[]; isFavorite: (id: string) => boolean; toggleFavorite: (t: FavTeam) => void;
  flags: AlertFlags; setFlags: (f: AlertFlags) => void;
  toasts: Toast[]; addToast: (t: Omit<Toast, "id">) => void; dismissToast: (id: string) => void;
};

const AppCtx = createContext<Ctx>(null as any);
export const useApp = () => useContext(AppCtx);

const FLAG_OF: Record<string, keyof AlertFlags> = { goal: "goals", pen: "goals", own: "goals", pen_miss: "goals", yellow: "yellowCards", red: "redCards", sub: "substitutions", start: "matchStart", end: "matchEnd", corner: "corners", foul: "fouls", offside: "offsides", lineup: "lineups" };

export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(() => lerOuCriarDeviceId());
  // Lê o localStorage uma única vez, de forma preguiçosa (lado cliente), evitando setState em cascata no efeito de montagem.
  const [theme, setTheme] = useState<string>(() => (typeof window === "undefined" ? "dark" : (() => { try { return localStorage.getItem("gs_theme") || "dark"; } catch { return "dark"; } })()));
  const [favorites, setFavorites] = useState<FavTeam[]>(() => (typeof window === "undefined" ? [] : (() => { try { const f = localStorage.getItem("gs_favs"); return f ? JSON.parse(f) : []; } catch { return []; } })()));
  const [flags, setFlagsState] = useState<AlertFlags>(() => (typeof window === "undefined" ? DEFAULT_FLAGS : (() => { try { const fl = localStorage.getItem("gs_flags"); return fl ? { ...DEFAULT_FLAGS, ...JSON.parse(fl) } : DEFAULT_FLAGS; } catch { return DEFAULT_FLAGS; } })()));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sinceRef = useRef<number | null>(null);
  const favRef = useRef<FavTeam[]>([]);
  const flagsRef = useRef(flags);
  // refs espelhando estado são sincronizadas em efeito (nunca durante o render)
  useEffect(() => { const id = lerOuCriarDeviceId(); if (id && id !== deviceId) setDeviceId(id); }, [deviceId]);
  useEffect(() => { favRef.current = favorites; }, [favorites]);
  useEffect(() => { flagsRef.current = flags; }, [flags]);

  const refreshUser = useCallback(async () => {
    try { const r = await fetch("/api/auth/me"); const j = await r.json(); setUser(j.user || null); } catch { setUser(null); }
  }, []);

  useEffect(() => {
    // setUser acontece no callback do fetch (assíncrono), nunca no corpo síncrono do efeito.
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((j) => setUser(j.user || null))
      .catch(() => setUser(null));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // aplica o tema no <html> quando ele muda (inclui preferência vinda do localStorage)
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  // sincroniza favoritos do servidor quando logado
  useEffect(() => {
    if (!user) return;
    fetch("/api/favorites").then((r) => r.json()).then((j) => {
      if (Array.isArray(j.favorites) && j.favorites.length) {
        setFavorites((local) => {
          const map = new Map(local.map((t) => [t.id, t]));
          j.favorites.forEach((t: FavTeam) => map.set(t.id, t));
          const merged = [...map.values()];
          try { localStorage.setItem("gs_favs", JSON.stringify(merged)); } catch {}
          return merged;
        });
      }
    }).catch(() => {});
    fetch("/api/preferences").then((r) => r.json()).then((j) => {
      if (j.alerts && Object.keys(j.alerts).length) setFlagsState((f) => ({ ...f, ...j.alerts }));
    }).catch(() => {});
  }, [user]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try { localStorage.setItem("gs_theme", next); } catch {}
      return next;
    });
  }, []);

  const isFavorite = useCallback((id: string) => favorites.some((t) => t.id === String(id)), [favorites]);
  const toggleFavorite = useCallback((t: FavTeam) => {
    setFavorites((prev) => {
      const exists = prev.some((x) => x.id === t.id);
      const next = exists ? prev.filter((x) => x.id !== t.id) : [...prev, t];
      try { localStorage.setItem("gs_favs", JSON.stringify(next)); } catch {}
      fetch("/api/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ team: t, on: !exists }) }).catch(() => {});
      return next;
    });
  }, []);

  const setFlags = useCallback((f: AlertFlags) => {
    setFlagsState(f);
    try { localStorage.setItem("gs_flags", JSON.stringify(f)); } catch {}
    fetch("/api/preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId: "*", alerts: f }) }).catch(() => {});
    // tags OneSignal para segmentação no servidor
    try {
      const w = window as any;
      if (w.OneSignalDeferred) w.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          await OneSignal.User.addTags({ MoneyTIPS: String(f.MoneyTIPS), alerts_goals: String(f.goals), alerts_redCards: String(f.redCards), alerts_yellowCards: String(f.yellowCards), alerts_corners: String(f.corners), alerts_matchEnd: String(f.matchEnd), alerts_matchStart: String(f.matchStart), alerts_lineups: String(f.lineups) });
          favRef.current.forEach((t) => OneSignal.User.addTag(`fav_${t.id}`, "true"));
        } catch {}
      });
    } catch {}
  }, []);

  const dismissToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 9000);
  }, []);

  // Motor de alertas in-site: poll do feed do servidor
  useEffect(() => {
    if (sinceRef.current == null) sinceRef.current = Date.now();
    let stop = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/alerts/feed?since=${sinceRef.current}`);
        const j = await r.json();
        sinceRef.current = j.now || Date.now();
        for (const a of j.alerts || []) {
          const flag = FLAG_OF[a.type as string];
          const enabled = flag ? flagsRef.current[flag] : true;
          const favMatch = a.teamId === "teste" || favRef.current.some((t) => t.id === a.teamId) || favRef.current.length === 0;
          if (!enabled) continue;
          if (!favMatch && a.type !== "end") continue;
          addToast({ title: a.title, body: a.body, url: a.url });
          try {
            if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
              new Notification(a.title, { body: a.body, icon: "/icon.png" });
            }
          } catch {}
        }
      } catch {}
      if (!stop) setTimeout(tick, 30000);
    };
    const t0 = setTimeout(tick, 6000);
    return () => { stop = true; clearTimeout(t0); };
  }, [addToast]);

  const vip = !!user && (user.isAdmin || user.access.active);

  return (
    <AppCtx.Provider value={{ user, refreshUser, vip, deviceId, theme, toggleTheme, favorites, isFavorite, toggleFavorite, flags, setFlags, toasts, addToast, dismissToast }}>
      {children}
    </AppCtx.Provider>
  );
}