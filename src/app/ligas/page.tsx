import LigasClient from "./LigasClient";
import { Suspense } from "react";
import { hojeYmd } from "@/lib/semana";

const dataValida = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Ligas — contagem de jogos por liga NA DATA SELECIONADA.
 *
 * A data chega pela mesma convenção da tela de Jogos (`?data=YYYY-MM-DD`).
 * Lida aqui, no servidor, para não disparar `setState` dentro de efeito no
 * cliente. Sem `?data`, abre em hoje (fuso de Brasília).
 */
export default async function Ligas({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const sp = await searchParams;
  const initialDate = dataValida(sp?.data) ? sp.data : hojeYmd();
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-mut">Carregando ligas…</div>}>
      <LigasClient initialDate={initialDate} />
    </Suspense>
  );
}
