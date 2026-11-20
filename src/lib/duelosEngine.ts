/**
 * Duelos — Confronto Direto jogador × jogador (S09 do recon do ClearEdge).
 *
 * Núcleo puro: recebe as amostras que o motor de Props já montou e cruza
 * "ameaça ofensiva" de um lado com "resistência" do outro. Nada de rede, nada
 * de banco — dá para testar sem tocar em API.
 */
import {
  type JogadorAmostra,
  type StatKey,
  mediaPonderada,
  pesosRecencia,
  calcularProp,
  MERCADOS,
  MIN_AMOSTRA,
} from "./playerPropsEngine";

export type Papel = "ameaca" | "muralha";

export type LadoDuelo = {
  nome: string;
  time: string;
  posicao: string;
  /** Média ponderada da métrica principal do papel (por jogo). */
  media: number;
  amostra: number;
};

export type Duelo = {
  chave: string;
  /** Quem ataca e quem defende (papéis, não "melhor/pior"). */
  ameaca: LadoDuelo;
  muralha: LadoDuelo;
  /** 0..100 — quanto o atacante domina o confronto. */
  dominancia: number;
  /** Probabilidade de o atacante dar ≥1 chute no gol (motor Poisson). */
  probChuteNoGol: number | null;
  /** Frase pronta de leitura do duelo. */
  leitura: string;
};

/** Métricas que definem cada papel (peso). */
const PESO_AMEACA: Partial<Record<StatKey, number>> = {
  finalizacoes: 0.5,
  chutesNoGol: 0.3,
  gols: 0.2,
};

const PESO_MURALHA: Partial<Record<StatKey, number>> = {
  faltasCometidas: 0.6,
  cartoes: 0.25,
  faltasSofridas: 0.15,
};

/** Amostra mínima do confronto. A API-Football às vezes só entrega 2 jogos por
 *  jogador; nesse caso a tela roda em "modo curto" e avisa. */
export const MIN_AMOSTRA_DUELO = 2;

/** Média ponderada por recência de uma estatística (null quando não há dado). */
export function mediaDe(
  jogador: JogadorAmostra,
  stat: StatKey,
  minAmostra: number = MIN_AMOSTRA,
): { media: number; amostra: number } | null {
  const valores = jogador.jogos.map((j) => j[stat] ?? null);
  const media = mediaPonderada(valores, pesosRecencia(valores.length));
  const amostra = valores.filter((v): v is number => v != null && Number.isFinite(v)).length;
  if (media == null || amostra < minAmostra) return null;
  return { media, amostra };
}

/** Índice composto de um jogador para um papel (0 = sem dado). */
export function indiceDoPapel(
  jogador: JogadorAmostra,
  papel: Papel,
  minAmostra: number = MIN_AMOSTRA,
): { valor: number; amostra: number } | null {
  const pesos = papel === "ameaca" ? PESO_AMEACA : PESO_MURALHA;
  let soma = 0;
  let pesoUsado = 0;
  let amostraMin = Infinity;

  for (const [stat, peso] of Object.entries(pesos) as [StatKey, number][]) {
    const m = mediaDe(jogador, stat, minAmostra);
    if (!m) continue;
    soma += m.media * peso;
    pesoUsado += peso;
    amostraMin = Math.min(amostraMin, m.amostra);
  }

  if (!pesoUsado) return null;
  return { valor: +(soma / pesoUsado).toFixed(3), amostra: amostraMin === Infinity ? 0 : amostraMin };
}

const pct = (v: number) => Math.round(v * 100);

/**
 * Monta os duelos de uma partida.
 * Cada atacante de um lado é cruzado com cada "muralha" do outro; devolvemos os
 * `limite` confrontos de maior dominância, sem repetir o mesmo jogador duas vezes.
 */
export function montarDuelos(
  jogadores: JogadorAmostra[],
  opts: { limite?: number; minAmostra?: number } = {},
): Duelo[] {
  const limite = opts.limite ?? 6;
  const minAmostra = opts.minAmostra ?? MIN_AMOSTRA;
  const casa = jogadores.filter((j) => j.lado === "home");
  const fora = jogadores.filter((j) => j.lado === "away");

  const candidatos: { d: Duelo; perfil: boolean }[] = [];

  const cruzar = (ataque: JogadorAmostra[], defesa: JogadorAmostra[]) => {
    for (const a of ataque) {
      const ia = indiceDoPapel(a, "ameaca", minAmostra);
      if (!ia || ia.valor <= 0) continue;
      const aDef = indiceDoPapel(a, "muralha", minAmostra)?.valor ?? 0;
      for (const d of defesa) {
        const id = indiceDoPapel(d, "muralha", minAmostra);
        if (!id || id.valor <= 0) continue;
        const dAtk = indiceDoPapel(d, "ameaca", minAmostra)?.valor ?? 0;

        const dominancia = pct(ia.valor / (ia.valor + id.valor));
        const chutes = MERCADOS.find((m) => m.id === "chutes_no_gol");
        const prop = chutes ? calcularProp(a, chutes) : null;

        candidatos.push({
          /* Perfil claro = quem ataca produz mais ataque do que falta, e quem
             defende comete mais falta do que finaliza. Assim o confronto não
             vira zagueiro contra meia. */
          perfil: ia.valor > aDef && id.valor > dAtk,
          d: {
            chave: `${a.id}__${d.id}`,
            ameaca: { nome: a.nome, time: a.time, posicao: a.posicao, media: ia.valor, amostra: ia.amostra },
            muralha: { nome: d.nome, time: d.time, posicao: d.posicao, media: id.valor, amostra: id.amostra },
            dominancia,
            probChuteNoGol: prop ? +prop.probOver.toFixed(3) : null,
            leitura: leitura(a.nome, ia.valor, d.nome, id.valor, dominancia, prop?.probOver ?? null),
          },
        });
      }
    }
  };

  cruzar(casa, fora);
  cruzar(fora, casa);

  /* 1) perfis claros primeiro; 2) entre eles, o confronto mais desequilibrado. */
  candidatos.sort(
    (x, y) =>
      Number(y.perfil) - Number(x.perfil) ||
      Math.abs(y.d.dominancia - 50) - Math.abs(x.d.dominancia - 50),
  );

  /* Sem repetir jogador: cada nome aparece uma vez só, para a tela não virar
     o mesmo atacante contra cinco defensores. */
  const usados = new Set<string>();
  const escolhidos: Duelo[] = [];
  for (const { d } of candidatos) {
    if (usados.has(d.ameaca.nome) || usados.has(d.muralha.nome)) continue;
    usados.add(d.ameaca.nome);
    usados.add(d.muralha.nome);
    escolhidos.push(d);
    if (escolhidos.length >= limite) break;
  }
  return escolhidos;
}

function leitura(
  nomeA: string,
  valorA: number,
  nomeD: string,
  valorD: number,
  dominancia: number,
  probChute: number | null,
): string {
  const ameacaTxt = `${nomeA} produz ${valorA.toFixed(2)}/jogo no ataque`;
  const muralhaTxt = `${nomeD} soma ${valorD.toFixed(2)}/jogo em faltas e cartões`;
  const chute = probChute == null ? "" : ` Chance de acertar o gol: ${pct(probChute)}%.`;

  if (dominancia >= 62) return `${ameacaTxt}, contra ${valorD.toFixed(2)} de resistência. O confronto pende para o atacante.${chute}`;
  if (dominancia <= 38) return `${muralhaTxt} — duelo de contato, o atacante tende a ser parado (${dominancia}% de dominância).${chute}`;
  return `${ameacaTxt}; ${muralhaTxt.replace(nomeD, nomeD)}. Duelo equilibrado (${dominancia}% para o atacante).${chute}`;
}
