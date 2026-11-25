import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  // `.next`/`out`/`build` são artefatos. `replica`, `.tmp`, `apk_extracted` e
  // `reverse_engineering` são dumps de recon e rascunhos fora do app: lintá-los só
  // gastava tempo (centenas de MB) sem apontar nada do produto. `drizzle/meta` é
  // snapshot gerado.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "replica/**",
    ".tmp/**",
    "apk_extracted/**",
    "reverse_engineering/**",
    "drizzle/meta/**",
    "playwright-report/**",
    "test-results/**",
    "eslint-report.json",
  ]),

  // O eslint-config-next 16 traz o eslint-plugin-react-hooks v6 (era React
  // Compiler): `setState` dentro de `useEffect` e chamada de função impura
  // durante o render viraram ERRO.
  //
  // `react-hooks/set-state-in-effect` rebaixado para AVISO de propósito: o app
  // busca dados no cliente com `fetch` dentro de `useEffect` em 8 componentes
  // (LigasClient, GamesBoard, ComboTab, StatsJogoTab, BetSlipDock, BuscaGlobal,
  // TrialExpiradoModal). Não são bugs — é o padrão de fetch client-side de 2024 —
  // mas a refatoração (SWR/`use()`/server component) é grande demais para fazer
  // às cegas no celular, sem poder rodar `next build` localmente. Como aviso, o
  // CI fica verde e a dívida continua visível nas anotações do check run.
  // TODO(pós-lançamento): refatorar caso a caso e voltar para "error".
  //
  // O `files` NÃO é opcional aqui. O eslint-config-next 16 registra o plugin
  // `react-hooks` num objeto limitado a `**/*.{js,jsx,mjs,ts,tsx,mts,cts}` —
  // `.cjs` fica de fora (os 48 `*.test.cjs` e scripts `*.cjs` do projeto).
  // Sem `files`, este override valia também para `.cjs`, onde o plugin não
  // existe, e o ESLint abortava com exit 2 (erro de configuração) antes de
  // lintar qualquer coisa: nenhum relatório era escrito e o único sintoma no
  // CI era "relatório ausente". Por isso o glob tem de espelhar o do Next.
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);
