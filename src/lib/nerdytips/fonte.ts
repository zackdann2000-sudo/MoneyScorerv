/**
 * Fonte de dados do NerdyTips (nerdytips.com).
 *
 * O site NÃO tem API pública de palpites: as páginas são renderizadas no
 * servidor (Laravel + Vite) e os palpites vêm no HTML. O único JSON aberto é
 * `/free-tips/live` (placar/estado dos jogos) e `/match-live/<id>`.
 *
 * Então a estratégia é: baixar a página com cara de navegador, extrair os
 * campos por classe/marcador estável (não por texto traduzido — o site tem 30
 * idiomas e o texto muda) e devolver um resumo pequeno para a nossa API.
 *
 * Tudo aqui é função pura sobre o HTML: nada de rede nos parsers, o que deixa
 * o teste rodar em cima de fixture salva.
 */

import { odd, oddCombinada, primeiroNumero } from "../utils/odds";

/** Reexporta para quem consome este módulo sem passar por `lib/utils`. */
export { odd };

export const BASE = "https://nerdytips.com";

const UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

/** Teto de tamanho: uma página do site tem ~130-290 KB; 2 MB é erro. */
const MAX_BYTES = 2 * 1024 * 1024;

export type Status = "won" | "lost" | "void" | "pending";

export type Pick = {
  /** Rótulo cru ("1", "U2.5", "Yes", "1X"). */
  rotulo: string;
  /** Versão em português. */
  texto: string;
  odd: number | null;
  /** Confiança 0-10 (o "trust" do site). */
  confianca: number | null;
  /** Barra de confiança (0-100). */
  pct: number | null;
  resultado: Status | null;
};

export type Jogo = {
  id: string;
  slug: string;
  /** Nome da competição ("Ligue 1", "Brasileirão"). */
  liga: string;
  /** País da competição ("Algeria", "France") — vem do cabeçalho do grupo. */
  pais: string;
  casa: string;
  fora: string;
  logos: [string | null, string | null];
  /** "FT", "HT", "45'" ou o horário "10:00". */
  hora: string;
  /** Horário de início como veio no `data-kick`. */
  kickoff: string;
  placar: { casa: number; fora: number } | null;
  status: Status;
  odds: { casa: number | null; empate: number | null; fora: number | null };
  pick1x2: Pick | null;
  pickGols: Pick | null;
  pickBtts: Pick | null;
  melhor: Pick | null;
  /** Descrição do melhor palpite, já em português. */
  melhorTexto: string | null;
  /** Placar exato sugerido (só nas páginas de correct score). */
  placarExato: string | null;
};

export type Board = {
  jogos: Jogo[];
  ligas: { nome: string; jogos: number }[];
  geradoEm: string;
};

/* ------------------------------------------------------------------ */
/* Helpers de texto                                                   */
/* ------------------------------------------------------------------ */

const ENTIDADES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  bull: "•",
  ndash: "–",
  mdash: "—",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  atilde: "ã",
  otilde: "õ",
  ccedil: "ç",
};

/** Decodifica entidades nomeadas e numéricas que o site usa no HTML. */
export function decodificar(s: string): string {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const cp = parseInt(h, 16);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : "";
    })
    .replace(/&#(\d+);/g, (_, d) => {
      const cp = parseInt(d, 10);
      return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : "";
    })
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[String(n).toLowerCase()] ?? m);
}

/** Remove tags, decodifica e normaliza espaços. */
export function texto(s: string): string {
  return decodificar(String(s || "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Primeiro número decimal de um trecho ("▲ 2.80" -> 2.8).
 *
 * A conversão de odd em si (decimal / americano / fracionário) mora em
 * `lib/utils/odds.ts`, porque vale para qualquer fonte — aqui só usamos o
 * extrator numérico para placares, percentuais e placares exatos.
 */
export function numero(s: string): number | null {
  return primeiroNumero(s);
}

/** Número de um atributo (`style="--pct:47%"` -> 47). */
function pctDe(bloco: string): number | null {
  const m = bloco.match(/--pct:\s*(\d+(?:\.\d+)?)%/);
  return m ? Number(m[1]) : null;
}

function statusDe(v: string | null | undefined): Status {
  const s = String(v || "").toLowerCase();
  if (s.includes("won")) return "won";
  if (s.includes("lost")) return "lost";
  if (s.includes("void") || s.includes("push")) return "void";
  return "pending";
}

/* ------------------------------------------------------------------ */
/* Tradução dos palpites                                              */
/* ------------------------------------------------------------------ */

const PICKS: Record<string, string> = {
  "1": "Casa",
  X: "Empate",
  "2": "Fora",
  "1X": "Casa ou empate",
  X2: "Empate ou fora",
  "12": "Casa ou fora",
  Yes: "Sim",
  No: "Não",
  AS: "Visitante marca",
  "AS2+": "Visitante faz 2+",
  H2: "Casa faz 2+",
  BTTS: "Ambas marcam",
  "BTTS YES": "Ambas marcam",
  "BTTS NO": "Ambas não marcam",
  YES: "Sim",
  NO: "Não",
};

/** "U2.5" -> "Menos de 2.5 gols". */
export function traduzirPick(rotulo: string): string {
  const r = String(rotulo || "").trim();
  if (!r) return "";
  const fixo = PICKS[r] ?? PICKS[r.toUpperCase()];
  if (fixo) return fixo;

  const m = r.match(/^([OU])\s*(\d+(?:\.\d+)?)$/i);
  if (m) {
    const linha = m[2].replace(".", ",");
    return m[1].toUpperCase() === "O" ? `Mais de ${linha} gols` : `Menos de ${linha} gols`;
  }
  const palavra = r.match(/^(Under|Over)\s+(\d+(?:\.\d+)?)$/i);
  if (palavra) {
    const mais = palavra[1].toLowerCase() === "over";
    return `${mais ? "Mais" : "Menos"} de ${palavra[2].replace(".", ",")} gols`;
  }
  // "X2 & Under 3.5" -> cada parte traduzida e unida.
  if (r.includes("&")) {
    return r
      .split("&")
      .map((t) => traduzirPick(t.trim()))
      .filter(Boolean)
      .join(" e ");
  }
  const score = r.match(/^(\d+)\s*[–-]\s*(\d+)$/);
  if (score) return `Placar ${score[1]}–${score[2]}`;
  return r;
}

/** Descrições do "best tip" que o site escreve por extenso. */
const DESCRICOES: Record<string, string> = {
  "maximum 2 total goals": "No máximo 2 gols na partida",
  "maximum 3 total goals": "No máximo 3 gols na partida",
  "at least 2 goals scored": "Pelo menos 2 gols na partida",
  "at least 3 goals scored": "Pelo menos 3 gols na partida",
  "home team wins": "Vitória do mandante",
  "away team wins": "Vitória do visitante",
  "home team wins or draw": "Mandante vence ou empata",
  "away team wins or draw": "Visitante vence ou empata",
  "away team scores": "Visitante marca",
  "away wins by at least 2 goals": "Visitante vence por 2+",
  "away team will score ≥2 goals": "Visitante marca 2+",
};

export function traduzirDescricao(desc: string | null | undefined): string | null {
  const d = String(desc || "").trim().toLowerCase();
  if (!d) return null;
  return DESCRICOES[d] ?? decodificar(desc ?? "").trim();
}

/* ------------------------------------------------------------------ */
/* Download                                                           */
/* ------------------------------------------------------------------ */

/** Baixa uma página do site com cara de navegador. */
export async function baixarHtml(caminho: string): Promise<string> {
  const url = caminho.startsWith("http") ? caminho : BASE + caminho;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
    });
    if (!res.ok) throw new Error(`nerdytips ${res.status} em ${url}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error(`nerdytips resposta grande demais (${buf.byteLength} bytes)`);
    return new TextDecoder("utf-8").decode(buf);
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------------------------------------------ */
/* Board de palpites                                                  */
/* ------------------------------------------------------------------ */

const RX_JOGO =
  /<a href="\/match-details\/([^"]+)" data-match="(\d+)" data-kick="([^"]*)" data-status="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

type Celula = { classes: string; attrs: string; corpo: string };

/**
 * Quebra o bloco do jogo em células de palpite (`tbm-*`).
 *
 * Fatiar pelo prefixo da classe é mais seguro que um regex único: cada célula
 * termina onde a próxima começa, então uma célula sem odd (placar exato) não
 * "rouba" a odd da seguinte.
 */
function celulas(bloco: string): Celula[] {
  // O separador leva o espaço final de propósito: "tb-mcell__bar" também
  // começa com "tb-mcell", e sem o espaço a barra cortaria a célula no meio.
  const partes = bloco.split('<div class="tb-mcell ');
  const out: Celula[] = [];
  for (let i = 1; i < partes.length; i++) {
    const p = partes[i];
    const classes = (p.match(/^([^"]*)"/) ?? [])[1] ?? "";
    const fim = p.indexOf(">");
    if (fim < 0) continue;
    out.push({
      classes,
      attrs: p.slice(classes.length + 1, fim),
      corpo: p.slice(fim + 1),
    });
  }
  return out;
}

/** Extrai um "pick" (1x2, gols, btts, melhor) de uma célula. */
function pickDa(celula: Celula | undefined, resultado: Status): Pick | null {
  if (!celula) return null;
  const rotulo = texto((celula.corpo.match(/tb-mcell__pick"[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
  // "•••" = palpite bloqueado para quem não assina.
  if (!rotulo || !rotulo.replace(/[•\s]/g, "")) return null;

  // Corta até o `</div>` da barra: a odd vem depois de um <span> com a seta
  // (▾/▴), então parar no primeiro `</span>` pegaria só a seta.
  const oddTxt = texto((celula.corpo.match(/tb-mcell__odd[^>]*>([\s\S]*?)<\/div>/) ?? [])[1] ?? "");
  const conf = celula.attrs.match(/([\d.]+)\/10/);

  return {
    rotulo,
    texto: traduzirPick(rotulo),
    odd: odd(oddTxt),
    confianca: conf ? Number(conf[1]) : null,
    pct: pctDe(celula.attrs),
    resultado,
  };
}

function pickClasse(bloco: string, classe: string, resultado: Status): Pick | null {
  return pickDa(
    celulas(bloco).find((c) => c.classes.split(/\s+/).includes(classe)),
    resultado,
  );
}

/** Lê as três odds de 1X2 do bloco. */
function lerOdds(bloco: string): Jogo["odds"] {
  const out: Jogo["odds"] = { casa: null, empate: null, fora: null };
  const mapa: [RegExp, keyof Jogo["odds"]][] = [
    [/data-tt="Odd for Home Win"[^>]*>([\s\S]*?)<\/div>/, "casa"],
    [/data-tt="Odd for Draw"[^>]*>([\s\S]*?)<\/div>/, "empate"],
    [/data-tt="Odd for Away Win"[^>]*>([\s\S]*?)<\/div>/, "fora"],
  ];
  for (const [rx, k] of mapa) {
    const m = bloco.match(rx);
    // `odd()` e não `numero()`: a Vercel consulta o site de um IP dos EUA e o
    // site devolve odd americana (-149). Sem converter, a lista mostrava
    // "-149.00".
    if (m) out[k] = odd(texto(m[1]));
  }
  return out;
}

/**
 * Extrai o board de uma página de palpites (`/`, `/all-matches`,
 * `/bet-of-the-day`, `/correct-score-predictions-today`).
 *
 * Agrupa por competição preservando a ordem em que o site exibe.
 */
/**
 * Cabeçalhos de competição do board: `Ligue 1` + `Algeria`.
 *
 * O nome da liga sozinho é ambíguo — existe Ligue 1 na França, na Argélia e no
 * Senegal. O país vem no segundo `<span>` do link da liga.
 */
const RX_CABECALHO_LIGA =
  /href="\/football-predictions-for-[^"]*"\s+class="lgl[^"]*"[^>]*>\s*<span[^>]*>([^<]*)<\/span>\s*<span[^>]*>([^<]*)<\/span>/g;

function cabecalhosDeLiga(html: string): { indice: number; liga: string; pais: string }[] {
  const out: { indice: number; liga: string; pais: string }[] = [];
  const rx = new RegExp(RX_CABECALHO_LIGA.source, "g");
  let h: RegExpExecArray | null;
  while ((h = rx.exec(html))) {
    out.push({ indice: h.index, liga: texto(h[1]), pais: texto(h[2]) });
  }
  return out;
}

export function parseBoard(html: string): Board {
  const jogos: Jogo[] = [];
  const cabecalhos = cabecalhosDeLiga(html);
  let proximoCabecalho = 0;
  let ligaAtual = "";
  let paisAtual = "";
  RX_JOGO.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = RX_JOGO.exec(html))) {
    // O jogo pertence ao último cabeçalho antes dele no documento.
    while (proximoCabecalho < cabecalhos.length && cabecalhos[proximoCabecalho].indice < m.index) {
      ligaAtual = cabecalhos[proximoCabecalho].liga;
      paisAtual = cabecalhos[proximoCabecalho].pais;
      proximoCabecalho++;
    }
    const [, slug, id, kick, statusAttr, bloco] = m;
    const resumo = texto((bloco.match(/<span class="sr-only">([\s\S]*?)<\/span>/) ?? [])[1] ?? "");

    // Nomes dos times: os spans da lista (o sr-only também tem, mas este é o
    // dado de tela e é o que aparece pro usuário).
    const nomes = Array.from(bloco.matchAll(/<span class="nt-nm-x">([^<]*)<\/span>/g)).map((x) => texto(x[1]));
    if (nomes.length < 2) continue;

    const logos = Array.from(bloco.matchAll(/<img src="([^"]+)"[^>]*class="nt-crest"/g)).map((x) => x[1]);

    // Competição: preferimos o cabeçalho do grupo (traz o país); o resumo
    // acessível do card serve de reserva.
    const liga = ligaAtual || (resumo.match(/ vs .+?, (.+?), kick-off /) ?? [])[1] || "";
    const pais = paisAtual;

    const sh = bloco.match(/data-score-h[^>]*>(\d+)</);
    const sa = bloco.match(/data-score-a[^>]*>(\d+)</);
    const placar = sh && sa ? { casa: Number(sh[1]), fora: Number(sa[1]) } : null;

    const hora = texto((bloco.match(/class="num nt-time"[^>]*>([\s\S]*?)<\/div>/) ?? [])[1] ?? "");
    const resultado = statusDe(statusAttr || (bloco.match(/is-won|is-lost/) ?? [""])[0]);

    const confiancaTxt = bloco.match(/class="num tb-trust">([\d.]+)</);
    const confianca = confiancaTxt ? Number(confiancaTxt[1]) : null;

    const melhor = pickClasse(bloco, "tbm-besttip", resultado);
    if (melhor) {
      melhor.confianca = confianca ?? melhor.confianca;
      melhor.texto = traduzirPick(melhor.rotulo);
    }

    // Placar exato das páginas de correct score: aparece como pick da célula
    // "besttip" no formato 1–1 (aí a célula não tem odd).
    const exato = bloco.match(/tb-mcell__pick"[^>]*>(\d+\s*[–-]\s*\d+)</);

    jogos.push({
      id,
      slug,
      liga,
      pais,
      casa: nomes[0],
      fora: nomes[1],
      logos: [logos[0] ?? null, logos[1] ?? null],
      hora: hora || kick,
      kickoff: kick,
      placar,
      status: resultado,
      odds: lerOdds(bloco),
      pick1x2: pickClasse(bloco, "tbm-pickscore", resultado),
      pickGols: pickClasse(bloco, "tbm-goals", resultado),
      pickBtts: pickClasse(bloco, "tbm-btts", resultado),
      melhor,
      melhorTexto: traduzirDescricao((resumo.match(/Best tip: ([^,]+)/i) ?? [])[1] ?? null),
      placarExato: exato ? exato[1].replace(/\s+/g, "") : null,
    });
  }

  const mapa = new Map<string, number>();
  for (const j of jogos) mapa.set(j.liga || "Outros", (mapa.get(j.liga || "Outros") ?? 0) + 1);

  return {
    jogos,
    ligas: Array.from(mapa.entries()).map(([nome, n]) => ({ nome, jogos: n })),
    geradoEm: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Página de uma partida                                              */
/* ------------------------------------------------------------------ */

export type PalpiteCard = {
  rotulo: string;
  pick: string;
  texto: string;
  odd: number | null;
  confianca: number | null;
};

export type StatComparada = {
  rotulo: string;
  /** Valores do modelo (coluna "predicted"). */
  predCasa: string;
  predFora: string;
  /** Valores reais, quando o jogo já aconteceu. */
  realCasa: string | null;
  realFora: string | null;
};

export type Evento = {
  minuto: string;
  texto: string;
  placar: string | null;
  tipo: "gol" | "cartao" | "sub" | "outro";
};

export type Partida = {
  id: string;
  liga: string;
  casa: string;
  fora: string;
  logos: [string | null, string | null];
  kickoffTs: number | null;
  status: string;
  encerrado: boolean;
  placar: { casa: number; fora: number } | null;
  odds: { casa: number | null; empate: number | null; fora: number | null };
  melhor: PalpiteCard | null;
  palpites: PalpiteCard[];
  stats: StatComparada[];
  eventos: Evento[];
  h2h: { total: number; vitoriasCasa: number; empates: number; vitoriasFora: number } | null;
  /** Confrontos diretos com placar (mandante primeiro), do mais recente ao mais antigo. */
  h2hJogos: { golsCasa: number; golsFora: number }[];
};

/** Lê um card de palpite (`md-pcard`) do bloco. */
function cardPalpite(bloco: string): PalpiteCard | null {
  const rotulo = texto((bloco.match(/md-pcard__label">([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
  if (!rotulo) return null;
  const pick = texto((bloco.match(/md-pcard__tip">([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
  let placar: string | null = null;
  if (!pick) {
    // Cards de placar (intervalo e placar exato) não têm "tip": o valor vem
    // numa fileira `md-score__n` (0 : 0).
    const nums = Array.from(bloco.matchAll(/md-score__n">(\d+)</g)).map((m) => m[1]);
    if (nums.length === 2) placar = `${nums[0]}–${nums[1]}`;
  }
  const iOdd = bloco.indexOf('md-pcard__odd">');
  const fimOdd = bloco.indexOf('<div class="md-conf', iOdd);
  const oddTxt = iOdd >= 0 ? texto(bloco.slice(iOdd, fimOdd > iOdd ? fimOdd : iOdd + 160)) : "";
  const conf = bloco.match(/md-conf__val">([\d.]+)<small>\/10/);
  return {
    rotulo,
    pick: pick || placar || "",
    texto: traduzirPick(pick || placar || ""),
    odd: odd(oddTxt),
    confianca: conf ? Number(conf[1]) : null,
  };
}

/** Valores de um painel de estatísticas (pred = modelo, real = jogo). */
function painelStats(html: string, qual: "pred" | "real"): { rotulo: string; casa: string; fora: string }[] {
  const i = html.indexOf(`data-ps-panel="${qual}"`);
  if (i < 0) return [];
  const j = html.indexOf('data-ps-panel="', i + 20);
  const seg = html.slice(i, j > 0 ? j : i + 60_000);
  const out: { rotulo: string; casa: string; fora: string }[] = [];

  for (const bruto of seg.split('<div class="md-ps__row">').slice(1)) {
    // O nome do time vem num `sr-only` que atrapalha a leitura dos valores.
    const r = bruto.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, "");
    const rotulo = texto((r.match(/md-ps__lbl">([\s\S]*?)<\/span><\/span>/) ?? [])[1] ?? "");
    const casa = texto((r.match(/md-ps__v md-ps__v--h[^"]*"[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    const fora = texto((r.match(/md-ps__v md-ps__v--a[^"]*"[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    if (rotulo && (casa || fora)) out.push({ rotulo, casa, fora });
  }
  return out;
}

/** Tabela de "predito x real" da página de partida. */
export function parsePartida(html: string): Partida {
  const id = (html.match(/data-match-id="(\d+)"/) ?? [])[1] ?? "";
  const titulo = texto((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) ?? [])[1] ?? "");
  const times = titulo.match(/^(.+?)\s+vs\.?\s+(.+?)\s+Prediction/i);
  const liga = texto((html.match(/class="lgl[^"]*"[^>]*>([\s\S]*?)<\/a>/) ?? [])[1] ?? "");

  const crests = Array.from(html.matchAll(/class="md-crest"[^>]*alt="([^"]*)"/g)).map((m) => m[1]);
  const logos = Array.from(html.matchAll(/<img src="([^"]+)"[^>]*class="md-crest"/g)).map((m) => m[1]);
  const casa = times ? texto(times[1]) : texto(crests[0] ?? "");
  const fora = times ? texto(times[2]) : texto(crests[1] ?? "");

  const sh = html.match(/data-score-h[^>]*>(\d+)</);
  const sa = html.match(/data-score-a[^>]*>(\d+)</);
  const placar = sh && sa ? { casa: Number(sh[1]), fora: Number(sa[1]) } : null;

  const status = texto((html.match(/data-md-status[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
  const kickoffTs = Number((html.match(/data-kick-ts="(\d+)"/) ?? [])[1] ?? "") || null;

  // Odds de 1X2 no topo da página (ordem: casa, empate, fora).
  const oddsVals = Array.from(html.matchAll(/md-1x2__o"[^>]*>([\s\S]*?)<\/span><\/span>/g))
    .map((m) => odd(texto(m[1])))
    .filter((v): v is number => v != null);

  // Melhor palpite (destaque do topo da seção).
  let melhor: PalpiteCard | null = null;
  const iBest = html.indexOf('<div class="md-best');
  const iCards = html.indexOf('<div class="grid grid-cols-1 gap-3', iBest);
  const bestBloco = iBest >= 0 ? html.slice(iBest, iCards > iBest ? iCards : iBest + 3000) : "";
  if (bestBloco) {
    const pick = texto((bestBloco.match(/md-best__tip">([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    const oddTxt = texto((bestBloco.match(/md-best__odd">([\s\S]*?)<\/span><\/div>/) ?? [])[1] ?? "");
    const conf = bestBloco.match(/md-conf__val">([\d.]+)<small>\/10/);
    if (pick) {
      melhor = {
        rotulo: pick,
        pick,
        texto: traduzirPick(pick),
        odd: odd(oddTxt),
        confianca: conf ? Number(conf[1]) : null,
      };
    }
  }

  const palpites = html
    .split('<div class="md-pcard">')
    .slice(1)
    .map((b) => cardPalpite(b))
    .filter((p): p is PalpiteCard => p != null);

  // Estatísticas: o site mostra um painel por vez; aqui juntamos modelo e real.
  const pred = painelStats(html, "pred");
  const real = painelStats(html, "real");
  const stats: StatComparada[] = pred.map((p) => {
    const r = real.find((x) => x.rotulo === p.rotulo);
    return {
      rotulo: p.rotulo,
      predCasa: p.casa || "–",
      predFora: p.fora || "–",
      realCasa: r?.casa ?? null,
      realFora: r?.fora ?? null,
    };
  });

  const eventos: Evento[] = [];
  for (const b of html.split('<li class="md-ev__row').slice(1)) {
    const minuto = texto((b.match(/md-ev__min">([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    const desc = texto((b.match(/<span class="sr-only">([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    const scTxt = texto((b.match(/md-ev__sc">([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    const sc = (scTxt.match(/\d+\s*[–-]\s*\d+/) ?? [])[0] ?? null;
    if (!minuto && !desc) continue;
    const tipo: Evento["tipo"] = /goal/i.test(desc)
      ? "gol"
      : /yellow|red|card/i.test(desc)
        ? "cartao"
        : /substitut|sub /i.test(desc)
          ? "sub"
          : "outro";
    eventos.push({ minuto, texto: desc, placar: sc || null, tipo });
  }

  // H2H resumido (total de jogos e o retrospecto).
  let h2h: Partida["h2h"] = null;
  const h2hSeg = html.slice(html.indexOf('id="h2h"'));
  const totalH2H = h2hSeg.match(/md-hq__label">[\s\S]*?<span class="num">(\d+)<\/span>/);
  if (totalH2H) {
    const figs = Array.from(h2hSeg.matchAll(/md-hq__fig[^"]*"[^>]*>\s*<b class="num">(\d+)<\/b>/g)).map((m) => Number(m[1]));
    h2h = {
      total: Number(totalH2H[1]),
      vitoriasCasa: figs[0] ?? 0,
      empates: figs[1] ?? 0,
      vitoriasFora: figs[2] ?? 0,
    };
  }

  // Confrontos diretos com placar: cada linha `md-hq__lr` traz, no texto
  // acessível, "Nov 13 2026: Mozambique 0–1 Ethiopia" (mandante primeiro).
  // É o que alimenta o "Palpite fixo" — sem isso só teríamos o retrospecto.
  const h2hJogos: Partida["h2hJogos"] = [];
  for (const linha of h2hSeg.split("md-hq__lr").slice(1)) {
    const inicio = linha.indexOf('class="sr-only"');
    if (inicio < 0) continue;
    const trecho = texto(linha.slice(inicio, linha.indexOf("md-hq__lc", inicio) + 1 || linha.length));
    // "Nov 13 2026: Mozambique 0–1 Ethiopia" — o placar é o primeiro par
    // numérico separado por travessão depois dos dois-pontos.
    const placar = trecho.slice(trecho.indexOf(":") + 1).match(/(\d+)\s*[\u2013\u2014-]\s*(\d+)/);
    if (!placar) continue;
    const golsCasa = Number(placar[1]);
    const golsFora = Number(placar[2]);
    if (!Number.isFinite(golsCasa) || !Number.isFinite(golsFora)) continue;
    h2hJogos.push({ golsCasa, golsFora });
  }

  return {
    id,
    liga,
    casa,
    fora,
    logos: [logos[0] ?? null, logos[1] ?? null],
    kickoffTs,
    status,
    encerrado: /finish|ft|encerr/i.test(status),
    placar,
    odds: { casa: oddsVals[0] ?? null, empate: oddsVals[1] ?? null, fora: oddsVals[2] ?? null },
    melhor,
    palpites,
    stats,
    eventos,
    h2h,
    h2hJogos,
  };
}

/* ------------------------------------------------------------------ */
/* Desempenho público                                                 */
/* ------------------------------------------------------------------ */

export type Kpi = { valor: string; rotulo: string; sub: string };
export type MesRecorde = { mes: string; bankers: string; overall: string; bankersN: string; overallN: string };
export type Progresso = { kpis: Kpi[]; atualizadoEm: string | null; meses: MesRecorde[] };

/** Extrai os KPIs e a tabela mensal de `/progress`. */
export function parseProgresso(html: string): Progresso {
  const kpis: Kpi[] = [];
  for (const b of html.split('<div class="pg-kpi">').slice(1)) {
    const valor = texto((b.match(/pg-kpi__val"[^>]*>([\s\S]*?)<\/div>/) ?? [])[1] ?? "");
    const rotulo = texto((b.match(/pg-kpi__lab">([\s\S]*?)<\/div>/) ?? [])[1] ?? "");
    const sub = texto((b.match(/pg-kpi__sub">([\s\S]*?)<\/div>/) ?? [])[1] ?? "");
    if (valor) kpis.push({ valor, rotulo, sub });
  }

  const atualizadoEm = (html.match(/pg-upd"><time[^>]*datetime="([\d-]+)"/) ?? [])[1] ?? null;

  const meses: MesRecorde[] = [];
  for (const m of html.matchAll(/<tr>\s*<th scope="row">([^<]+)<\/th>([\s\S]*?)<\/tr>/g)) {
    const valores = Array.from(m[2].matchAll(/pg-mt__v"[^>]*>([^<]+)</g)).map((x) => texto(x[1]));
    const contagens = Array.from(m[2].matchAll(/pg-mt__n">([^<]+)</g)).map((x) => texto(x[1]));
    if (valores.length === 0) continue;
    meses.push({
      mes: texto(m[1]),
      bankers: valores[0] ?? "–",
      overall: valores[1] ?? "–",
      bankersN: contagens[0] ?? "",
      overallN: contagens[1] ?? "",
    });
  }

  return { kpis, atualizadoEm, meses };
}

/* ------------------------------------------------------------------ */
/* Destaques (bet of the day)                                         */
/* ------------------------------------------------------------------ */

export type Destaques = {
  jogos: Jogo[];
  ligas: Board["ligas"];
  geradoEm: string;
  bankers: number | null;
  proximos: number | null;
  acerto: string | null;
  slip: { picks: number | null; odd: number | null } | null;
  /**
   * De onde vieram os palpites dos cards: "site" = o próprio bet-of-the-day
   * veio liberado; "boards" = o bet-of-the-day veio travado ("•••") e os
   * palpites foram completados pelos boards públicos.
   */
  fontePalpites?: "site" | "boards";
};

/** `/bet-of-the-day`: mesmo board + contadores de bankers e o slip pronto. */
export function parseDestaques(html: string): Destaques {
  const board = parseBoard(html);
  const txt = texto(html);

  const contadores = txt.match(/(\d+)\s*Bankers\s*(\d+)\s*Upcoming\s*(\d+)%\s*Success/i);

  // O slip pronto vem nos atributos do botão da aba: data-v1 = nº de picks,
  // data-v3 = odd total. Não há texto "N picks · odd" no HTML.
  const slipBtn = html.match(
    /data-botd-tab="slip"[^>]*data-v1="(\d+)"[^>]*data-v2="(\d+)"[^>]*data-v3="([\d.]+)"/,
  );

  return {
    ...board,
    bankers: contadores ? Number(contadores[1]) : null,
    proximos: contadores ? Number(contadores[2]) : null,
    acerto: contadores ? `${contadores[3]}%` : null,
    slip: slipBtn ? { picks: Number(slipBtn[1]), odd: Number(slipBtn[3]) } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Bet Builder (combinada)                                            */
/* ------------------------------------------------------------------ */

export type ItemCombinada = {
  /** "Wed, Nov 18 · 10:00" — data/hora como o site escreve. */
  data: string;
  /** "Uganda · Premier League". */
  liga: string;
  ligaPais: string;
  ligaNome: string;
  ligaHref: string | null;
  casa: string;
  fora: string;
  logoCasa: string | null;
  logoFora: string | null;
  /** Rótulo cru do site ("U2.5", "1X", "Yes"). */
  palpite: string;
  /** Rótulo em português. */
  texto: string;
  odd: number | null;
  confianca: number | null;
};

export type Combinada = {
  rotulo: string;
  picks: number | null;
  /** Odd total publicada pelo site. */
  oddTotal: number | null;
  /** Produto das odds dos itens — serve para conferir a publicada. */
  oddCalculada: number | null;
  itens: ItemCombinada[];
  /** Limites do plano gratuito, lidos do HTML. */
  minTrust: number | null;
  maxTrust: number | null;
  lockMax: number | null;
  /**
   * `true` = o Monte-uma-combinada livre (escolher jogos, odds e tamanho) não
   * está disponível. O endpoint `POST /bet-builder/generate` devolve
   * `403 {"error":"subscription_required"}` para quem não assina, então só o
   * slip diário gratuito — que vem renderizado na página — é nosso.
   */
  bloqueado: boolean;
};

/**
 * `/bet-builder`: extrai o "Free daily slip".
 *
 * O gerador de verdade (`POST /bet-builder/generate`, form-urlencoded com
 * `num_picks_range`, `min_trust`, `target_odds`, `bases`, `slip_size`…) está
 * atrás de assinatura: testado com cookie de sessão e três combinações de
 * parâmetros, sempre 403 `subscription_required`. O que a página entrega de
 * graça é este slip pronto de 3 picks — e é o que o usuário vê ao clicar em
 * "Generate free slip" (o HTML traz o bloco com `hidden`, revelado por JS).
 */
export function parseCombinada(html: string): Combinada {
  const iIni = html.indexOf("data-bb-free-slip");
  const iFim = iIni >= 0 ? html.indexOf("</ul>", iIni) : -1;
  const bloco = iIni >= 0 ? html.slice(iIni, iFim > iIni ? iFim : iIni + 60_000) : "";

  const rotulo = texto((bloco.match(/bb-slip__eyebrow"[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
  const tituloBloco = bloco.match(/bb-slip__title"[^>]*>([\s\S]*?)<\/h2>/);
  const titulo = texto(tituloBloco ? tituloBloco[1] : "");
  const spanTotal = (tituloBloco ? tituloBloco[1] : "").match(/<span>([\s\S]*?)<\/span>/);

  const itens: ItemCombinada[] = [];
  for (const pedaco of bloco.split('<li class="bb-slip__row').slice(1)) {
    const times = Array.from(
      pedaco.matchAll(/bb-slip__team"><img src="([^"]+)"[^>]*>\s*([^<]*)</g),
    ).map((m) => ({ logo: m[1], nome: texto(m[2]) }));

    const palpite = texto((pedaco.match(/am-pill"[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    if (!times[0]?.nome || !palpite) continue;

    const ligaTxt = texto((pedaco.match(/bb-slip__league"[^>]*>([\s\S]*?)<\/span>/) ?? [])[1] ?? "");
    const partes = ligaTxt.split("·").map((p) => p.trim());

    const conf = texto((pedaco.match(/am-meta__conf"[^>]*>([\d.]+)</) ?? [])[1] ?? "");
    // A odd vem depois de um <span> com a seta (▾), então o corte tem que ir
    // até o bloco da confiança — parar no primeiro </span> capturaria só a seta.
    const blocoOdd = pedaco.match(/am-meta__odd"[^>]*>([\s\S]*?)am-meta__conf/);

    itens.push({
      data: texto((pedaco.match(/bb-slip__date"[^>]*>([^<]*)</) ?? [])[1] ?? ""),
      liga: ligaTxt,
      ligaPais: partes.length > 1 ? partes[0] : "",
      ligaNome: partes.length > 1 ? partes.slice(1).join(" · ") : ligaTxt,
      ligaHref: (pedaco.match(/href="([^"]+)" class="lgl"/) ?? [])[1] ?? null,
      casa: times[0].nome,
      fora: times[1]?.nome ?? "",
      logoCasa: times[0].logo,
      logoFora: times[1]?.logo ?? null,
      palpite,
      texto: traduzirPick(palpite),
      odd: odd(texto(blocoOdd ? blocoOdd[1] : "")),
      confianca: conf ? Number(conf) : null,
    });
  }

  const limite = (nome: string) => {
    const m = html.match(new RegExp(`data-${nome}="(\\d+)"`));
    return m ? Number(m[1]) : null;
  };

  const oddTotal = spanTotal ? odd(texto(spanTotal[1])) : null;

  return {
    rotulo,
    picks: itens.length || (primeiroNumero(titulo) ?? null),
    oddTotal,
    oddCalculada: oddCombinada(itens.map((it) => it.odd)),
    itens,
    minTrust: limite("free-min-trust"),
    maxTrust: limite("free-max-trust"),
    lockMax: limite("bb-lock-max"),
    bloqueado: true,
  };
}

/**
 * Completa os destaques com os boards públicos.
 *
 * O `/bet-of-the-day` entrega os palpites **travados** ("•••", inclusive a odd)
 * para quem não assina; os boards `/` e `/all-matches` mostram o mesmo jogo com
 * palpite, odd e confiança. Sem essa junção os cards ficavam com "-" no lugar da
 * odd. Estratégia:
 *
 * 1. se o site liberou os palpites, fica como está;
 * 2. se liberou em parte, completa por `id` e inclui os jogos do board que faltam;
 * 3. se travou tudo, os cards passam a ser os do board público (ordenados por
 *    confiança na tela) — melhor um palpite real e identificável do que 7 cards
 *    com "•••".
 *
 * Os contadores e o slip continuam vindo do bet-of-the-day: são números que só
 * existem lá.
 */
export function mesclarDestaques(d: Destaques, board: Board): Destaques {
  const publicos = board.jogos.filter((j) => j.melhor);
  const liberados = d.jogos.filter((j) => j.melhor);

  if (d.jogos.length === 0) {
    return publicos.length ? { ...d, jogos: publicos, fontePalpites: "boards" } : { ...d, fontePalpites: "site" };
  }
  if (liberados.length === d.jogos.length) return { ...d, fontePalpites: "site" };

  // Travado total: o board público assume os cards.
  if (liberados.length === 0) {
    return publicos.length ? { ...d, jogos: publicos, fontePalpites: "boards" } : { ...d, fontePalpites: "site" };
  }

  // Travado em parte: completa por id e soma o que só existe no board.
  const porId = new Map(board.jogos.map((j) => [j.id, j]));
  const jogos = d.jogos.map((j) => {
    if (j.melhor) return j;
    const pub = porId.get(j.id);
    if (!pub) return j;
    return {
      ...j,
      // As odds de 1X2 do bet-of-the-day são públicas; só o palpite vem travado.
      odds: j.odds.casa != null || j.odds.fora != null ? j.odds : pub.odds,
      pick1x2: pub.pick1x2,
      pickGols: pub.pickGols,
      pickBtts: pub.pickBtts,
      melhor: pub.melhor,
      melhorTexto: pub.melhorTexto,
    };
  });
  const vistos = new Set(jogos.map((j) => j.id));
  for (const j of publicos) if (!vistos.has(j.id)) jogos.push(j);

  return { ...d, jogos, fontePalpites: "boards" };
}
