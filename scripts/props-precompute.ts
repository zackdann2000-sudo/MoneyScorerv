/**
 * Pré-cálculo de Player Props (cron) — aquece `player_props_cache` para os jogos
 * das principais ligas do dia, para a UI ler do banco com ZERO chamada de API.
 *
 * Por que existe: `/fixtures/players` da API-Football custa cota (100 req/dia no
 * plano Free) e o custo por time é ~1 busca de time + N jogos (PROPS_MAX_JOGOS,
 * padrão 4). Se a tela pedisse props por jogo em tempo real, a cota acabaria no
 * meio da manhã e o usuário veria erro em vez de dado.
 *
 * Regras deste script:
 *   1. Só principais ligas (`isMainLeague`), porque é onde a demanda existe.
 *   2. Só gasta cota para time SEM cache fresco — `getPropsDoTime(nome, {
 *      permitirApi: false })` responde do banco e, se voltar `null`, aí sim vale
 *      a chamada. Ou seja: rodar 2× no mesmo dia custa ~0.
 *   3. Teto de times (`PROPS_MAX_TIMES`, padrão 16) e `--dry-run` para ver o
 *      plano sem gastar nada.
 *   4. Nunca derruba o job por um time: cada falha entra em `avisos[]`, porque
 *      props é enriquecimento — o resto do app não depende disto.
 *
 * Uso:
 *   npx tsx scripts/props-precompute.ts                # hoje (America/Sao_Paulo)
 *   npx tsx scripts/props-precompute.ts --dry-run
 *   npx tsx scripts/props-precompute.ts --date=2026-11-22
 *   npx tsx scripts/props-precompute.ts --max-times=8
 */
import "dotenv/config";
import { getAllMatches } from "@/lib/espn";
import { isMainLeague } from "@/lib/mainLeagues";
import { getPropsDoTime, PROPS_MAX_JOGOS, PROPS_DISABLED } from "@/lib/playerProps";
import { afStatus } from "@/lib/providers";

const flag = (n: string) => process.argv.includes(`--${n}`);
const arg = (n: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split("=").slice(1).join("=") : undefined;
};

/** Data de hoje no fuso do produto — o mesmo critério de `dataSP` no track record. */
function diaLocal(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

async function main() {
  if (PROPS_DISABLED) {
    console.log("PLAYER_PROPS_DISABLED=1 — nada a fazer.");
    return;
  }

  const data = arg("date") || diaLocal();
  const dryRun = flag("dry-run");
  const maxTimes = Math.max(1, Number(arg("max-times") || process.env.PROPS_MAX_TIMES || 16));

  // Sonda de conta ANTES de tudo. `/status` não consome cota e é o único lugar
  // que diz o que importa: plano, requests usados/limite e — caso real medido
  // em 21/11/2026 — conta SUSPENSA. Sem esta sonda, conta suspensa vira 16
  // linhas de "sem amostra", que parece problema de dados, não de assinatura.
  const status = await afStatus().catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`API-Football indisponível: ${msg}`);
  });
  console.log(`API-Football: plano ${status.plan} · ${status.used ?? "?"}/${status.limitDay ?? "?"} requests hoje`);

  const jogos = await getAllMatches(data).catch((e) => {
    console.error(`fonte falhou para ${data}:`, e instanceof Error ? e.message : e);
    return [];
  });
  if (!jogos.length) {
    console.log(`${data}: nenhum jogo na fonte — nada a pré-calcular.`);
    return;
  }

  // Só principais ligas, e só times distintos (um time pode jogar 1× por dia).
  const relevantes = jogos.filter((m) => isMainLeague(m.league));
  const times = new Map<string, string>(); // chave normalizada → nome de exibição
  for (const m of relevantes) {
    for (const t of [m.home, m.away]) {
      if (!t?.name) continue;
      const key = t.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      if (!times.has(key)) times.set(key, t.name);
    }
  }

  console.log(
    `${data}: ${jogos.length} jogos · ${relevantes.length} de principais ligas · ${times.size} times distintos`,
  );
  if (!times.size) return;

  const alvos = [...times.values()].slice(0, maxTimes);
  const cortados = times.size - alvos.length;

  // Fase 1 (custo zero): quem já tem cache fresco não entra na conta da cota.
  const semCache: string[] = [];
  for (const nome of alvos) {
    const emCache = await getPropsDoTime(nome, { permitirApi: false });
    if (!emCache) semCache.push(nome);
    else console.log(`  ✓ cache fresco: ${nome} (${emCache.sample} jogos)`);
  }

  const estimativa = semCache.length * (1 + PROPS_MAX_JOGOS);
  console.log(
    `\nplano: ${semCache.length} time(s) sem cache · ~${estimativa} requests ` +
      `(1 busca + ${PROPS_MAX_JOGOS} jogos por time)${cortados > 0 ? ` · ${cortados} time(s) fora do teto` : ""}`,
  );

  if (!semCache.length) {
    console.log("nada a fazer — cache do dia já está quente.");
    return;
  }
  if (dryRun) {
    console.log("\n--dry-run: não chamei a API.");
    for (const n of semCache) console.log(`  → ${n}`);
    return;
  }

  // Fase 2: gasta cota só no que faltou (sequencial de propósito: a API tem
  // limite por minuto e o job tem 15 min de folga, não pressa).
  const avisos: string[] = [];
  let quentes = 0;
  for (const nome of semCache) {
    const r = await getPropsDoTime(nome, { permitirApi: true }).catch((e) => {
      avisos.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
    if (r) {
      quentes++;
      console.log(`  + ${nome}: ${r.jogadores.length} jogadores em ${r.sample} jogos`);
    } else {
      avisos.push(`${nome}: fonte não devolveu amostra`);
      console.log(`  · ${nome}: sem amostra (fica para a próxima)`);
    }
  }

  console.log(`\npronto: ${quentes}/${semCache.length} times aquecidos`);
  if (avisos.length) {
    console.log(`avisos (${avisos.length}):`);
    for (const a of avisos) console.log(`  - ${a}`);
  }
  // Sai 0 mesmo com avisos: props é enriquecimento. Só falha de fonte/DB
  // (que estoura antes) derruba o job.
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("falhou:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
