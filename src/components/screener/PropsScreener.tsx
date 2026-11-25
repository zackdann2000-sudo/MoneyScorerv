"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, RotateCw } from "lucide-react";

/* =============================================================================
   SCREENER AVANÇADO — construtor de consulta + cards de resultado.

   Monta o filtro (entidade · métrica · condição · linha · janela · taxa mínima) e
   mostra quem bate no histórico. O número do card é sempre "X de N jogos" —
   frequência observada, nunca probabilidade. Cada card tem `data-testid` para o
   teste e2e do CI conferir o contrato da tela sem depender de banco.
   ========================================================================== */

type Entidade = "jogador" | "time";
type Condicao = "pelo_menos" | "abaixo";

type Metrica = {
  id: string;
  entidade: Entidade;
  label: string;
  criterio: string;
  linhaPadrao: number;
  passo: number;
  etapa: string | null;
};

type Resultado = {
  id: string;
  nome: string;
  contexto: string;
  posicao?: string;
  foto?: string | null;
  avaliacao: {
    amostra: number;
    acertos: number;
    taxa: number;
    serie: (0 | 1)[];
    sequencia: number;
    media: number;
    aprovado: boolean;
  };
};

type Resposta = {
  metrica?: { id: string; label: string; criterio: string; linha: number };
  consulta?: { descricao: string };
  resultados?: Resultado[];
  avaliados?: number;
  total?: number;
  trilha?: { banco: number; espn: number; api: number };
  semDados?: { nome: string; motivo: string }[];
  cobertura?: { jogadoresAvaliados: number; contaAtiva: boolean };
  aviso?: string;
  fonte?: string;
  error?: string;
};

const JANELAS = [3, 5, 10] as const;
const TAXAS = [60, 70, 80, 90] as const;
const LIGAS = [
  { code: "all", label: "Todas as ligas principais" },
  { code: "bra.1", label: "Brasileirão Série A" },
  { code: "bra.2", label: "Brasileirão Série B" },
  { code: "eng.1", label: "Premier League" },
  { code: "esp.1", label: "LaLiga" },
  { code: "ita.1", label: "Serie A" },
  { code: "ger.1", label: "Bundesliga" },
  { code: "fra.1", label: "Ligue 1" },
  { code: "por.1", label: "Liga Portugal" },
  { code: "uefa.champions", label: "Champions League" },
  { code: "conmebol.libertadores", label: "Libertadores" },
  { code: "mex.1", label: "Liga MX" },
  { code: "usa.1", label: "MLS" },
];

const fmtLinha = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(".", ","));

const Bolinhas = ({ serie }: { serie: (0 | 1)[] }) => (
  <span className="flex gap-0.5" aria-label={`${serie.filter((v) => v).length} de ${serie.length} jogos`}>
    {serie.map((v, i) => (
      <span key={i} className={`h-1.5 w-1.5 rounded-full ${v ? "bg-acc" : "bg-line"}`} />
    ))}
  </span>
);

export default function PropsScreener() {
  const [entidade, setEntidade] = useState<Entidade>("jogador");
  const [metrica, setMetrica] = useState("");
  const [condicao, setCondicao] = useState<Condicao>("pelo_menos");
  const [linha, setLinha] = useState(24.5);
  const [janela, setJanela] = useState<number>(5);
  const [taxaMinima, setTaxaMinima] = useState<number>(70);
  const [liga, setLiga] = useState("all");

  const [metricas, setMetricas] = useState<Metrica[]>([]);
  const [res, setRes] = useState<Resposta | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Métricas do servidor: uma chamada só, a UI nunca inventa um id. */
  useEffect(() => {
    fetch("/api/screener/props")
      .then((r) => r.json())
      .then((j) => {
        const lista: Metrica[] = j.metricas || [];
        setMetricas(lista);
        const primeira = lista.find((m) => m.entidade === "jogador");
        if (primeira) {
          setMetrica(primeira.id);
          setLinha(primeira.linhaPadrao);
        }
      })
      .catch(() => {});
  }, []);

  const daEntidade = useMemo(() => metricas.filter((m) => m.entidade === entidade), [metricas, entidade]);
  const def = useMemo(() => metricas.find((m) => m.id === metrica) ?? null, [metricas, metrica]);

  function trocarEntidade(e: Entidade) {
    setEntidade(e);
    const primeira = metricas.find((m) => m.entidade === e);
    if (primeira) {
      setMetrica(primeira.id);
      setLinha(primeira.linhaPadrao);
    }
    setRes(null);
    setErro(null);
  }

  function trocarMetrica(id: string) {
    setMetrica(id);
    const m = metricas.find((x) => x.id === id);
    if (m) setLinha(m.linhaPadrao);
  }

  async function rodar() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/screener/props", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entidade, metrica, condicao, linha, janela, taxaMinima, liga }),
      });
      const j: Resposta = await r.json();
      if (j.error) {
        setErro(j.error);
        setRes(null);
      } else {
        setRes(j);
      }
    } catch {
      setErro("Não foi possível filtrar agora. Tente de novo.");
      setRes(null);
    } finally {
      setCarregando(false);
    }
  }

  const resultados = res?.resultados || [];

  return (
    <div className="space-y-3">
      {/* ---------- montagem da consulta ---------- */}
      <section className="rounded-2xl border border-line bg-panel p-4 space-y-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-mut">Quem procurar</p>
          <div className="mt-1 grid grid-cols-2 gap-1.5">
            {(["jogador", "time"] as const).map((e) => (
              <button
                key={e}
                data-testid={`entidade-${e}`}
                onClick={() => trocarEntidade(e)}
                aria-pressed={entidade === e}
                className={`h-9 rounded-xl border text-[11px] font-extrabold uppercase tracking-wide transition-colors ${
                  entidade === e ? "border-acc bg-acc/15 text-acc" : "border-line bg-panel2 text-mut"
                }`}
              >
                {e === "jogador" ? "Jogadores" : "Times"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 block">
            <span className="text-[9px] font-black uppercase tracking-widest text-mut">Métrica</span>
            <select
              data-testid="metrica"
              value={def?.id ?? ""}
              onChange={(e) => trocarMetrica(e.target.value)}
              className="mt-1 w-full bg-panel2 border border-line rounded-xl px-2 h-9 text-[11px] font-bold text-ink"
            >
              {daEntidade.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase tracking-widest text-mut">Condição</span>
            <select
              data-testid="condicao"
              value={condicao}
              onChange={(e) => setCondicao(e.target.value as Condicao)}
              className="mt-1 w-full bg-panel2 border border-line rounded-xl px-2 h-9 text-[11px] font-bold text-ink"
            >
              <option value="pelo_menos">Pelo menos X</option>
              <option value="abaixo">Abaixo de X</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[9px] font-black uppercase tracking-widest text-mut">Linha (X)</span>
            <input
              data-testid="linha"
              type="number"
              inputMode="decimal"
              min={0}
              max={50}
              step={def?.passo ?? 0.5}
              value={linha}
              onChange={(e) => setLinha(Number(e.target.value))}
              className="mt-1 w-full bg-panel2 border border-line rounded-xl px-2 h-9 text-[11px] font-bold text-ink tabular-nums"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-mut">Janela</p>
            <div className="mt-1 flex gap-1.5">
              {JANELAS.map((n) => (
                <button
                  key={n}
                  data-testid={`janela-${n}`}
                  onClick={() => setJanela(n)}
                  aria-pressed={janela === n}
                  className={`flex-1 h-9 rounded-xl border text-[11px] font-extrabold ${
                    janela === n ? "border-acc bg-acc/15 text-acc" : "border-line bg-panel2 text-mut"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-mut">Taxa mínima</p>
            <div className="mt-1 flex gap-1.5">
              {TAXAS.map((t) => (
                <button
                  key={t}
                  data-testid={`taxa-${t}`}
                  onClick={() => setTaxaMinima(t)}
                  aria-pressed={taxaMinima === t}
                  className={`flex-1 h-9 rounded-xl border text-[11px] font-extrabold tabular-nums ${
                    taxaMinima === t ? "border-acc bg-acc/15 text-acc" : "border-line bg-panel2 text-mut"
                  }`}
                >
                  {t}%
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-widest text-mut">Liga / rodada</span>
          <select
            data-testid="liga"
            value={liga}
            onChange={(e) => setLiga(e.target.value)}
            className="mt-1 w-full bg-panel2 border border-line rounded-xl px-2 h-9 text-[11px] font-bold text-ink"
          >
            {LIGAS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <button
          data-testid="filtrar"
          onClick={rodar}
          disabled={carregando || !def}
          className="w-full h-10 rounded-xl bg-acc text-black text-[12px] font-black uppercase tracking-wide inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
        >
          {carregando ? <Loader2 size={14} className="animate-spin" /> : res ? <RotateCw size={14} /> : <Play size={14} />}
          {carregando ? "Filtrando…" : "Filtrar"}
        </button>

        {def && (
          <p className="text-[9px] leading-snug text-mut">
            Conta: {def.criterio}. Só entra quem tem pelo menos 3 jogos com o dado na janela.
            {def.etapa === "B" && " Esta métrica exige o resumo de cada jogo: varremos menos times por vez."}
          </p>
        )}
      </section>

      {/* ---------- estados ---------- */}
      {erro && (
        <div data-testid="erro" className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-[11px] font-bold text-danger">
          {erro}
        </div>
      )}

      {carregando && !res && (
        <div className="space-y-2">
          <div className="skeleton h-16" />
          <div className="skeleton h-16" />
        </div>
      )}

      {/* ---------- resultado ---------- */}
      {res && !erro && (
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p data-testid="resumo" className="text-[10px] font-bold text-mut">
              {res.total ?? 0} {res.total === 1 ? "resultado" : "resultados"} · {res.avaliados ?? 0} times avaliados
            </p>
            <span className="text-[9px] font-bold text-mut">{res.fonte}</span>
          </div>

          {res.consulta?.descricao && (
            <p data-testid="descricao" className="text-[10px] leading-snug text-acc/90">
              {res.consulta.descricao}
            </p>
          )}

          {resultados.length === 0 && (
            <div data-testid="vazio" className="rounded-2xl border border-line bg-panel p-4">
              <p className="text-[12px] font-bold text-ink">Nenhum {entidade} bateu esse filtro.</p>
              <p className="mt-1 text-[10px] leading-snug text-mut">
                Tente janela maior, taxa mínima menor ou outra liga. A fonte às vezes não tem estatística
                individual desta rodada — nesse caso o candidato não é publicado, em vez de aparecer com 0.
              </p>
              {!!res.semDados?.length && (
                <p className="mt-2 text-[9px] text-mut/80">
                  Sem dado: {res.semDados.map((s) => s.nome).join(" · ")}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            {resultados.map((r) => (
              <article
                key={r.id}
                data-testid="resultado"
                className="rounded-xl border border-line bg-panel px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  {r.foto ? (
                    <img src={r.foto} alt="" className="h-8 w-8 shrink-0 rounded-full border border-line object-cover" />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p data-testid="resultado-nome" className="truncate text-[12px] font-extrabold text-ink">
                      {r.nome}
                    </p>
                    <p className="truncate text-[9px] font-bold text-mut">
                      {r.contexto}
                      {r.posicao ? ` · ${r.posicao}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p data-testid="resultado-taxa" className="font-display text-xl font-black leading-none text-acc tabular-nums">
                      {r.avaliacao.taxa}%
                    </p>
                    <p data-testid="resultado-contagem" className="text-[9px] font-bold text-mut tabular-nums">
                      {r.avaliacao.acertos} de {r.avaliacao.amostra}
                    </p>
                  </div>
                </div>

                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <Bolinhas serie={r.avaliacao.serie} />
                  <p data-testid="resultado-sequencia" className="text-[9px] font-bold text-mut">
                    {r.avaliacao.sequencia > 0 ? `🔒 ${r.avaliacao.sequencia} seguida${r.avaliacao.sequencia > 1 ? "s" : ""}` : "sequência quebrada"}
                    {" · "}média {fmtLinha(r.avaliacao.media)}
                  </p>
                </div>
              </article>
            ))}
          </div>

          {!!res.semDados?.length && resultados.length > 0 && (
            <p className="text-[9px] leading-snug text-mut/80">
              Sem dado nesta consulta: {res.semDados.map((s) => `${s.nome} (${s.motivo})`).join(" · ")}
            </p>
          )}

          {res.aviso && <p data-testid="aviso" className="text-[9px] leading-snug text-mut/70">{res.aviso}</p>}
        </section>
      )}
    </div>
  );
}
