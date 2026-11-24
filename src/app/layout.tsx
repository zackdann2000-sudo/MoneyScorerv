import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { BetSlipProvider } from "@/context/BetSlipContext";
import BetSlipDock from "@/components/apitou/BetSlipDock";
import Shell from "@/components/Shell";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope" });

/** Base canônica para canonical/OG. Cai no domínio do produto se o env faltar. */
const SITE_URL = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://greenscore.app");
  } catch {
    return new URL("https://greenscore.app");
  }
})();

/**
 * Analytics opcional por env: sem `NEXT_PUBLIC_GA_ID` NADA de script de terceiro
 * é carregado (zero requisição, zero cookie). Com a env presente, entra o GA4
 * em modo anônimo — sem Google Signals e sem personalização de anúncio.
 * O tráfego logado já é contado no banco pela tabela `visits` (/api/auth/me).
 */
const GA_ID = (process.env.NEXT_PUBLIC_GA_ID || "").trim();

const DESCRICAO =
  "Análise esportiva quantitativa com modelo próprio: probabilidades, xG, props por jogador, combinada com EV e alertas de gol ao vivo. Números explicados — sem promessa de lucro.";

const TITULO = "GreenScore · Análise Esportiva Quantitativa e Alertas ao Vivo";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: { default: TITULO, template: "%s | GreenScore" },
  description: DESCRICAO,
  applicationName: "GreenScore",
  keywords: [
    "análise esportiva",
    "probabilidades futebol",
    "xG",
    "player props",
    "combinada",
    "EV",
    "palpites com probabilidade",
    "alertas de gol",
    "ao vivo",
  ],
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  appleWebApp: { capable: true, title: "GreenScore", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192x192.png", sizes: "192x192" }],
  },
  openGraph: {
    type: "website",
    siteName: "GreenScore",
    locale: "pt_BR",
    url: "/",
    title: TITULO,
    description: DESCRICAO,
    images: [{ url: "/icon-512x512.png", width: 512, height: 512, alt: "GreenScore" }],
  },
  twitter: {
    card: "summary",
    title: TITULO,
    description: DESCRICAO,
    images: ["/icon-512x512.png"],
  },
};
// #001e28 = --bg do app (globals.css). Antes estava #060f0a, que não existe no tema.
export const viewport: Viewport = { themeColor: "#001e28", width: "device-width", initialScale: 1, maximumScale: 5, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('gs_theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body className={`${barlow.variable} ${manrope.variable} antialiased`}>
        <Script src="https://frosty-disk-8a68.moneyiosates.workers.dev/sdks/web/v16/OneSignalSDK.page.js" strategy="afterInteractive" />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`window.OneSignalDeferred = window.OneSignalDeferred || [];
            OneSignalDeferred.push(async function(OneSignal) {
              try {
                await OneSignal.init({
                  appId: "f06a705d-ebd0-4390-9a11-207fe769b81d",
                  // usa o MESMO worker do PWA: dois workers no scope "/" se anulam e o do
                  // OneSignal não tem handler de fetch (bloqueia a instalação no Android)
                  serviceWorkerPath: "sw.js",
                  serviceWorkerParam: { scope: "/" },
                  allowLocalhostAsSecureOrigin: true,
                  notifyButton: { enable: false }
                });
              } catch(e) { console.warn("OneSignal:", e && e.message); }
            });`}
        </Script>
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}',{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});`}
            </Script>
          </>
        )}
        <AppProvider>
          {/* O bilhete vive no layout: a mesma combinada atravessa /apitou,
              /jogos e /mercardos — antes ele morria ao trocar de aba. */}
          <BetSlipProvider>
            <Shell>{children}</Shell>
            <BetSlipDock />
          </BetSlipProvider>
        </AppProvider>
      </body>
    </html>
  );
}