"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DateStrip7 from "@/components/DateStrip7";
import { hojeYmd } from "@/lib/semana";

type Linha = { code: string; name: string; country: string; n: number; live: number };

/**
 * Lista de ligas com a contagem de jogos do dia escolhido.
 *
 * A data vive na URL (`?data=YYYY-MM-DD`), exatamente como na tela de Jogos:
 *  - clicar num dia troca o estado E escreve na URL (`router.replace`);
 *  - voltar/avançar do browser (ou link colado) reflete no estado;
 *  - abrir uma liga leva para `/jogos?liga=..&data=..` — a tela que realmente
 *    lista os jogos daquele dia (antes o link ia para `/`, a landing pública,
 *    que ignorava os parâmetros e o usuário "não via os jogos atualizarem").
 *
 * O estado de carregamento é DERIVADO (`loadedDate !== date`) em vez de
 * `setRows(null)` dentro do efeito — a regra `react-hooks/set-state-in-effect`
 * proíbe mutação síncrona de estado no corpo de um efeito. O `fetch` usa
 * `no-store` para o navegador nunca devolver a contagem de outro dia.
 */
const dataValida = (v: string | null | undefined): v is string =>
  !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default function LigasClient({ initialDate }: { initialDate: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlData = searchParams.get("data");

  const [date, setDate] = useState(dataValida(initialDate) ? initialDate : hojeYmd());
  const [rows, setRows] = useState<Linha[] | null>(null);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let vivo = true;
    setErr("");
    fetch(`/api/matches?date=${date}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        const map = new Map<string, Linha>();
        for (const m of j.matches || []) {
          const cur = map.get(m.league) || { code: m.league, name: m.leagueName, country: m.country, n: 0, live: 0 };
          cur.n++;
          if (m.live) cur.live++;
          map.set(m.league, cur);
        }
        setRows([...map.values()].sort((a, b) => b.live - a.live || b.n - a.n || a.country.localeCompare(b.country)));
        setLoadedDate(date);
      })
      .catch(() => {
        if (!vivo) return;
        setErr("Falha ao carregar as ligas.");
        setRows([]);
        setLoadedDate(date);
      });
    return () => {
      vivo = false;
    };
  }, [date]);

  /* URL mudou (browser voltar/avançar ou link colado) -> reflete no estado. */
  useEffect(() => {
    if (dataValida(urlData) && urlData !== date) setDate(urlData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlData]);

  const mudarDia = useCallback(
    (ymd: string) => {
      setErr("");
      setDate(ymd);
      // Mesma convenção da tela de Jogos: replace (não empilha histórico).
      router.replace(`${pathname}?data=${ymd}`, { scroll: false });
    },
    [router, pathname],
  );

  const carregando = loadedDate !== date;
  const [, mm, dd] = date.split("-");
  const rotuloData = `${dd}/${mm}`;

  return (
    <div>
      <h1 className="font-display font-bold text-[22px] mb-2">Ligas</h1>
      <p className="text-[11px] text-mut mb-2">Contagem de jogos por liga em {rotuloData}, mesma consulta da lista de jogos.</p>
      <DateStrip7 value={date} onChange={mudarDia} />
      {carregando && !err && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-12" />)}
        </div>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
      {!carregando && (rows || []).map((l) => (
        <Link key={l.code} href={`/jogos?liga=${encodeURIComponent(l.code)}&data=${date}`} className="flex items-center gap-3 h-14 border-b border-line">
          <span className="w-8 text-[10px] font-bold text-mut">{l.country.slice(0, 2).toUpperCase()}</span>
          <span className="flex-1 min-w-0"><span className="block text-[10px] uppercase text-mut">{l.country}</span><span className="block text-sm font-bold truncate">{l.name}</span></span>
          {l.live > 0 && <span className="min-w-6 h-5 px-1 rounded-full bg-live text-white text-[11px] font-bold flex items-center justify-center">{l.live}</span>}
          <span className="text-sm tabular-nums text-mut w-6 text-right">{l.n}</span>
        </Link>
      ))}
      {!carregando && rows && rows.length === 0 && !err && (
        <p className="text-sm text-mut py-8 text-center">Nenhuma liga com jogo em {rotuloData} na fonte.</p>
      )}
    </div>
  );
}
