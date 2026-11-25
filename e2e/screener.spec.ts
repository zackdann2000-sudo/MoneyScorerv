import { test, expect, type Page, type Route } from "@playwright/test";

/* =============================================================================
   Screener avançado — contrato da tela.

   A API é interceptada: o teste não depende de banco, de chave paga nem de cota.
   O que ele garante:
   1. a consulta montada chega na API com entidade/métrica/linha/janela/taxa;
   2. os cards mostram taxa, "X de N", sequência e bolinhas;
   3. os estados vazio e erro aparecem quando a API responde assim;
   4. o aviso de "frequência, não previsão" está sempre visível.
   ========================================================================== */

type CorpoConsulta = {
  entidade: "jogador" | "time";
  metrica: string;
  condicao: "pelo_menos" | "abaixo";
  linha: number;
  janela: number;
  taxaMinima: number;
  liga: string;
};

const METADADOS = {
  entidades: ["jogador", "time"],
  metricas: [
    { id: "j_passes_certos", entidade: "jogador", label: "Passes certos", criterio: "passes certos por jogo", linhaPadrao: 24.5, passo: 1, etapa: null },
    { id: "j_finalizacoes", entidade: "jogador", label: "Finalizações", criterio: "finalizações por jogo", linhaPadrao: 1.5, passo: 0.5, etapa: null },
    { id: "t_gols_marcados", entidade: "time", label: "Gols marcados", criterio: "gols do time por jogo", linhaPadrao: 1.5, passo: 0.5, etapa: "A" },
    { id: "t_escanteios", entidade: "time", label: "Escanteios do time", criterio: "escanteios do time por jogo", linhaPadrao: 4.5, passo: 0.5, etapa: "B" },
  ],
  janelas: [3, 5, 10],
  taxa: { padrao: 70, min: 50, max: 100 },
  minAmostra: 3,
  tetos: { timeA: 16, timeB: 8, jogador: 12 },
};

const resultado = (nome: string, taxa: number, acertos: number, amostra: number, sequencia: number, serie: (0 | 1)[]) => ({
  id: nome.toLowerCase().replace(/\s+/g, "-"),
  nome,
  contexto: "Manchester City",
  posicao: "M",
  foto: null,
  avaliacao: { amostra, acertos, taxa, serie, sequencia, media: 31.4, aprovado: true },
});

const RESULTADOS = [
  resultado("Rodri", 90, 9, 10, 3, [1, 1, 0, 1, 1, 1, 1, 1, 1, 1]),
  resultado("Bernardo Silva", 80, 8, 10, 2, [1, 1, 1, 0, 1, 1, 0, 1, 1, 1]),
];

const AVISO = "Frequência observada nos jogos com dado. Não é probabilidade nem garantia do próximo jogo.";

/** Intercepta a API do screener e guarda o corpo enviado pela tela. */
async function interceptar(
  page: Page,
  opts: { resultados?: unknown[]; erro?: string } = {},
): Promise<{ corpo: () => CorpoConsulta | null }> {
  let enviado: CorpoConsulta | null = null;
  await page.route("**/api/screener/props", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: METADADOS });
      return;
    }
    enviado = route.request().postDataJSON() as CorpoConsulta;
    if (opts.erro) {
      await route.fulfill({ json: { error: opts.erro } });
      return;
    }
    const res = opts.resultados ?? RESULTADOS;
    await route.fulfill({
      json: {
        entidade: enviado.entidade,
        metrica: { id: enviado.metrica, label: "Passes certos", criterio: "passes certos por jogo", linha: enviado.linha },
        consulta: { descricao: `jogadores com Passes certos pelo menos ${enviado.linha} em ≥${enviado.taxaMinima}% dos últimos ${enviado.janela} jogos` },
        resultados: res,
        avaliados: 12,
        total: res.length,
        trilha: { banco: 2, espn: 12, api: 0 },
        semDados: [],
        cobertura: { jogadoresAvaliados: 40, contaAtiva: true },
        aviso: AVISO,
        fonte: "cache",
      },
    });
  });
  return { corpo: () => enviado };
}

const abrir = async (page: Page) => {
  /* Sem isto o modal de onboarding (3 telas, uma vez por navegador) cobre a tela
     e intercepta os cliques. A flag é a mesma que o componente lê. */
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gs_onboarding_v3", "1");
    } catch {
      /* storage bloqueado: segue sem a flag */
    }
  });
  await page.goto("/screener");
  /* A tela só habilita o botão quando recebeu as métricas do servidor. */
  await expect(page.getByTestId("filtrar")).toBeEnabled();
};

test("monta a consulta e envia os filtros escolhidos", async ({ page }) => {
  const api = await interceptar(page);
  await abrir(page);

  await page.getByTestId("metrica").selectOption("j_passes_certos");
  await page.getByTestId("janela-10").click();
  await page.getByTestId("taxa-90").click();
  await page.getByTestId("linha").fill("29.5");
  await page.getByTestId("filtrar").click();

  await expect(page.getByTestId("resultado").first()).toBeVisible();

  const corpo = api.corpo();
  expect(corpo).not.toBeNull();
  expect(corpo!.entidade).toBe("jogador");
  expect(corpo!.metrica).toBe("j_passes_certos");
  expect(corpo!.condicao).toBe("pelo_menos");
  expect(corpo!.linha).toBe(29.5);
  expect(corpo!.janela).toBe(10);
  expect(corpo!.taxaMinima).toBe(90);
});

test("mostra taxa, contagem, sequência e a série de cada candidato", async ({ page }) => {
  await interceptar(page);
  await abrir(page);
  /* Janela de 10: a descrição da consulta cita a janela enviada (a última
     asserção checa "últimos 10 jogos") e a série mockada tem 10 bolinhas. */
  await page.getByTestId("janela-10").click();
  await page.getByTestId("filtrar").click();

  const cards = page.getByTestId("resultado");
  await expect(cards).toHaveCount(2);

  const primeiro = cards.first();
  await expect(primeiro.getByTestId("resultado-nome")).toHaveText("Rodri");
  await expect(primeiro.getByTestId("resultado-taxa")).toHaveText("90%");
  await expect(primeiro.getByTestId("resultado-contagem")).toHaveText("9 de 10");
  await expect(primeiro.getByTestId("resultado-sequencia")).toContainText("3 seguidas");

  /* Uma bolinha por jogo da janela: 10. */
  const bolinhas = primeiro.locator("span.rounded-full.h-1\\.5");
  await expect(bolinhas).toHaveCount(10);

  /* O resumo e a descrição da consulta vêm do servidor. */
  await expect(page.getByTestId("resumo")).toContainText("2 resultados");
  await expect(page.getByTestId("descricao")).toContainText("últimos 10 jogos");
});

test("trocar para time recarrega as métricas e envia a entidade time", async ({ page }) => {
  const api = await interceptar(page);
  await abrir(page);

  await page.getByTestId("entidade-time").click();
  await expect(page.getByTestId("metrica").locator("option")).toHaveCount(2);
  await expect(page.getByTestId("metrica")).toHaveValue("t_gols_marcados");

  await page.getByTestId("filtrar").click();
  await expect(page.getByTestId("resultado").first()).toBeVisible();

  const corpo = api.corpo();
  expect(corpo!.entidade).toBe("time");
  expect(corpo!.metrica).toBe("t_gols_marcados");
});

test("métrica que exige resumo avisa o custo na tela", async ({ page }) => {
  await interceptar(page);
  await abrir(page);

  await page.getByTestId("entidade-time").click();
  await page.getByTestId("metrica").selectOption("t_escanteios");
  await expect(page.locator("text=exige o resumo de cada jogo")).toBeVisible();
});

test("nenhum candidato → estado vazio explicativo", async ({ page }) => {
  await interceptar(page, { resultados: [] });
  await abrir(page);
  await page.getByTestId("filtrar").click();

  await expect(page.getByTestId("vazio")).toBeVisible();
  await expect(page.getByTestId("vazio")).toContainText("Nenhum");
  await expect(page.getByTestId("resultado")).toHaveCount(0);
});

test("erro da API vira mensagem na tela, não tela vazia", async ({ page }) => {
  await interceptar(page, { erro: "Muitas consultas seguidas. Tente em alguns minutos." });
  await abrir(page);
  await page.getByTestId("filtrar").click();

  await expect(page.getByTestId("erro")).toBeVisible();
  await expect(page.getByTestId("erro")).toContainText("Muitas consultas");
  await expect(page.getByTestId("resultado")).toHaveCount(0);
});

test("o aviso de que é frequência (não previsão) aparece no resultado", async ({ page }) => {
  await interceptar(page);
  await abrir(page);
  await page.getByTestId("filtrar").click();

  await expect(page.getByTestId("aviso")).toContainText("Não é probabilidade");
  await expect(page.getByText(/frequência do passado/i)).toBeVisible();
});
