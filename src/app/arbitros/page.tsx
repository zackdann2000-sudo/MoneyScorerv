import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowUpDown, CalendarClock, Gauge, Users, Whistle } from "lucide-react";
import { EmptyState, SourceFoot } from "@/components/ui";
import type { OrdemArbitro } from "@/lib/arbitros";
import { montarLista } from "@/lib/arbitrosFonte";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Árbitros | GreenScore",
  description:
    "Média de cartões, faltas e pênaltis por jogo de cada árbitro, com o próximo jogo apitado e o histórico de partidas.",
};

type Props = { searchParams: Promise<{ q?: string; ordem?: string; dir?: string; so?: string; min?: string }> };

const ORDENS: { id: OrdemArbitro; rotulo: string }[] = [
  { id: "cartoes", rotulo: "Cartões/jogo" },
  { id: "amarelos", rotulo: "Amarelos" },
  { id: "vermelhos", rotulo: "Vermelhos" },
  { id: "faltas", rotulo: "Faltas" },
  { id: "penaltis", rotulo: "Pênaltis" },
  { id: "jogos", rotulo: "Jogos" },
  { id: "nome", rotulo: "Nome" },
];

const n2 = (v: number | null) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dataBR = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
};

/** Monta o href preservando os outros filtros (mesmo padrão de /rankings). */
function href(atual: Record<string, string | undefined>, patch: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  const next = { ...atual, ...patch };
  for (const [k, v] of Object.entries(next)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `/arbitros?${s}` : "/arbitros";
}

export default async function ArbitrosPage({ searchParams }: Props) {
  const sp = await searchParams;
  const ordem = (ORDENS.find((o) => o.id === sp.ordem)?.id ?? "cartoes") as OrdemArbitro;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const soComProximoJogo = sp.so === "1";
  const min = Math.max(0, Number(sp.min ?? 0) || 0);
  const q = (sp.q ?? "").trim();

  /* Leitura direta (sem fetch): banco do módulo + cache do feed do apitou.
     A agregação (que usa o relógio) fica na lib, não no render. */
  let erro: string | null = null;
  let montado: Awaited<ReturnType<typeof montarLista>> | null = null;
  try {
    montado = await montarLista({ q, soComProximoJogo, ordem, dir, minJogos: min || undefined });
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  const dados = montado?.dados ?? null;
  const lista = montado?.lista ?? [];
  const resumo = montado?.resumo ?? { total: 0, comProximoJogo: 0, comMedia: 0, jogosNaBase: 0 };
  const filtrosAtuais = { q: q || undefined, ordem, dir, so: soComProximoJogo ? "1" : undefined, min: min ? String(min) : undefined };

  return (
    <div>
      <div className="flex items-start gap-2 mb-1">
        <Whistle size={20} className="text-acc mt-1 shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display font-bold text-[22px] leading-tight">Árbitros</h1>
          <p className="text-[11px] text-mut">
            {resumo.total} árbitro{resumo.total === 1 ? "" : "s"} · {resumo.comProximoJogo} com jogo futuro ·{" "}
            {resumo.comMedia} com média de cartões
          </p>
        </div>
        <Link href="/hub" className="ml-auto text-[11px] font-bold text-acc shrink-0 self-center inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Hub
        </Link>
      </div>

      {/* Busca por nome (GET, sem JS: mesma convenção das outras telas) */}
      <form action="/arbitros" className="mt-3 flex gap-1.5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar árbitro…"
          className="flex-1 h-9 rounded-lg border border-line bg-panel px-2.5 text-[12px] placeholder:text-mut/70"
        />
        <input type="hidden" name="ordem" value={ordem} />
        {soComProximoJogo && <input type="hidden" name="so" value="1" />}
        {min ? <input type="hidden" name="min" value={String(min)} /> : null}
        <button className="h-9 px-3 rounded-lg bg-acc text-[12px] font-bold text-black">Buscar</button>
      </form>

      {/* Ordenação + toggles */}
      <div className="mt-2 -mx-3 px-3 overflow-x-auto no-scrollbar">
        <div className="flex gap-1.5 pb-1">
          {ORDENS.map((o) => {
            const on = o.id === ordem;
            const proximaDir = on && dir === "desc" ? "asc" : "desc";
            return (
              <Link
                key={o.id}
                href={href(filtrosAtuais, { ordem: o.id, dir: proximaDir })}
                className={`shrink-0 px-2.5 h-7 rounded-full border text-[10px] font-bold inline-flex items-center gap-1 ${
                  on ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
                }`}
              >
                {o.rotulo}
                {on && <ArrowUpDown size={10} className={dir === "asc" ? "rotate-180" : ""} />}
              </Link>
            );
          })}
          <Link
            href={href(filtrosAtuais, { so: soComProximoJogo ? undefined : "1" })}
            className={`shrink-0 px-2.5 h-7 rounded-full border text-[10px] font-bold inline-flex items-center gap-1 ${
              soComProximoJogo ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
            }`}
          >
            <CalendarClock size={10} /> Só com próximo jogo
          </Link>
          <Link
            href={href(filtrosAtuais, { min: min === 5 ? undefined : "5" })}
            className={`shrink-0 px-2.5 h-7 rounded-full border text-[10px] font-bold inline-flex items-center gap-1 ${
              min === 5 ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
            }`}
          >
            <Gauge size={10} /> Amostra 5+
          </Link>
        </div>
      </div>

      {erro && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-[11px]">
          Falha ao ler os árbitros: {erro}
        </div>
      )}

      {!erro && lista.length === 0 && (
        <div className="mt-4">
          <EmptyState
            title="Nenhum árbitro na base"
            sub="A tabela é alimentada pelo sync diário (apitou + banco próprio). Rode o cron ?acao=apitou para popular."
            actionHref="/hub"
            actionLabel="Voltar ao Hub"
          />
        </div>
      )}

      {lista.length > 0 && (
        <div className="mt-3 rounded-xl border border-line bg-panel overflow-hidden">
          {/* Cabeçalho */}
          <div className="grid grid-cols-[1fr_repeat(4,minmax(0,42px))] gap-1 px-2.5 py-2 bg-panel2/60 text-[9px] font-bold uppercase tracking-wide text-mut">
            <span>Árbitro</span>
            <span className="text-center">J</span>
            <span className="text-center">Am</span>
            <span className="text-center">Vm</span>
            <span className="text-center">Ft</span>
          </div>

          {lista.map((a) => (
            <Link
              key={a.slug}
              href={`/arbitros/${a.slug}`}
              className="grid grid-cols-[1fr_repeat(4,minmax(0,42px))] gap-1 px-2.5 py-2 border-t border-line items-center hover:bg-panel2/40"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-bold truncate">{a.nome}</div>
                <div className="text-[9px] text-mut truncate">
                  {a.proximoJogo ? (
                    <span className="text-acc2">
                      {a.proximoJogo.home} x {a.proximoJogo.away} · {dataBR(a.proximoJogo.data)}
                    </span>
                  ) : a.ultimoJogo ? (
                    `último: ${dataBR(a.ultimoJogo)}`
                  ) : (
                    "sem jogo registrado"
                  )}
                  {a.amostraCurta && <span className="text-warn"> · amostra curta</span>}
                </div>
              </div>
              <span className="text-center text-[11px] tabular-nums">{a.jogos || "—"}</span>
              <span className="text-center text-[11px] tabular-nums font-bold">{n2(a.medias.amarelos)}</span>
              <span className="text-center text-[11px] tabular-nums">{n2(a.medias.vermelhos)}</span>
              <span className="text-center text-[11px] tabular-nums">{n2(a.medias.faltas)}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Legenda honesta sobre a base da média */}
      {lista.length > 0 && (
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-mut">
          <Users size={11} className="mt-0.5 shrink-0" />
          <p>
            J = jogos na base · Am/Vm/Ft = amarelos, vermelhos e faltas médios por jogo · a média usa o agregado
            publicado pela fonte quando existe; senão, só os jogos que nós registramos (marcados como “amostra curta”
            abaixo de 5).
          </p>
        </div>
      )}

      <SourceFoot
        fonte="apitou + banco próprio"
        amostra={resumo.jogosNaBase}
        extra={
          dados?.origem === "banco+apitou"
            ? "feed + histórico acumulado"
            : dados?.origem === "banco"
              ? "histórico acumulado"
              : dados?.origem === "apitou"
                ? "feed do dia (histórico ainda vazio)"
                : "sem dado"
        }
      />

      <div className="mt-3 rounded-xl border border-line bg-panel p-2.5 text-[10px] text-mut">
        <p className="font-bold text-ink text-[11px] mb-1">Como ler</p>
        <p>
          Média alta de cartões em base grande é o insumo do mercado de disciplina. Média em base curta (menos de 5
          jogos) não sustenta decisão: a própria tabela marca. O pênalti e a falta ficam em “—” quando a fonte não
          publica o número — <span className="text-ink">nunca são tratados como zero</span>.
        </p>
        <p className="mt-1">
          Ordenação atual: <span className="text-acc">{ORDENS.find((o) => o.id === ordem)?.rotulo}</span>{" "}
          {dir === "asc" ? "crescente" : "decrescente"} · horários em Brasília.
        </p>
      </div>
    </div>
  );
}
