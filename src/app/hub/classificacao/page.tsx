import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Info, RefreshCw, Table2, TriangleAlert, Trophy } from "lucide-react";
import TabelaClassificacao, { LegendaZonas } from "@/components/hub/TabelaClassificacao";
import { lerClassificacao, ligasComRetrato, resolverLigaId } from "@/lib/hub/standings";
import { zonasDaLiga } from "@/lib/hub/zonas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Classificação | GreenScore",
  description: "Tabela de classificação por competição, com zonas de Champions, acesso e rebaixamento e a regra de desempate aplicada.",
};

type Props = { searchParams: Promise<{ league?: string; liga?: string; stage?: string; season?: string }> };

const dataBR = (d: Date | null) => {
  if (!d) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return null;
  }
};

const nb = (v: number | null | undefined) => (v ?? 0).toLocaleString("pt-BR");

export default async function ClassificacaoPage({ searchParams }: Props) {
  const sp = await searchParams;
  const entrada = (sp.league || sp.liga || "").trim();

  /* ── 1. Quais competições têm retrato? (define o padrão e o seletor) ── */
  let ligas: Awaited<ReturnType<typeof ligasComRetrato>> = [];
  let erroLeitura: string | null = null;
  try {
    ligas = await ligasComRetrato();
  } catch (e) {
    erroLeitura = e instanceof Error ? e.message : String(e);
  }

  const padrao = ligas[0]?.externalRef || ligas[0]?.id.toString() || "bra.1";
  const alvo = entrada || padrao;

  /* ── 2. Lê o retrato gravado. Zero chamada de rede. ── */
  let dados: Awaited<ReturnType<typeof lerClassificacao>> = null;
  let leagueId: number | null = null;
  if (!erroLeitura) {
    try {
      leagueId = await resolverLigaId(alvo);
      if (leagueId) {
        dados = await lerClassificacao(leagueId, { stage: sp.stage, seasonKey: sp.season });
      }
    } catch (e) {
      erroLeitura = e instanceof Error ? e.message : String(e);
    }
  }

  const ligaAtual = ligas.find((l) => l.id === leagueId) ?? null;
  const zonas = dados
    ? zonasDaLiga({
        codigo: ligaAtual?.externalRef ?? alvo,
        nome: dados.leagueName,
        slug: dados.leagueSlug,
        fase: dados.stageName,
        totalTimes: dados.rows.length,
        isCup: dados.hasKnockout,
      })
    : [];
  const atualizado = dataBR(dados?.updatedAt ?? null);
  const totalJogos = dados?.rows.reduce((s, r) => s + r.played, 0) ?? 0;

  return (
    <div>
      <div className="flex items-start gap-2 mb-1">
        <Trophy size={20} className="text-acc mt-1 shrink-0" />
        <div className="min-w-0">
          <h1 className="font-display font-bold text-[22px] leading-tight">Classificação</h1>
          <p className="text-[11px] text-mut">
            Retrato gravado no banco · {dados ? `${dados.rows.length} times` : "sem tabela"}
            {dados?.seasonKey ? ` · temporada ${dados.seasonKey}` : ""}
            {dados && totalJogos === 0 ? " · nenhuma rodada disputada" : ""}
          </p>
        </div>
        <Link href="/hub" className="ml-auto text-[11px] font-bold text-acc shrink-0 self-center inline-flex items-center gap-1">
          <ArrowLeft size={12} /> Hub
        </Link>
      </div>

      {/* ── Seletor de competição: só ligas com retrato gravado ── */}
      {ligas.length > 1 && (
        <div className="mt-2 -mx-3 px-3 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          {ligas.map((l) => {
            const on = l.id === leagueId;
            return (
              <Link
                key={l.id}
                href={`/hub/classificacao?league=${encodeURIComponent(l.externalRef || l.id)}`}
                className={`shrink-0 px-2.5 h-7 rounded-full border text-[10px] font-bold inline-flex items-center ${
                  on ? "border-acc text-acc bg-acc/10" : "border-line text-mut"
                }`}
              >
                {l.name}
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Cabeçalho da competição + fases ── */}
      {dados && (
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <h2 className="font-display font-bold text-sm uppercase tracking-wide">{dados.leagueName}</h2>
          {ligaAtual?.countryName && <span className="text-[10px] font-bold text-mut">{ligaAtual.countryName}</span>}
          {dados.stages.filter(Boolean).length > 1 && (
            <div className="ml-auto flex gap-1.5 flex-wrap">
              {dados.stages.filter(Boolean).map((s) => (
                <Link
                  key={s}
                  href={`/hub/classificacao?league=${encodeURIComponent(ligaAtual?.externalRef || alvo)}&stage=${encodeURIComponent(s)}`}
                  className={`px-2 h-6 rounded-full border text-[10px] font-bold inline-flex items-center ${
                    s === dados?.stageName ? "border-acc text-acc" : "border-line text-mut"
                  }`}
                >
                  {s}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Estados vazios honestos ── */}
      {erroLeitura && (
        <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-3 flex gap-2">
          <TriangleAlert size={14} className="text-danger mt-0.5 shrink-0" />
          <p className="text-[11px] leading-snug">
            <span className="font-bold text-danger">Falha ao ler a classificação.</span> {erroLeitura}
          </p>
        </div>
      )}

      {!erroLeitura && !dados && (
        <div className="mt-3 rounded-xl border border-line bg-panel p-6 text-center">
          <Table2 size={22} className="mx-auto text-mut mb-2" />
          <p className="font-display font-bold">
            {ligas.length === 0 ? "Nenhuma classificação gravada ainda" : "Competição sem retrato"}
          </p>
          <p className="text-[11px] text-mut mt-1 leading-relaxed">
            {ligas.length === 0 ? (
              <>
                A tabela vive no banco e é escrita pelo job de classificação. Enquanto ele não rodar, esta tela não inventa
                números — nem usa cache do fornecedor como se fosse tabela oficial.
              </>
            ) : (
              <>
                Não há tabela gravada para <span className="font-bold text-ink">{alvo}</span> na temporada pedida. Escolha
                outra competição acima.
              </>
            )}
          </p>
          {ligas.length > 1 && (
            <Link href="/hub/classificacao" className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-acc">
              <RefreshCw size={12} /> Ver a competição mais recente
            </Link>
          )}
        </div>
      )}

      {/* ── Tabela de copa sem fase de grupos ── */}
      {dados && dados.rows.length === 0 && (
        <div className="mt-3 rounded-xl border border-line bg-panel p-6 text-center">
          <Info size={22} className="mx-auto text-mut mb-2" />
          <p className="font-display font-bold">Competição de mata-mata</p>
          <p className="text-[11px] text-mut mt-1">
            {dados.leagueName} não tem fase de grupos nesta temporada: a classificação não existe, o chaveamento sim.
          </p>
        </div>
      )}

      {/* ── A tabela ── */}
      {dados && dados.rows.length > 0 && (
        <>
          <div className="mt-2">
            <TabelaClassificacao rows={dados.rows} zonas={zonas} />
          </div>
          <LegendaZonas zonas={zonas} />

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Times", nb(dados.rows.length)],
              ["Jogos", nb(Math.round(totalJogos / 2))],
              ["Líder", dados.rows[0]?.teamName ?? "—"],
              ["Atualizado", atualizado ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-line bg-panel px-2 py-1.5 min-w-0">
                <p className="text-[9px] font-extrabold tracking-wider text-mut">{k.toUpperCase()}</p>
                <p className="text-[12px] font-bold truncate">{v}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-line bg-panel2/50 p-2.5">
            <p className="text-[10px] font-extrabold tracking-wide text-mut">COMO A ORDEM FOI CALCULADA</p>
            <p className="text-[11px] text-ink leading-snug mt-1">{dados.regraTexto}</p>
            <p className="text-[10px] text-mut mt-1">
              A posição não é copiada do fornecedor: ela é recalculada pela regra da competição a partir de pontos e
              critérios de desempate. P = pontos · J = jogos · V/E/D = vitórias, empates, derrotas · SG = saldo de gols.
            </p>
          </div>

          {!atualizado && (
            <p className="mt-2 text-[10px] text-warn">
              Retrato sem data de atualização: rode o job de classificação para marcar a hora da coleta.
            </p>
          )}
        </>
      )}
    </div>
  );
}
