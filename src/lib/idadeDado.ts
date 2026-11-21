/**
 * Idade de um dado servido pela API — quanto tempo passou desde que ele foi
 * gerado. Módulo PURO (sem next, sem db, sem fetch) para poder ser testado em
 * `idadeDado.test.cjs` e usado em qualquer camada.
 *
 * Por que isto existe: o apitou/kingstats vêm de fontes que não avisam quando
 * param. O cache serve o último payload bom (stale-while-revalidate), então o
 * app continua funcionando — e mentindo, se a tela não disser que o dado é de
 * ontem. Nunca esconder a idade do dado: é a diferença entre um app degradado
 * e um app que engana o usuário.
 *
 * Faixas (o limiar é de produto, não técnico):
 *   atual  — até 60 min: o sync está de pé
 *   velho  — 1h a 24h: atrasado, mas ainda é "hoje"
 *   parado — 24h ou mais: a fonte provavelmente caiu; precisa de aviso na tela
 */

export const LIMIAR_VELHO_MS = 60 * 60 * 1000; // 1h
export const LIMIAR_PARADO_MS = 24 * 60 * 60 * 1000; // 24h

export type FaixaIdade = "atual" | "velho" | "parado";

export type IdadeDado = {
  /** Idade em ms (nunca negativa; relógio adiantado é tratado como "agora"). */
  ms: number;
  minutos: number;
  horas: number;
  /** Texto curto para o rodapé: "agora", "há 12 min", "há 5h", "há 3 dias". */
  rotulo: string;
  faixa: FaixaIdade;
  /** Data do dado no fuso de Brasília, "DD/MM". */
  dia: string;
  /** Texto do aviso quando a faixa é "parado"; null nas outras faixas. */
  aviso: string | null;
};

/** "DD/MM" da data no fuso de Brasília (o site trabalha em UTC-3). */
function diaBrasilia(d: Date): string {
  // en-CA devolve YYYY-MM-DD, que é fácil de fatiar e já vem no fuso pedido.
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [, m, dia] = ymd.split("-");
  return `${dia}/${m}`;
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Calcula a idade a partir de uma data ISO (string) ou epoch ms.
 *
 * Devolve `null` quando não há data ou ela é inválida — nesse caso a UI não
 * mostra nada, em vez de inventar frescor.
 *
 * `agora` é injetável para o teste não depender do relógio.
 */
export function idadeDoDado(entrada: string | number | null | undefined, agora = Date.now()): IdadeDado | null {
  if (entrada == null || entrada === "") return null;

  let quando: number;
  if (typeof entrada === "number") {
    quando = entrada;
  } else {
    // O geradoEm do apitou vem com microssegundos ("...T07:48:08.253389-03:00").
    // O parsing do V8 trunca os dígitos extras, mas se algum formato novo
    // escapar do ISO, cai no fallback abaixo em vez de virar NaN.
    quando = new Date(entrada).getTime();
  }
  if (!Number.isFinite(quando)) return null;

  // Relógio do servidor atrás do cliente geraria idade negativa: trata como 0.
  const ms = Math.max(0, agora - quando);
  const minutos = Math.floor(ms / 60000);
  const horas = Math.floor(ms / 3600000);
  const dias = Math.floor(ms / 86400000);

  let rotulo: string;
  if (ms < 60000) rotulo = "agora";
  else if (minutos < 60) rotulo = `há ${plural(minutos, "min", "min")}`;
  else if (horas < 24) rotulo = `há ${horas}h`;
  else rotulo = `há ${plural(dias, "dia", "dias")}`;

  const faixa: FaixaIdade = ms >= LIMIAR_PARADO_MS ? "parado" : ms >= LIMIAR_VELHO_MS ? "velho" : "atual";

  const dia = diaBrasilia(new Date(quando));

  return {
    ms,
    minutos,
    horas,
    rotulo,
    faixa,
    dia,
    aviso:
      faixa === "parado"
        ? `Dados de ${dia}. A sincronização está parada — este conteúdo pode estar desatualizado.`
        : null,
  };
}
