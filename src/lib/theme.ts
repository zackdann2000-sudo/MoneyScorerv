/**
 * DESIGN TOKENS — Money Sênior
 * =====================================================================
 * Fonte única de verdade para cores e tipografia usadas nos componentes
 * TypeScript. Os valores abaixo ESPELHAM exatamente as variáveis CSS de
 * `src/app/globals.css` (tema escuro). Se mudar um, mude o outro.
 *
 * IMPORTANTE — por que não usamos #00C853/#1A2332/#A0A0A0 aqui:
 * a paleta atual foi validada visualmente e é a identidade do produto.
 * A migração para os valores de auditoria (#00C853 etc.) está planejada
 * como commit isolado, justamente para não repintar todas as telas de
 * uma vez. Os valores de auditoria ficam registrados em `AUDIT_TARGET`
 * mais abaixo como referência, sem serem aplicados.
 *
 * Em componentes, prefira as classes Tailwind (`bg-panel`, `text-mut`,
 * `text-acc`) — elas já resolvem para estes mesmos tokens. Use este
 * arquivo quando precisar do valor cru (ex.: `style={{ color }}` em
 * SVG, gráficos ou cálculo de contraste).
 * =====================================================================
 */

/* ---------------------------- CORES ---------------------------------- */

/** Superfícies de fundo, do mais escuro ao mais claro. */
export const surface = {
  /** Fundo principal da página. */
  bg: "#001e28",
  /** Fundo alternado (faixas, seções secundárias). */
  bg2: "#002833",
  /** Painel/card padrão. */
  panel: "#05303d",
  /** Painel secundário (linhas de tabela, chips, campos). */
  panel2: "#0a3c4b",
  /** Bordas e divisores. */
  line: "#123f4d",
} as const;

/** Texto. */
export const text = {
  /** Texto principal. Branco puro sobre os fundos escuros: contraste ~16:1. */
  ink: "#ffffff",
  /**
   * Texto secundário. #9fb4bd sobre --bg (#001e28) dá contraste ~7.4:1,
   * acima do mínimo WCAG AA (4.5:1) para texto normal.
   */
  mut: "#9fb4bd",
} as const;

/** Cores de marca e semânticas. */
export const accent = {
  /** Verde de destaque principal — botões, tabs ativas, positivos. */
  acc: "#1fbf75",
  /** Verde claro, para estados suaves/fundos translúcidos. */
  acc2: "#8ee0b5",
  /**
   * Texto sobre `acc`.
   *
   * NÃO use branco: #ffffff sobre #1fbf75 dá 2.4:1 e reprova no WCAG AA.
   * Preto sobre #1fbf75 dá 8.77:1 (AAA). É o par usado nos cards de odd
   * selecionados e nas tabs ativas.
   */
  onAcc: "#000000",
} as const;

/** Cores semânticas por significado. */
export const semantic = {
  danger: "#ff4d4f",
  warn: "#f5b301",
  /** Time da casa (azul). */
  home: "#4d9fff",
  /** Time de fora (laranja). */
  away: "#ff8a4d",
  /** Destaque informativo. */
  cyan: "#7ec8d6",
  purple: "#c084fc",
  /** Indicador de jogo ao vivo. */
  live: "#e6003c",
} as const;

/** Objeto único com todas as cores, para conveniência. */
export const colors = {
  ...surface,
  ...text,
  ...accent,
  ...semantic,
} as const;

/* -------------------------- TIPOGRAFIA -------------------------------- */

/**
 * Três tamanhos padrão do produto. Os componentes usam uma escala
 * intermediária de 8–14px para dados densos (bolinhas, tabelas), mas
 * TODO texto de conteúdo deve cair em um destes três níveis.
 */
export const typography = {
  /** Títulos de seção, placar, números grandes. */
  display: { size: "1.5rem", sizePx: 24, weight: 700, lineHeight: 1.15 },
  /** Corpo de texto, descrições, parágrafos. */
  body: { size: "0.875rem", sizePx: 14, weight: 400, lineHeight: 1.5 },
  /** Legendas, metadados, rótulos em maiúsculas. */
  caption: { size: "0.6875rem", sizePx: 11, weight: 600, lineHeight: 1.4 },
} as const;

/** Famílias tipográficas (resolvem para as fontes do next/font). */
export const fontFamily = {
  display: 'var(--font-display), "Barlow Condensed", sans-serif',
  body: 'var(--font-body), "Manrope", sans-serif',
} as const;

/* ------------------------ ALVO DA AUDITORIA --------------------------- */

/**
 * Valores propostos pela auditoria de design. NÃO aplicados — ficam aqui
 * como referência para o commit de repintura global. Quando a migração
 * acontecer, estes viram os valores de `surface`/`accent`/`text` acima.
 */
export const AUDIT_TARGET = {
  accent: "#00C853",
  background: "#1A2332",
  textSecondary: "#A0A0A0",
} as const;

/* --------------------------- UTILITÁRIOS ------------------------------ */

/**
 * Contraste WCAG entre duas cores hex (1–21).
 * Útil para validar pares texto/fundo antes de usar um token novo.
 */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const v = parseInt(full.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return +((x + 0.05) / (y + 0.05)).toFixed(2);
}
