import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import Shell from "@/components/Shell";

const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-barlow" });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: { default: "GreenScore · Análises Esportivas PRO", template: "%s | GreenScore" },
  description: "Estatísticas ao vivo, IA preditiva, oportunidades e rankings — estilo GreenScorer, dados reais ESPN.",
  manifest: "/manifest.json",
};
export const viewport: Viewport = { themeColor: "#060f0a", width: "device-width", initialScale: 1, viewportFit: "cover" };

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
                  serviceWorkerPath: "TwoSignalSDKWorker.js",
                  serviceWorkerParam: { scope: "/" },
                  allowLocalhostAsSecureOrigin: true,
                  notifyButton: { enable: false }
                });
              } catch(e) { console.warn("OneSignal:", e && e.message); }
            });`}
        </Script>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}