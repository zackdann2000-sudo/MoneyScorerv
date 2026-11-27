import { sql } from "drizzle-orm";
import { db } from "@/db";
import { hubBookmakerOdd, hubFixture, hubLineup } from "@/db/hub-schema";

/**
 * Diagnóstico de PIPELINE — responde "o app vai abrir vazio?" sem abrir o app.
 *
 * Só leitura: roda queries no Neon e, opcionalmente (`ping`), UMA chamada à
 * fonte pública. Pensado para o cron (`?acao=pipeline`) servir de sonda depois
 * do sync diário, e para rodar na mão (`ping=1`) quando alguém acha a tela vazia.
 *
 * Nenhum valor de segredo entra aqui — apenas "existe / não existe".
 */
export type PipelineHealth = {
  ok: boolean;
  agora: string;
  /** Uma linha por dia: -1 (ontem) até +3. */
  fixturesPorDia: { dia: string; total: number; aoVivo: number }[];
  total: number;
  comOdd: number;
  comEscalacao: number;
  /** Última escrita de fixture (mostra se o sync rodou mesmo). */
  ultimaEscrita: string | null;
  /** Horizonte: jogos futuros já gravados. */
  futuros: number;
  /**
   * As chaves EXISTEM no ambiente? (Não diz se a fonte RESPONDE — ver `contas`.)
   * Antes este campo era lido como "fonte funcionando", e uma conta suspensa
   * continuava aparecendo como `true`.
   */
  fontes: Record<string, boolean>;
  /**
   * Estado REAL da conta, só quando `ping` é pedido (usa `/status`, que não
   * consome cota). `env: true` + `status: "suspensa"` = chave existe, fonte
   * não entrega — a diferença que o painel não sabia fazer.
   */
  contas?: Record<string, { env: boolean; status: "ok" | "suspensa" | "sem-chave" | "erro"; plano?: string | null; erro?: string }>;
  ping?: { ok: boolean; jogos: number; ms: number; erro?: string };
  /** Falso quando não há fixture nenhuma para hoje/amanhã → tela vazia provável. */
  cobertura: "ok" | "magra" | "vazia";
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function diagnosticarPipeline(opts: { ping?: boolean } = {}): Promise<PipelineHealth> {
  const agora = new Date();

  const porDia = await db
    .select({
      dia: sql<string>`to_char(${hubFixture.matchDate} at time zone 'UTC', 'YYYY-MM-DD')`,
      total: sql<number>`count(*)::int`,
      aoVivo: sql<number>`count(*) filter (where ${hubFixture.liveState} in ('1H','2H','HT','ET','P','LIVE'))::int`,
    })
    .from(hubFixture)
    .where(sql`${hubFixture.matchDate} >= ${ymd(new Date(agora.getTime() - 86400_000))}::date - interval '1 day'`)
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(hubFixture);
  const [{ comOdd }] = await db
    .select({ comOdd: sql<number>`count(distinct ${hubBookmakerOdd.fixtureId})::int` })
    .from(hubBookmakerOdd);
  const [{ comXi }] = await db
    .select({ comXi: sql<number>`count(*)::int` })
    .from(hubLineup)
    .where(sql`${hubLineup.confirmed} = true`);
  const [{ ultima }] = await db
    .select({ ultima: sql<string | null>`max(${hubFixture.updatedAt})::text` })
    .from(hubFixture);
  const [{ futuros }] = await db
    .select({ futuros: sql<number>`count(*)::int` })
    .from(hubFixture)
    .where(sql`${hubFixture.matchDate} >= now()`);

  /* Cobertura olha os dois dias que importam para o usuário: hoje e amanhã
     (UTC — a fonte agrupa por dia UTC; margem de 1 dia cobre a diferença). */
  const hoje = ymd(agora);
  const amanha = ymd(new Date(agora.getTime() + 86400_000));
  const nosDois = porDia.filter((d) => d.dia === hoje || d.dia === amanha).reduce((s, d) => s + d.total, 0);
  const cobertura: PipelineHealth["cobertura"] = nosDois === 0 ? "vazia" : nosDois < 10 ? "magra" : "ok";

  const fontes: Record<string, boolean> = {
    // ESPN é pública (sem chave). As demais dependem de segredo no ambiente.
    espn: true,
    footballdata: Boolean(process.env.FOOTBALL_DATA_TOKEN),
    sportmonks: Boolean(process.env.SPORTMONKS_TOKEN),
    apiFootball: Boolean(process.env.API_FOOTBALL_KEY),
    bzzoiro: Boolean(process.env.BZZOIRO_TOKEN),
  };

  const out: PipelineHealth = {
    ok: cobertura !== "vazia",
    agora: agora.toISOString(),
    fixturesPorDia: porDia,
    total,
    comOdd,
    comEscalacao: comXi,
    ultimaEscrita: ultima,
    futuros,
    fontes,
    cobertura,
  };

  if (opts.ping) {
    const t0 = Date.now();
    try {
      // Import dinâmico: o diagnóstico do banco não deve carregar a fonte
      // (nem tocar a rede) quando ninguém pediu ping.
      const { getAllMatches, todayYmd } = await import("@/lib/espn");
      const jogos = await getAllMatches(todayYmd());
      out.ping = { ok: jogos.length > 0, jogos: jogos.length, ms: Date.now() - t0 };
    } catch (e: any) {
      out.ping = { ok: false, jogos: 0, ms: Date.now() - t0, erro: String(e?.message || e).slice(0, 160) };
    }

    /* Conta da API-Football: `/status` não consome cota. Sem isto, uma conta
       suspensa continuava sendo reportada como "configurada" só porque a env
       existia — e o Screener/Props pareciam vazios "por falta de dado". */
    const contas: NonNullable<PipelineHealth["contas"]> = {};
    try {
      const { afStatus } = await import("@/lib/providers");
      const st = await afStatus();
      contas.apiFootball = { env: fontes.apiFootball, status: "ok", plano: st.plan ?? null };
    } catch (e: any) {
      const msg = String(e?.message || e);
      const semChave = !fontes.apiFootball || /não configurada/i.test(msg);
      const suspensa = /suspend/i.test(msg);
      contas.apiFootball = {
        env: fontes.apiFootball,
        status: semChave ? "sem-chave" : suspensa ? "suspensa" : "erro",
        erro: msg.slice(0, 160),
      };
    }
    out.contas = contas;
  }

  return out;
}
