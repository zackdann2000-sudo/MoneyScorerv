/* =======================================================================
   SportMonks — PARSE do comparativo do time com split de 1º/2º tempo.
   -----------------------------------------------------------------------
   Camada pura (sem rede, sem banco): recebe o JSON do fixture já buscado e
   devolve `TeamStatMetric[]` no mesmo formato de `afTeamStats`, para a UI não
   precisar saber de qual fonte veio o número.

   Por que `periods.statistics` e não `current_half`: a API v3 NÃO tem o
   parâmetro `current_half`. O recorte por tempo é um include:
     - `statistics`            → acumulado do jogo (o "Total");
     - `periods[type_id=1]`    → 1º tempo;
     - `periods[type_id=2]`    → 2º tempo   (3+ = prorrogação/pênaltis: ignora).
   Os gols por tempo vêm de `scores`: `type_id` 1 = 1ST_HALF e 48996 =
   2ND_HALF_ONLY. Quando só o cumulativo (`type_id` 2) existe, o 2º tempo é
   `2 - 1`. Nada é estimado: métrica que a fonte não publicou fica fora da
   lista, e um lado ausente vira 0 só quando o outro lado tem valor (o jogo
   aconteceu e aquele time não marcou/fez nada naquele período).
   ======================================================================= */

export type MetricaTempo = {
  key: string;
  label: string;
  home: number;
  away: number;
  percent?: boolean;
};

export type SplitTempos = {
  metrics: MetricaTempo[];
  primeiroTempo: MetricaTempo[];
  segundoTempo: MetricaTempo[];
  finalizada: boolean;
};

/**
 * Nome da estatística do SportMonks → chave/label daqui.
 * `keys` são comparadas já normalizadas (só letras minúsculas), então
 * "Ball Possession", "ball_possession" e "BallPossession" batem igual.
 */
export const SM_TEAM_METRICS: { keys: string[]; key: string; label: string; percent?: boolean }[] = [
  { keys: ["ballpossession", "possession"], key: "ball_possession", label: "Posse de bola", percent: true },
  { keys: ["expectedgoals", "xg", "expectedgoalsxg"], key: "expected_goals", label: "xG (gols esperados)" },
  { keys: ["goals", "goalscorer"], key: "goals", label: "Gols" },
  { keys: ["shotstotal", "totalshots", "shots"], key: "total_shots", label: "Finalizações" },
  {
    keys: ["shotsontarget", "shotsongoal", "shotsontargettotal"],
    key: "shots_on_goal",
    label: "Finalizações no gol",
  },
  { keys: ["corners", "cornerkicks", "cornertotal"], key: "corner_kicks", label: "Escanteios" },
  { keys: ["fouls"], key: "fouls", label: "Faltas" },
  { keys: ["offsides"], key: "offsides", label: "Impedimentos" },
  { keys: ["yellowcards"], key: "yellow_cards", label: "Cartões amarelos" },
  { keys: ["redcards"], key: "red_cards", label: "Cartões vermelhos" },
  {
    keys: ["saves", "goalkeepersaves", "savesstotal"],
    key: "goalkeeper_saves",
    label: "Defesas do goleiro",
  },
  { keys: ["passes", "totalpasses", "passestotal"], key: "total_passes", label: "Passes" },
];

/**
 * Diz se dois nomes de time são o mesmo, já normalizados.
 * Cobre "Palmeiras" x "SE Palmeiras" e "Chapecoense" x "Associação
 * Chapecoense de Futebol" (um contém o outro). Para apelido curto
 * ("Vasco" x "Vasco da Gama" já cai no contém), compara o prefixo quando os
 * dois nomes têm pelo menos 6 letras.
 */
export function nomesCompativeis(a: string, b: string): boolean {
  const x = chaveStatSM(a);
  const y = chaveStatSM(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const min = Math.min(x.length, y.length);
  return min >= 6 && x.slice(0, 6) === y.slice(0, 6);
}

/** Normaliza nome de estatística/time: "Ball Possession" → "ballpossession". */
export function chaveStatSM(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

/** Valor numérico: aceita 54, "54", "54%", "1 234". null quando não é número. */
export function valorStatSM(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace(/%/g, "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** participant_id → "home" | "away" (o mando vem de `meta.location`). */
export function mapaDeLado(participants: any[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const p of participants || []) {
    const loc = String(p?.meta?.location ?? "").toLowerCase();
    if (loc === "home" || loc === "away") map.set(Number(p?.id), loc);
  }
  return map;
}

/**
 * Converte um array de estatísticas do SportMonks em métricas comparativas.
 * Um período pode repetir o mesmo tipo: os valores são somados (é o total
 * daquele período para aquele lado).
 */
export function smMetricas(
  estatisticas: any[],
  locPorParticipante: Map<number, string>,
): MetricaTempo[] {
  const porLado = new Map<string, Map<string, number>>();
  for (const s of estatisticas || []) {
    const lado = locPorParticipante.get(Number(s?.participant_id));
    if (!lado) continue;
    const chave = chaveStatSM(s?.type?.developer_name ?? s?.type?.name ?? "");
    if (!chave) continue;
    const valor = valorStatSM(s?.data?.value);
    if (valor == null) continue;
    if (!porLado.has(lado)) porLado.set(lado, new Map());
    const mapa = porLado.get(lado)!;
    mapa.set(chave, (mapa.get(chave) || 0) + valor);
  }

  const metricas: MetricaTempo[] = [];
  for (const def of SM_TEAM_METRICS) {
    let home: number | undefined;
    let away: number | undefined;
    for (const k of def.keys) {
      const h = porLado.get("home")?.get(k);
      const a = porLado.get("away")?.get(k);
      if (h != null || a != null) {
        home = h;
        away = a;
        break;
      }
    }
    /* Nenhum dos dois lados publicou: fora da lista (nunca 0 inventado). */
    if (home == null && away == null) continue;
    metricas.push({
      key: def.key,
      label: def.label,
      home: home ?? 0,
      away: away ?? 0,
      percent: def.percent,
    });
  }
  return metricas;
}

/** Gols por tempo a partir de `include=scores`. */
export function smGolsPorTempo(
  scores: any[],
  locPorParticipante: Map<number, string>,
): { primeiroTempo: MetricaTempo | null; segundoTempo: MetricaTempo | null } {
  const ler = (participante: number, tipos: number[]): number | null => {
    const linha = (scores || []).find(
      (s) => Number(s?.participant_id) === participante && tipos.includes(Number(s?.type_id)),
    );
    if (linha?.score?.goals == null) return null;
    const n = Number(linha.score.goals);
    return Number.isFinite(n) ? n : null;
  };

  const ids = [...locPorParticipante.keys()];
  const hId = ids.find((i) => locPorParticipante.get(i) === "home");
  const aId = ids.find((i) => locPorParticipante.get(i) === "away");
  if (hId == null || aId == null) return { primeiroTempo: null, segundoTempo: null };

  const g1h = ler(hId, [1]);
  const g1a = ler(aId, [1]);
  const primeiroTempo: MetricaTempo | null =
    g1h == null && g1a == null
      ? null
      : { key: "goals", label: "Gols", home: g1h ?? 0, away: g1a ?? 0 };

  /* 2º tempo: valor direto (48996) ou diferença do cumulativo (2 - 1). */
  const so2h = (participante: number): number | null => {
    const direto = ler(participante, [48996]);
    if (direto != null) return direto;
    const acumulado = ler(participante, [2]);
    if (acumulado == null) return null;
    return acumulado - (ler(participante, [1]) ?? 0);
  };
  const g2h = so2h(hId);
  const g2a = so2h(aId);
  const segundoTempo: MetricaTempo | null =
    g2h == null && g2a == null
      ? null
      : { key: "goals", label: "Gols", home: g2h ?? 0, away: g2a ?? 0 };

  return { primeiroTempo, segundoTempo };
}

/** Coloca os gols na frente, sem duplicar se a fonte já publicou a métrica. */
function comGols(lista: MetricaTempo[], gol: MetricaTempo | null): MetricaTempo[] {
  if (!gol) return lista;
  return [gol, ...lista.filter((m) => m.key !== "goals")];
}

/** Estatísticas de um período (`type_id` 1 = 1º tempo, 2 = 2º tempo). */
export function periodo(
  periods: any[],
  tipo: number,
): any[] {
  return (periods || []).find((p) => Number(p?.type_id) === tipo)?.statistics || [];
}

/** true quando o estado do fixture indica jogo encerrado. */
export function fixtureFinalizada(fixture: any): boolean {
  const estado = String(fixture?.state?.state ?? "").toLowerCase();
  if (["ft", "finished", "aet", "ft_pen"].includes(estado)) return true;
  return Number(fixture?.state_id) === 5;
}

/**
 * true quando a fonte diz explicitamente que o jogo não começou.
 * Só os nomes conhecidos contam: estado ausente NÃO é tratado como agendado
 * (senão o split de um jogo em andamento sumiria por falta de campo).
 */
export function fixtureAgendada(fixture: any): boolean {
  const estado = String(fixture?.state?.state ?? "").toLowerCase().replace(/[^a-z]/g, "");
  return ["ns", "notstarted", "scheduled", "pending"].includes(estado);
}

/** Ponto de entrada: fixture cru do SportMonks → total + 1º/2º tempo. */
export function splitDoFixture(fixture: any): SplitTempos {
  const vazio: SplitTempos = { metrics: [], primeiroTempo: [], segundoTempo: [], finalizada: false };
  if (!fixture) return vazio;

  const lado = mapaDeLado(fixture?.participants || []);
  const metrics = smMetricas(fixture?.statistics || [], lado);
  const periods: any[] = fixture?.periods || [];

  const primeiroTempo = smMetricas(periodo(periods, 1), lado);
  const segundoTempo = smMetricas(periodo(periods, 2), lado);

  /* Placar do intervalo só existe depois da bola rolar — em jogo agendado o
     `scores` vem 0-0 e viraria um "1º tempo 0-0" falso. */
  const gols = fixtureAgendada(fixture)
    ? { primeiroTempo: null, segundoTempo: null }
    : smGolsPorTempo(fixture?.scores || [], lado);

  return {
    metrics,
    primeiroTempo: comGols(primeiroTempo, gols.primeiroTempo),
    segundoTempo: comGols(segundoTempo, gols.segundoTempo),
    finalizada: fixtureFinalizada(fixture),
  };
}
