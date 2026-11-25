import type { NextConfig } from "next";

/**
 * Logos e fotos de jogadores vêm dos CDNs das APIs (ESPN, Sportmonks,
 * Football-Data) e mudam por requisição, por isso os componentes usam <img>
 * em vez de next/image — não há domínios fixos para configurar aqui.
 *
 * Observação: no Next 16 o ESLint não roda mais durante `next build`,
 * então não existe mais a chave `eslint` no NextConfig.
 * Use `npm run lint` (ou no CI) para checar as regras.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
