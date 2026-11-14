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
const nextConfig: NextConfig = {};

export default nextConfig;
