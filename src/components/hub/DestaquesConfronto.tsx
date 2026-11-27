"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldAlert, Users } from "lucide-react";
import type { DestaqueGrupo, DestaqueJogador } from "@/lib/playerPropsEngine";

type Amostra = {
  janela: number;
  casa: number;
  fora: number;
  temporadaCasa: number | null;
  temporadaFora: number | null;
};

type Resposta = {
  grupos?: DestaqueGrupo[];
  amostra?: Amostra;
  fontes?: { casa: string | null; fora: string | null };
  semDados?: boolean;
  exclusivo?: boolean;
  motivo?: string | null;
  desativado?: boolean;
  error?: string;
  erro?: string;
};

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

function Avatar({ nome, foto }: { nome: string; foto: string | null }) {
  const [erro, setErro] = useState(false);
  if (!foto || erro) {
    return (
      <div className="w-8 h-8 rounded-full bg-panel2 border border-line flex items-center justify-center text-[10px] font-extrabold text-mut shrink-0">
        {iniciais(nome) || "?"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={foto}
      alt={nome}
      width={32}
      height={32}
      loading="lazy"
      onError={() => setErro(true)}
      className="w-8 h-8 rounded-full object-cover border border-line bg-panel2 shrink-0"
    />
  );
}

const JANELAS_CARD: { id: keyof DestaqueJogador["acerto"]; n: number }[] = [
  { id: "l3", n: 3 },
  { id: "l5", n: 5 },
  { id: "l10", n: 10 },
];

function LinhaDestaque({ item }: { item: DestaqueJogador }) {
  // Janela default = L10, a mesma do card de Player Props.
  const [janela, setJanela] = useState<"l3" | "l5" | "l10">("l10");
  const pctBarra = Math.round(item.barra * 100);
  const pctFreq = item.frequencia != null ? Math.round(item.frequencia * 100) : null;
  const sel = item.acerto[janela];
  const detalhe = sel ? `${sel.acertos}/${sel.amostra} Over ${item.linhaReferencia}` : "sem amostra";

  return (
    <div className="py-1.5 border-t border-line first:border-t-0">
      <div className="flex items-center gap-2">
        <Avatar nome={item.nome} foto={item.foto} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-bold text-ink truncate">{item.nome}</span>
            <span className={`text-[8px] font-extrabold px-1 rounded shrink-0 ${item.lado === "home" ? "text-home bg-home/10" : "text-away bg-away/10"}`}>
              {item.lado === "home" ? "CASA" : "FORA"}
            </span>
            <span className="ml-auto shrink-0 tabular-nums">
              {item.suficiente && item.media != null ? (
                <>
                  <span className="text-[12px] font-extrabold text-acc">{item.media.toFixed(1)}</span>
                  <span className="text-[9px] font-bold text-mut">/jogo</span>
                </>
              ) : (
                <span className="text-[10px] font-bold text-warn">—</span>
              )}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <span className="text-[9px] text-mut truncate max-w-[42%]">
              {item.time}
              <span className="text-mut/70"> · {item.amostra}/{item.jogosNaJanela}j</span>
            </span>
            {item.suficiente && item.mediaSecundaria != null && (
              <span className="text-[9px] font-bold text-acc2 tabular-nums shrink-0">
                {item.mediaSecundaria.toFixed(1)} {item.rotuloSecundaria}
              </span>
            )}
            {item.suficiente ? (
              <>
                <div className="flex-1 h-1.5 rounded-full bg-panel2 overflow-hidden">
                  <div className="h-full rounded-full bg-acc" style={{ width: `${Math.max(4, pctBarra)}%` }} />
                </div>
                {pctFreq != null && (
                  <span className="text-[9px] font-bold text-mut tabular-nums shrink-0" title="Jogos da amostra em que o evento aconteceu">
                    {pctFreq}%
                  </span>
                )}
              </>
            ) : (
              <span className="text-[9px] font-bold text-warn">Amostra insuficiente</span>
            )}
          </div>

          {item.suficiente && (
            <div className="mt-1 flex items-center gap-1 min-w-0">
              {JANELAS_CARD.map((j) => {
                const a = item.acerto[j.id];
                const rotulo = a ? `L${j.n} ${a.taxa}%` : `L${j.n} —`;
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => setJanela(j.id)}
                    aria-pressed={janela === j.id}
                    aria-label={`Janela de ${j.n} jogos`}
                    className={
                      janela === j.id
                        ? "rounded border border-acc/60 bg-acc/15 px-1 py-0.5 text-[8px] font-bold tabular-nums text-acc"
                        : "rounded border border-line bg-panel2 px-1 py-0.5 text-[8px] font-bold tabular-nums text-mut"
                    }
                  >
                    {rotulo}
                  </button>
                );
              })}
              <span className="ml-auto text-[8px] text-mut tabular-nums shrink-0">{detalhe}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CardGrupo({ grupo }: { grupo: DestaqueGrupo }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center gap-1.5">
        <span aria-hidden className="text-[12px]">
          {grupo.icone}
        </span>
        <p className="text-[11px] font-extrabold text-ink truncate">{grupo.rotulo}</p>
        <span className="ml-auto text-[8px] font-bold text-mut uppercase tracking-wide shrink-0">
          {grupo.porLado ? "por time" : "confronto"}
        </span>
      </div>
      <p className="text-[9px] text-mut leading-snug mt-0.5">{grupo.descricao}</p>

      <div className="mt-1">
        {grupo.itens.length ? (
          grupo.itens.map((item) => <LinhaDestaque key={`${grupo.id}-${item.jogadorId}`} item={item} />)
        ) : (
          <div className="py-2.5 text-center">
            <p className="text-[10px] font-bold text-warn">Amostra insuficiente</p>
            <p className="text-[9px] text-mut mt-0.5">
              A fonte não devolveu este dado nos últimos jogos. Não estimamos média.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DestaquesConfronto({
  fixtureId,
  home,
  away,
}: {
  fixtureId: number;
  home: string;
  away: string;
}) {
  const [data, setData] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    const qs = new URLSearchParams({ home, away });
    fetch(`/api/hub/${fixtureId}/props?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j: Resposta) => {
        if (!ctrl.signal.aborted) setData(j);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        if ((e as Error)?.name === "AbortError") return;
        setErro("Não foi possível carregar os destaques agora.");
      });
    return () => ctrl.abort();
  }, [fixtureId, home, away]);

  if (erro || data?.error || data?.erro) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 flex gap-2">
        <ShieldAlert size={13} className="text-danger mt-0.5 shrink-0" />
        <p className="text-[11px] text-ink leading-snug">{erro || data?.error || data?.erro}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-line bg-panel animate-pulse" />
          ))}
        </div>
        <p className="text-[9px] text-mut text-center">Lendo os últimos jogos reais de cada jogador…</p>
      </div>
    );
  }

  const grupos = data.grupos ?? [];
  const venhaDeCache = data.fontes?.casa === "cache" || data.fontes?.fora === "cache";
  const janela = data.amostra?.janela ?? 10;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-acc/30 bg-acc/5 px-3 py-2">
        <Users size={13} className="text-acc shrink-0" />
        <p className="text-[10px] text-mut leading-snug">
          Ranking pela média ponderada dos <b className="text-ink">últimos {janela} jogos</b> — jogo recente pesa mais.
          Amostra &lt; 3 jogos nunca vira média. <b className="text-ink">L3 · L5 · L10</b> é frequência observada:
          em quantos dos últimos jogos o jogador passou da linha.
        </p>
      </div>

      {data.semDados ? (
        <div className="rounded-xl border border-line bg-panel p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            {data.exclusivo ? <Lock size={13} className="text-warn" /> : null}
            <p className="text-[11px] font-bold text-ink">
              {data.exclusivo ? "Scout individual para assinantes" : "Sem amostra individual neste confronto"}
            </p>
          </div>
          <p className="text-[10px] text-mut mt-1 leading-snug">{data.motivo}</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {grupos.map((g) => (
            <CardGrupo key={g.id} grupo={g} />
          ))}
        </div>
      )}

      {data.amostra && !data.semDados && (
        <p className="text-[9px] text-mut text-center leading-snug">
          Janela: {data.amostra.casa} jogos (casa
          {data.amostra.temporadaCasa ? ` · ${data.amostra.temporadaCasa}` : ""}) e {data.amostra.fora} jogos (fora
          {data.amostra.temporadaFora ? ` · ${data.amostra.temporadaFora}` : ""})
          {venhaDeCache ? " · cache 24h" : " · dados do fornecedor"}
          {". "}
          Sem dado publicado = sem média.
        </p>
      )}
    </div>
  );
}
