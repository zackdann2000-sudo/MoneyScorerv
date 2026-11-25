import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright — só roda no CI do GitHub (linux x64).
 *
 * O teste é de CONTRATO DE TELA: a rota /api/screener/props é interceptada, então
 * ele não precisa de banco, de chave de fornecedor nem de cota — valida que a
 * consulta montada chega na API com os filtros certos e que os cards mostram
 * taxa, contagem e sequência.
 *
 * Rodar localmente (não é obrigatório, e num celular não cabe):
 *   npx playwright install chromium && npm run test:e2e
 */
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    /* App é mobile-first: testar no viewport de celular é o cenário real. */
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    /* `next dev --webpack`: no runner linux o Turbopack também funciona, mas o
       dev server evita pré-renderizar (e tocar no banco) páginas fora do teste. */
    command: `npx next dev --webpack -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
