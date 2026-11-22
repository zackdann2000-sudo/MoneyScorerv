/**
 * Zonas de classificação (Gap G1 — pintura da tabela).
 *
 * Por que isto é um módulo e não um `if` na UI:
 *   - a zona é REGRA DA COMPETIÇÃO, não layout. Muda por país e por temporada;
 *   - a UI precisa saber "por que a linha 5 é azul" e a legenda precisa do
 *     rótulo exato ("Pré-Champions", "Playoff de acesso");
 *   - testar faixas num arquivo puro é barato; testar cor de `<tr>` não é.
 *
 * Nada aqui faz I/O. A entrada é o código do fornecedor (Football-Data ou ESPN)
 * ou, na falta dele, o nome/slug da liga — igual ao `resolverLigaId`.
 *
 * Regra de ouro: **sem certeza, não pinta**. Liga fora do mapa e com menos de
 * 10 times não recebe zona nenhuma. Zona errada é pior que zona ausente.
 */

export type TipoZona =
  | "champions"
  | "libertadores"
  | "europa"
  | "conference"
  | "acesso"
  | "playoff"
  | "rebaixamento"
  | "eliminado";

export type Zona = {
  tipo: TipoZona;
  /** Primeira posição da faixa, 1-based e inclusiva. */
  de: number;
  /** Última posição da faixa, inclusiva. */
  ate: number;
  rotulo: string;
};

export type EntradaZona = {
  /** Código Football-Data ("BSA") ou ESPN ("bra.1"). */
  codigo?: string | null;
  nome: string;
  slug?: string | null;
  /** Fase da tabela: "Group A", "Regular Season", "". */
  fase?: string | null;
  totalTimes: number;
  /** Copa pura (mata-mata) não tem zona de tabela. */
  isCup?: boolean;
};

/** ESPN -> Football-Data. Espelha `lib/providers.ts` sem importar rede. */
const ALIAS_ESPN: Record<string, string> = {
  "bra.1": "BSA",
  "eng.1": "PL",
  "esp.1": "PD",
  "ita.1": "SA",
  "ger.1": "BL1",
  "fra.1": "FL1",
  "por.1": "PPL",
  "ned.1": "DED",
  "eng.2": "ELC",
  "uefa.champions": "CL",
};

/**
 * Faixas por competição, em ordem de exibição na legenda.
 *
 * Temporada 2025/26 como referência. Onde o número de vagas é instável
 * (França, Portugal, Holanda) a faixa é a conservadora: só o que é direto.
 */
const REGRAS: Record<string, Zona[]> = {
  // 20 times · 4 UCL · 5 UEL · 6 UECL · 18-20 caem
  PL: [
    { tipo: "champions", de: 1, ate: 4, rotulo: "Champions League" },
    { tipo: "europa", de: 5, ate: 5, rotulo: "Europa League" },
    { tipo: "conference", de: 6, ate: 6, rotulo: "Conference League" },
    { tipo: "rebaixamento", de: 18, ate: 20, rotulo: "Rebaixamento" },
  ],
  PD: [
    { tipo: "champions", de: 1, ate: 4, rotulo: "Champions League" },
    { tipo: "europa", de: 5, ate: 6, rotulo: "Europa League" },
    { tipo: "conference", de: 7, ate: 7, rotulo: "Conference League" },
    { tipo: "rebaixamento", de: 18, ate: 20, rotulo: "Rebaixamento" },
  ],
  SA: [
    { tipo: "champions", de: 1, ate: 4, rotulo: "Champions League" },
    { tipo: "europa", de: 5, ate: 6, rotulo: "Europa League" },
    { tipo: "conference", de: 7, ate: 7, rotulo: "Conference League" },
    { tipo: "rebaixamento", de: 18, ate: 20, rotulo: "Rebaixamento" },
  ],
  // 18 times · 16 = playoff de permanência
  BL1: [
    { tipo: "champions", de: 1, ate: 4, rotulo: "Champions League" },
    { tipo: "europa", de: 5, ate: 5, rotulo: "Europa League" },
    { tipo: "conference", de: 6, ate: 6, rotulo: "Conference League" },
    { tipo: "playoff", de: 16, ate: 16, rotulo: "Playoff de permanência" },
    { tipo: "rebaixamento", de: 17, ate: 18, rotulo: "Rebaixamento" },
  ],
  FL1: [
    { tipo: "champions", de: 1, ate: 3, rotulo: "Champions League" },
    { tipo: "playoff", de: 4, ate: 4, rotulo: "Pré-Champions" },
    { tipo: "europa", de: 5, ate: 5, rotulo: "Europa League" },
    { tipo: "conference", de: 6, ate: 6, rotulo: "Conference League" },
    { tipo: "playoff", de: 16, ate: 16, rotulo: "Playoff de permanência" },
    { tipo: "rebaixamento", de: 17, ate: 18, rotulo: "Rebaixamento" },
  ],
  PPL: [
    { tipo: "champions", de: 1, ate: 2, rotulo: "Champions League" },
    { tipo: "playoff", de: 3, ate: 3, rotulo: "Pré-Champions" },
    { tipo: "europa", de: 4, ate: 4, rotulo: "Europa League" },
    { tipo: "conference", de: 5, ate: 5, rotulo: "Conference League" },
    { tipo: "rebaixamento", de: 17, ate: 18, rotulo: "Rebaixamento" },
  ],
  DED: [
    { tipo: "champions", de: 1, ate: 2, rotulo: "Champions League" },
    { tipo: "europa", de: 3, ate: 4, rotulo: "Europa League" },
    { tipo: "playoff", de: 5, ate: 8, rotulo: "Playoff europeu" },
    { tipo: "rebaixamento", de: 17, ate: 18, rotulo: "Rebaixamento" },
  ],
  // Brasileirão: topo é Libertadores, não Champions. A cor é a mesma de
  // "vaga continental"; o rótulo tem de ser o certo.
  BSA: [
    { tipo: "libertadores", de: 1, ate: 4, rotulo: "Libertadores" },
    { tipo: "playoff", de: 5, ate: 8, rotulo: "Pré-Libertadores / Sul-Americana" },
    { tipo: "rebaixamento", de: 17, ate: 20, rotulo: "Rebaixamento" },
  ],
  // 24 times · 2 sobem direto · 3 a 6 = playoff · 22 a 24 caem
  ELC: [
    { tipo: "acesso", de: 1, ate: 2, rotulo: "Acesso à Premier League" },
    { tipo: "playoff", de: 3, ate: 6, rotulo: "Playoff de acesso" },
    { tipo: "rebaixamento", de: 22, ate: 24, rotulo: "Rebaixamento" },
  ],
  // Formato de liga (36 times): 1-8 vão direto às oitavas, 9-24 ao playoff
  CL: [
    { tipo: "champions", de: 1, ate: 8, rotulo: "Oitavas diretas" },
    { tipo: "playoff", de: 9, ate: 24, rotulo: "Playoff de acesso" },
    { tipo: "eliminado", de: 25, ate: 36, rotulo: "Eliminado" },
  ],
};

/** Código canônico (FD) a partir do que a URL/tela mandou. */
export function codigoCanonico(entrada: string): string {
  const bruto = entrada.trim();
  const alias = ALIAS_ESPN[bruto.toLowerCase()];
  return (alias ?? bruto).toUpperCase();
}

/** Só as faixas que fazem sentido para o tamanho REAL da tabela. */
function recortar(zonas: Zona[], totalTimes: number): Zona[] {
  return zonas
    .map((z) => ({ ...z, ate: Math.min(z.ate, totalTimes) }))
    .filter((z) => z.de >= 1 && z.de <= z.ate && z.de <= totalTimes);
}

/** Fase de grupos: só o que classifica importa; o resto não pinta. */
function zonasDeGrupo(totalTimes: number): Zona[] {
  if (totalTimes < 3) return [];
  return [{ tipo: "champions", de: 1, ate: Math.min(2, totalTimes), rotulo: "Classificado" }];
}

function resolverPorNome(entrada: EntradaZona): string | null {
  // `slug` vem prefixado de origem ("footballdata-premier-league"); o nome
  // normalizado basta e é o que sobra quando não há `codigo`.
  const base = `${entrada.nome} ${entrada.slug ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/champions league|liga dos campeoes/.test(base) && !/conference/.test(base)) return "CL";
  if (/championship/.test(base)) return "ELC";
  if (/campeonato brasileiro|brasileirao|brasileiro serie a/.test(base)) return "BSA";
  if (/premier league/.test(base)) return "PL";
  if (/primeira liga|liga portugal/.test(base)) return "PPL";
  if (/eredivisie/.test(base)) return "DED";
  if (/bundesliga/.test(base)) return "BL1";
  if (/ligue 1/.test(base)) return "FL1";
  if (/serie a/.test(base)) {
    // "Serie A" da Itália vs "Brasileiro Serie A" (já tratado acima).
    if (/brasil/.test(base)) return "BSA";
    return /italia|italy|ita/.test(base) || !/brasil/.test(base) ? "SA" : null;
  }
  if (/laliga|la liga|primera division|liga espanhola/.test(base)) return "PD";
  return null;
}

/**
 * Faixas coloridas de uma tabela.
 *
 * `codigo` vence o nome. Sem código e sem nome reconhecido, cai no genérico:
 * top 4 verde + últimas 3 vermelho, e SÓ para tabelas com 10+ times.
 */
export function zonasDaLiga(entrada: EntradaZona): Zona[] {
  const total = entrada.totalTimes;
  if (total < 3) return [];
  if (entrada.isCup) return [];

  if (entrada.fase && /group|grupo/i.test(entrada.fase)) return zonasDeGrupo(total);

  const codigo = entrada.codigo ? codigoCanonico(entrada.codigo) : resolverPorNome(entrada);
  const regra = codigo ? REGRAS[codigo] : undefined;
  if (regra) return recortar(regra, total);

  if (total < 10) return [];
  const quedas = total >= 16 ? 3 : 2;
  return recortar(
    [
      { tipo: "champions", de: 1, ate: 4, rotulo: "Zona de acesso continental" },
      { tipo: "rebaixamento", de: total - quedas + 1, ate: total, rotulo: "Rebaixamento" },
    ],
    total,
  );
}

/** Qual zona cobre a posição (a primeira que casar vence). */
export function zonaDaPosicao(zonas: Zona[], posicao: number): Zona | null {
  for (const z of zonas) {
    if (posicao >= z.de && posicao <= z.ate) return z;
  }
  return null;
}

export type TomZona = {
  /** Texto do rótulo na legenda. */
  rotulo: string;
  /** Faixa na tabela, já formatada ("1º ao 4º"). */
  faixa: string;
  /** Barra lateral colorida. */
  barra: string;
  /** Fundo leve da linha. */
  fundo: string;
  /** Cor do texto da posição. */
  texto: string;
  /** Chip da legenda. */
  chip: string;
};

/**
 * Cores por tipo de zona.
 *
 * Champions/Libertadores = verde neon (`acc`). Rebaixamento/eliminado =
 * vermelho (`danger`). Europa/Conference = azul/roxo, para a faixa do meio não
 * competir visualmente com o topo.
 */
const TONS: Record<TipoZona, Omit<TomZona, "rotulo" | "faixa">> = {
  champions: {
    barra: "bg-acc shadow-[0_0_10px_0_var(--acc)]",
    fundo: "bg-acc/[0.08]",
    texto: "text-acc",
    chip: "bg-acc/15 text-acc border-acc/50",
  },
  libertadores: {
    barra: "bg-acc shadow-[0_0_10px_0_var(--acc)]",
    fundo: "bg-acc/[0.08]",
    texto: "text-acc",
    chip: "bg-acc/15 text-acc border-acc/50",
  },
  acesso: {
    barra: "bg-acc shadow-[0_0_10px_0_var(--acc)]",
    fundo: "bg-acc/[0.08]",
    texto: "text-acc",
    chip: "bg-acc/15 text-acc border-acc/50",
  },
  europa: {
    barra: "bg-home",
    fundo: "bg-home/[0.06]",
    texto: "text-home",
    chip: "bg-home/15 text-home border-home/50",
  },
  conference: {
    barra: "bg-purple",
    fundo: "bg-purple/[0.06]",
    texto: "text-purple",
    chip: "bg-purple/15 text-purple border-purple/50",
  },
  playoff: {
    barra: "bg-warn",
    fundo: "bg-warn/[0.06]",
    texto: "text-warn",
    chip: "bg-warn/15 text-warn border-warn/50",
  },
  rebaixamento: {
    barra: "bg-danger",
    fundo: "bg-danger/[0.08]",
    texto: "text-danger",
    chip: "bg-danger/15 text-danger border-danger/50",
  },
  eliminado: {
    barra: "bg-danger/60",
    fundo: "bg-danger/[0.04]",
    texto: "text-danger",
    chip: "bg-danger/10 text-danger border-danger/30",
  },
};

export function tomDaZona(zona: Zona): TomZona {
  const faixa = zona.de === zona.ate ? `${zona.de}º` : `${zona.de}º ao ${zona.ate}º`;
  return { ...TONS[zona.tipo], rotulo: zona.rotulo, faixa };
}

/**
 * Forma do Football-Data usa W/D/L; a tela fala V/E/D.
 *
 * A detecção de formato é obrigatória: no vocabulário inglês `D` é EMPATE
 * (draw), no português `D` é DERROTA. Converter no escuro pinta derrota de
 * amarelo — por isso quem tem `W` ou `L` é tratado como inglês.
 */
export function formaParaVed(form: string | null | undefined): string[] {
  if (!form) return [];
  const letras = form.toUpperCase().split("").filter((c) => "WDLVED".includes(c));
  const ingles = letras.some((c) => c === "W" || c === "L");
  const ved = ingles
    ? letras.map((c) => (c === "W" ? "V" : c === "D" ? "E" : "D"))
    : letras.map((c) => (c === "V" || c === "E" || c === "D" ? c : ""));
  return ved.filter(Boolean).slice(-5);
}
