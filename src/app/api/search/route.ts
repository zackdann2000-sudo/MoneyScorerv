import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { hubTeam, hubLeague } from "@/db/hub-schema";
import { and, eq, ilike, sql } from "drizzle-orm";
import { LEAGUES, getScoreboard, normEvent, todayYmd, type Match } from "@/lib/espn";
import { peek } from "@/lib/cache";
import { buscar, agrupar, MIN_BUSCA, type Candidato } from "@/lib/searchIndex";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/* =============================================================================
   BUSCA GLOBAL — time, liga e jogo.

   Custo de fornecedor: ZERO. As três fontes são:
   • LEAGUES (lista estática do projeto);
   • hub_team/hub_league no Postgres (top-N por ILIKE, tabelas pequenas);
   • o placar do dia QUE JÁ ESTÁ EM CACHE (a busca nunca chama getAllMatches —
     isso seriam 27 requests e até 8 s no cache frio).
   Se alguma fonte falhar, a busca responde com as outras. Nunca inventa.
   ========================================================================== */

const LIMITE_POR_FONTE = 40;

type LinhaTime = { nome: string; logo: string | null; teamRef: string | null; ligaCode: string | null };

/** Times do Hub que apontam para um id da ESPN (só esses têm link válido). */
async function timesDoHub(termo: string): Promise<LinhaTime[]> {
  const like = `%${termo}%`;
  const q = db
    .select({
      nome: hubTeam.name,
      logo: hubTeam.logoUrl,
      teamRef: hubTeam.externalRef,
      ligaCode: hubLeague.externalRef,
    })
    .from(hubTeam)
    .leftJoin(hubLeague, eq(hubTeam.leagueId, hubLeague.id))
    .where(and(ilike(hubTeam.name, like), eq(hubTeam.source, "espn")))
    .limit(LIMITE_POR_FONTE);

  /* Timeout curto: a busca não pode ficar pendurada por causa do banco. 1,5 s
     porque a primeira conexão de uma instância fria passa fácil dos 800 ms. */
  const timeout = new Promise<LinhaTime[]>((r) => setTimeout(() => r([]), 1500));
  return Promise.race([q as unknown as Promise<LinhaTime[]>, timeout]).catch(() => []);
}

export async function GET(req: NextRequest) {
  try {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < MIN_BUSCA) return NextResponse.json({ q, grupos: { times: [], ligas: [], jogos: [] }, total: 0 });

  const gate = await rateLimit("busca", clientIp(req), { limit: 60, windowSec: 60 });
  if (!gate.ok) return NextResponse.json({ error: "Muitas buscas em pouco tempo. Aguarde um instante." }, { status: 429 });

  const candidatos: Candidato[] = [];

  /* 1) Ligas estáticas — sempre disponíveis, mesmo com banco fora. */
  for (const l of LEAGUES) {
    candidatos.push({
      tipo: "liga",
      id: l.code,
      nome: l.name,
      sub: l.country,
      href: `/palpites/${l.code}`,
      aliases: [l.country],
    });
  }

  /* 2) Times do Hub (Postgres). */
  try {
    for (const t of await timesDoHub(q)) {
      if (!t.teamRef || !t.ligaCode) continue;
      candidatos.push({
        tipo: "time",
        id: `${t.ligaCode}:${t.teamRef}`,
        nome: t.nome,
        sub: "Time",
        logo: t.logo || undefined,
        href: `/times/${t.teamRef}?league=${encodeURIComponent(t.ligaCode)}`,
      });
    }
  } catch {
    /* banco fora: segue com ligas + cache */
  }

  /* 3) Jogos do dia que já estão em cache (chave `sb:<liga>:<AAAAMMDD>`).
     Cache frio é o caso normal de quem entra agora: aí aquecemos SÓ as
     prioridades 1-4 do projeto (Brasileirão, Libertadores, Champions,
     Premier) com orçamento de 3 s. Sem isso, buscar "fla" numa instância
     recém-ligada devolvia vazio — e o time existia, só não estava em cache. */
  let quentes = peek<Match[]>("sb:");
  if (!quentes.length) {
    const top = LEAGUES.filter((l) => l.priority <= 4).slice(0, 4);
    await Promise.race([
      Promise.allSettled(top.map((l) => getScoreboard(l.code, todayYmd()))),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
    quentes = peek<Match[]>("sb:");
  }

  /* O cache `sb:` guarda o JSON CRU da ESPN (é o que `fetchJson` memoiza), não
     a lista já normalizada. Então reinterpretamos com `normEvent`, usando a
     liga que está na própria chave (`sb:<liga>:<AAAAMMDD>`). */
  const jogosDoCache = (): Match[] => {
    const saida: Match[] = [];
    for (const e of quentes) {
      const liga = String(e.key).split(":")[1] || "";
      const bruto: any = e.data;
      const eventos: any[] = Array.isArray(bruto) ? bruto : Array.isArray(bruto?.events) ? bruto.events : [];
      for (const ev of eventos) {
        try {
          const m = (ev as any)?.home?.id && (ev as any)?.away?.id ? (ev as Match) : normEvent(ev, liga);
          if (m?.id) saida.push(m);
        } catch {
          /* evento estranho: ignora, sem inventar */
        }
      }
    }
    return saida;
  };

  const vistos = new Set<string>();
  const timesVistos = new Set<string>();
  for (const m of jogosDoCache()) {
    {
      if (!m?.id) continue;
      /* O time também entra como resultado: quem busca "flamengo" quer o perfil
         do time, não só o jogo de hoje. */
      for (const lado of [m.home, m.away]) {
        const chave = `${m.league}:${lado.id}`;
        if (!lado?.id || timesVistos.has(chave)) continue;
        timesVistos.add(chave);
        candidatos.push({
          tipo: "time",
          id: chave,
          nome: lado.name,
          sub: m.leagueName,
          logo: lado.logo,
          href: `/times/${lado.id}?league=${encodeURIComponent(m.league)}`,
        });
      }
      if (vistos.has(m.id)) continue;
      vistos.add(m.id);
      candidatos.push({
        tipo: "jogo",
        id: m.id,
        nome: `${m.home.name} x ${m.away.name}`,
        sub: `${m.leagueName}${m.date ? ` · ${new Date(m.date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}`,
        href: `/jogos/${m.id}?liga=${encodeURIComponent(m.league)}`,
        aliases: [m.home.name, m.away.name, m.leagueName, m.country],
      });
    }
  }

  const resultados = buscar(q, candidatos);
  const grupos = agrupar(resultados);
  return NextResponse.json({ q, grupos, total: resultados.length });
  } catch (e: any) {
    /* Busca NUNCA derruba a navegação: se algo quebrar, devolve o contrato
       vazio e registra o motivo. */
    console.error("[search]", e?.message || e);
    return NextResponse.json({
      q: req.nextUrl.searchParams.get("q") || "",
      grupos: { times: [], ligas: [], jogos: [] },
      total: 0,
      erro: String(e?.message || e),
    });
  }
}
