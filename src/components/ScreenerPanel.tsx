"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, RotateCw } from "lucide-react";
import DateStrip, { toYmd } from "@/components/DateStrip";
import { Crest, SourceFoot } from "@/components/ui";

/* =============================================================================
   SCREENER — "quais jogos de hoje batem estes mercados no histórico".

   Duas etapas, por custo de fornecedor:
   • A (padrão): só placar — 1 request por time.
   • B (opcional): cantos/cartões/impedimentos — exige summary de cada jogo, por
     isso o teto é 8 jogos por consulta. Acima disso a resposta vem `truncado` e
     o usuário refina por liga (nunca deixamos a tela esperando 20 s).

   O número exibido é sempre "X de N jogos" — frequência, não previsão.
   ========================================================================== */

type Mercado = { id: string; label: string; etapa: "A" | "B"; criterio: string; linha: number };
type Lado = { acertos: number; total: number; pct: number | null; serie: (0 | 1)[]; semMando?: boolean };
type Avaliado = {
  match: { id: string; league: string; leagueName: string; flag: string; country: string; date: string; state: string; home: { id: string; name: string; logo: string }; away: { id: string; name: string; logo: string } };
  avaliacao: { aprovados: string[]; score: number; mercados: { id: string; label: string; pct: number | null; criterio: string; lados: { casa?: Lado; fora?: Lado } }[] };
  amostraCasa: number;
  amostraFora: number;
};

const bolinhas = (serie: (0 | 1)[]) => (
  <span className="flex gap-0.5">
    {serie.map((v, i) => (
      <span key={i} className={`w-1.5 h-1.5 rounded-full ${v ? "bg-acc" : "bg-line"}`} />
    ))}
  </span>
);

export default function ScreenerPanel() {
  const [mercados, setMercados] = useState<Mercado[]>([]);
  const [ligas, setLigas] = useState<{ code: string; name: string; flag: string }[]>([]);
  const [sel, setSel] = useState<string[]>(["btts", "over_1_5", "over_2_5", "ht_over_0_5", "casa_vence", "visitante_vence"]);
  const [liga, setLiga] = useState("all");
  const [amostra, setAmostra] = useState<5 | 10>(10);
  const [data, setData] = useState(toYmd(new Date()));
  const [res, setRes] = useState<any>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/screener")
      .then((r) => r.json())
      .then((j) => setMercados(j.mercados || []))
      .catch(() => {});
    fetch("/api/detector")
      .then((r) => r.json())
      .then((j) => setLigas(j.leagues || []))
      .catch(() => {});
  }, []);

  const etapaB = useMemo(() => mercados.some((m) => sel.includes(m.id) && m.etapa === "B"), [mercados, sel]);

  const alternar = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function rodar() {
    if (!sel.length) return;
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/screener", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: data.replace(/-/g, ""), liga, amostra, mercados: sel }),
      });
      const j = await r.json();
      if (j.error) setErro(j.error);
      else setRes(j);
    } catch {
      setErro("Não foi possível filtrar agora. Tente de novo.");
    } finally {
      setCarregando(false);
    }
  }

  const jogos: Avaliado[] = res?.jogos || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-display font-black uppercase tracking-wide text-sm">Screener</h2>
          <p className="text-[10px] text-mut">Jogos que batem os mercados escolhidos no histórico recente.</p>
        </div>
        <div className="flex bg-panel border border-line rounded-full p-0.5 shrink-0">
          {([5, 10] as const).map((n) => (
            <button key={n} onClick={() => setAmostra(n)} className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${amostra === n ? "bg-acc text-black" : "text-mut"}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <DateStrip value={data} onChange={setData} days={4} />

      {/* mercados */}
      <div className="space-y-1.5">
        <p className="text-[9px] font-black uppercase tracking-widest text-mut">Mercados</p>
        <div className="flex flex-wrap gap-1.5">
          {mercados.map((m) => {
            const on = sel.includes(m.id);
            return (
              <button
                key={m.id}
                onClick={() => alternar(m.id)}
                title={m.criterio}
                className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border transition-colors ${on ? "bg-acc text-black border-acc" : "bg-panel border-line text-mut"}`}
              >
                {m.label}
                {m.etapa === "B" && <span className={`ml-1 text-[8px] ${on ? "text-black/60" : "text-warn"}`}>COMPLETO</span>}
              </button>
            );
          })}
        </div>
        {etapaB && (
          <p className="text-[9px] text-warn bg-warn/10 border border-warn/25 rounded-lg px-2 py-1.5">
            Cantos, cartões e impedimentos exigem análise completa: até 8 jogos por vez. Se faltar jogo, filtre por liga.
          </p>
        )}
      </div>

      {/* liga + ação */}
      <div className="flex gap-1.5">
        <select
          value={liga}
          onChange={(e) => setLiga(e.target.value)}
          className="flex-1 bg-panel border border-line rounded-xl px-2 h-9 text-[11px] font-bold text-ink min-w-0"
          aria-label="Filtrar por liga"
        >
          <option value="all">Todas as ligas principais</option>
          {ligas.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
        <button
          onClick={rodar}
          disabled={carregando || !sel.length}
          className="shrink-0 h-9 px-4 rounded-xl bg-acc text-black text-[11px] font-extrabold disabled:opacity-50 flex items-center gap-1.5"
        >
          {carregando ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
          FILTRAR
        </button>
      </div>

      {/* resultado */}
      {erro && <p className="text-center text-xs text-danger py-3">{erro}</p>}

      {res && !erro && (
        <>
          <div className="flex items-center justify-between text-[10px] text-mut px-0.5">
            <span>
              <b className="text-ink">{jogos.length}</b> jogo(s) com mercado aprovado · {res.total} analisado(s)
            </span>
            <span>{res.etapa === "B" ? "análise completa" : "análise rápida"}</span>
          </div>

          {res.truncado && (
            <p className="text-[9px] text-warn bg-warn/10 border border-warn/25 rounded-lg px-2 py-1.5">
              Mostrando os primeiros {res.teto} jogos da rodada. Filtre por liga para ver os demais.
            </p>
          )}

          {jogos.length === 0 && (
            <p className="text-center text-xs text-mut py-6">
              Nenhum jogo bateu os mercados escolhidos nesta rodada. Tente 5 jogos de amostra ou outra liga.
            </p>
          )}

          <div className="space-y-2">
            {jogos.map((j) => (
              <div key={j.match.id} className="bg-panel border border-line rounded-2xl p-3">
                <div className="flex items-center gap-1 text-[9px] text-mut mb-1.5">
                  <span>{j.match.flag}</span>
                  <span className="font-bold uppercase truncate">{j.match.leagueName}</span>
                  <span>·</span>
                  <span>
                    {new Date(j.match.date).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-2">
                  <div className="flex items-center gap-1.5 min-w-0"><Crest src={j.match.home.logo} size={20} /><span className="text-[11px] font-bold truncate">{j.match.home.name}</span></div>
                  <span className="text-[9px] text-mut font-bold">vs</span>
                  <div className="flex items-center gap-1.5 min-w-0 justify-end"><span className="text-[11px] font-bold truncate">{j.match.away.name}</span><Crest src={j.match.away.logo} size={20} /></div>
                </div>

                <div className="space-y-1">
                  {j.avaliacao.mercados
                    .filter((m) => j.avaliacao.aprovados.includes(m.id))
                    .map((m) => (
                      <div key={m.id} className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-acc font-extrabold shrink-0">{m.pct}%</span>
                        <span className="font-bold truncate flex-1">{m.label}</span>
                        {m.lados.casa && <span className="text-mut shrink-0">{m.lados.casa.acertos}/{m.lados.casa.total}</span>}
                        {m.lados.casa && bolinhas(m.lados.casa.serie)}
                        {m.lados.fora && <span className="text-mut shrink-0">{m.lados.fora.acertos}/{m.lados.fora.total}</span>}
                        {m.lados.fora && bolinhas(m.lados.fora.serie)}
                      </div>
                    ))}
                </div>

                <Link href={`/jogos/${j.match.id}?liga=${encodeURIComponent(j.match.league)}`} className="mt-2 flex items-center justify-center h-8 rounded-lg bg-panel2 border border-line text-[10px] font-extrabold text-acc">
                  VER TUDO →
                </Link>
              </div>
            ))}
          </div>

          <SourceFoot fonte="ESPN" amostra={res.amostra} extra="Frequência nos últimos jogos · não é previsão" />
        </>
      )}

      {!res && !carregando && !erro && (
        <p className="text-[10px] text-mut text-center py-4">Escolha os mercados e toque em FILTRAR.</p>
      )}
    </div>
  );
}
