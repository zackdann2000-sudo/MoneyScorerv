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
  ]),
]);
