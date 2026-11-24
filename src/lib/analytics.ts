/**
 * Eventos de funil (GA4) — sem dependência externa.
 *
 * Regra de ouro: **nada aqui pode quebrar a página**. Sem `NEXT_PUBLIC_GA_ID`
 * carregado (bloqueador de anúncio, GA desligado, SSR), `track` simplesmente
 * devolve `false`. Todos os erros são engolidos de propósito: analytics é
 * observabilidade, não requisito para o usuário concluir o cadastro.
 *
 * Nomes seguem a convenção recomendada pelo GA4 para funil de assinatura:
 *   sign_up             → cadastro concluído
 *   begin_checkout      → clique em "Assinar VIP"
 *   purchase            → voltou do Stripe com pagamento confirmado
 *   page_view (manual)  → navegação interna do App Router
 */

export type EventoFunil =
  | "sign_up"
  | "begin_checkout"
  | "purchase"
  | "page_view"
  | "login"
  | "generate_analysis"
  | "combo_build"
  | "alert_optin";

type Parametros = Record<string, unknown>;

/** gtag tipado de forma frouxa: se não existir, não faz nada. */
type Gtag = (comando: string, nome: string, params?: Parametros) => void;

function gtag(): Gtag | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { gtag?: unknown }).gtag;
  return typeof g === "function" ? (g as Gtag) : null;
}

/**
 * Dispara um evento. Devolve `true` só quando o GA realmente recebeu — útil
 * para debug no console e para testes.
 */
export function track(nome: EventoFunil, params: Parametros = {}): boolean {
  const g = gtag();
  if (!g) return false;
  try {
    g("event", nome, params);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dispara o evento no MÁXIMO uma vez por chave (guardado em sessionStorage).
 *
 * Necessário porque a tela de sucesso do Stripe é reabrível: sem isso, cada
 * refresh contaria uma "compra" nova e o funil mentiria para cima.
 */
export function trackOnce(nome: EventoFunil, chave: string, params: Parametros = {}): boolean {
  if (typeof window === "undefined") return false;
  const store = (() => {
    try {
      return window.sessionStorage;
    } catch {
      return null; // Safari em modo privado pode lançar
    }
  })();
  const id = `gs_evt_${chave}`;
  if (store) {
    try {
      if (store.getItem(id)) return false;
      store.setItem(id, "1");
    } catch {
      /* sem storage: cai no disparo normal, duplicar é menos ruim que perder */
    }
  }
  return track(nome, params);
}

/** true quando o GA está carregado nesta página. */
export function analiticaAtiva(): boolean {
  return gtag() !== null;
}
