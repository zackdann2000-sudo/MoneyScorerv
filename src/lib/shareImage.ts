/**
 * Captura de card como imagem — Feature #1 (compartilhar análise).
 *
 * ## Por que `html2canvas-pro` e não `html2canvas`
 *
 * O projeto usa Tailwind 4, que emite `oklch()` na paleta padrão e
 * `color-mix(in oklab, …)` nos modificadores de opacidade (`bg-acc/15`,
 * `from-acc/10`). O `html2canvas` oficial (1.4.1, de 2022) não sabe ler essas
 * funções de cor e explode com "Attempting to parse an unsupported color
 * function". O `html2canvas-pro` é o fork mantido que entende `oklch/oklab/lab/
 * lch/color()/color-mix` e ainda suporta `backdrop-filter` e `clip-path`.
 *
 * ## Por que import dinâmico
 *
 * São ~1,5 MB de biblioteca. Ninguém deve pagar isso ao abrir a página: o
 * `import()` só acontece no clique do botão, então o pacote fica num chunk
 * separado e o bundle inicial não muda.
 *
 * ## Regras
 *
 *   • Módulo é **client-only**: usa `document`, `navigator` e `canvas`. Não
 *     importar em Server Component.
 *   • Nenhuma telemetria, nenhuma chamada de rede: a imagem nasce e morre no
 *     aparelho do usuário.
 *   • `onclone` limpa o clone (e não a tela): animação, transição,
 *     `backdrop-filter` e `position: sticky/fixed` quebram a captura, e o que
 *     tem `data-noshare` (botões, steppers) não entra na imagem.
 */

/** Elemento marcado com este atributo não aparece na imagem. */
export const ATRIBUTO_SEM_IMAGEM = "data-noshare";

export type CapturarOpts = {
  /** Fundo da imagem. `null` (default) mantém transparência. */
  backgroundColor?: string | null;
  /** Multiplicador de resolução. Default: devicePixelRatio, teto 3. */
  scale?: number;
};

/**
 * Nome de arquivo seguro: sem acento, sem espaço, sem barra.
 *
 * O Android rejeita/renomeia download com acento e espaço, e o arquivo chega
 * truncado no WhatsApp. Slugs ASCII evitam isso.
 */
export function nomeArquivo(base: string, ext = "png"): string {
  const slug = String(base || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "greenscore"}.${ext}`;
}

/** Resolução da captura, com teto: 3x já é o limite útil em celular. */
function escalaPadrao(): number {
  if (typeof window === "undefined") return 2;
  const dpr = window.devicePixelRatio;
  return Math.min(3, Math.max(1, Number.isFinite(dpr) && dpr > 0 ? dpr : 2));
}

/**
 * Desenha o elemento num canvas e devolve PNG em `Blob`.
 *
 * Espera `document.fonts.ready` antes de capturar: fonte ainda carregando
 * aparece como fallback na imagem (texto muda de largura e o card sai torto).
 */
export async function capturarCard(el: HTMLElement, opts: CapturarOpts = {}): Promise<Blob> {
  if (!el) throw new Error("Nada para capturar: o card não está na tela.");

  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const { default: html2canvas } = await import("html2canvas-pro");

  const canvas = await html2canvas(el, {
    scale: Math.min(3, Math.max(1, opts.scale ?? escalaPadrao())),
    backgroundColor: opts.backgroundColor ?? null,
    useCORS: true,
    allowTaint: false,
    logging: false,
    imageSmoothingQuality: "high",
    onclone: (doc: Document) => {
      for (const no of Array.from(doc.querySelectorAll<HTMLElement>(`[${ATRIBUTO_SEM_IMAGEM}]`))) {
        no.remove();
      }
      for (const no of Array.from(doc.querySelectorAll<HTMLElement>("*"))) {
        const s = no.style;
        s.animation = "none";
        s.transition = "none";
        s.backdropFilter = "none";
        if (s.position === "sticky" || s.position === "fixed") s.position = "static";
      }
    },
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("O navegador não conseguiu gerar a imagem.");
  return blob;
}

/** Download por `<a download>` — funciona em todo navegador, sem permissão. */
function baixar(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 10s dá tempo do download começar e evita vazar o blob na memória.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copia a imagem para a área de transferência (desktop, contexto seguro). */
async function copiar(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}

export type ResultadoCompartilhar = "compartilhado" | "baixado" | "copiado";

/**
 * Compartilha o PNG: Web Share (celular) → download → cópia.
 *
 * No celular abre a folha nativa (WhatsApp, Telegram, Instagram). Se o
 * usuário cancelar a folha, o `AbortError` sobe — cancelar não é erro e quem
 * chama decide o que mostrar.
 */
export async function compartilharOuBaixar(blob: Blob, fileName: string): Promise<ResultadoCompartilhar> {
  const file = new File([blob], fileName, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };

  if (typeof navigator.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "GreenScore" });
      return "compartilhado";
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      // Qualquer outra falha do share nativo cai para download.
    }
  }

  try {
    baixar(blob, fileName);
    return "baixado";
  } catch {
    if (await copiar(blob)) return "copiado";
    throw new Error("Não foi possível compartilhar nem baixar a imagem.");
  }
}
