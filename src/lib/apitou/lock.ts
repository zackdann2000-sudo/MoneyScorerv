/**
 * Lock global do apitou (M3) — lease em tabela, NÃO advisory lock.
 *
 * ## Por que não `pg_try_advisory_lock`
 *
 * Era o plano do M3, e ele está errado para este deploy. O app usa o endpoint
 * POOLED do Neon (PgBouncer em modo transação), e ali dois clientes Node
 * distintos caem na MESMA sessão do Postgres. Medido no banco de produção:
 *
 *   c1: select pg_backend_pid() -> 735
 *   c2: select pg_backend_pid() -> 735        (clientes diferentes, mesma sessão)
 *   c1: pg_try_advisory_lock(...) -> true
 *   c2: pg_try_advisory_lock(...) -> true     (reentrante na mesma sessão)
 *
 * Advisory lock é de sessão. Sessão compartilhada = lock que não exclui nada —
 * pior que não ter lock, porque dá a impressão de proteção.
 *
 * ## O que este módulo faz
 *
 * Uma linha na tabela `sync_lock` funciona como um lease: nome + dono + prazo.
 *
 *   pegar  -> insert ... on conflict do update ... where expira_em < now()
 *             (uma instrução, atômica no banco: só um vence)
 *   soltar -> delete where nome and dono
 *   morrer -> a lease expira sozinha, exatamente como o Postgres liberaria uma
 *             sessão morta — mas sem depender de identidade de sessão
 *
 * Quem chega depois recebe `ocupado` NA HORA e não espera: o correto para um
 * download de 22 MB que outro processo já está fazendo é servir o cache atual.
 *
 * `dono` (uuid + origem) impede que um processo com lease vencida apague o lock
 * de quem pegou depois.
 */
import { randomUUID } from "node:crypto";

/** Nome do lock. Um por trabalho global — o script e o app usam o mesmo. */
export const LOCK_APITOU_SYNC = "apitou-sync";

/** Prazo padrão do lease. O sync tem teto de 300s (maxDuration); 10 min sobra. */
export const LEASE_TTL_S = 600;

export type LeaseAdquirida = {
  ok: true;
  dono: string;
  expiraEm: Date;
  /** Solta o lock. Seguro de chamar mais de uma vez. */
  liberar: () => Promise<void>;
};

export type LeaseNegada = {
  ok: false;
  motivo: "ocupado" | "erro";
  /** Quando `ocupado`, quem está com o lock (ajuda no log/operação). */
  dono?: string;
  expiraEm?: Date;
  erro?: string;
};

/**
 * Tenta pegar o lock global. Devolve `liberar()` quando consegue — chame sempre
 * em `finally`, mesmo em erro.
 */
export async function tentarLease(
  nome: string = LOCK_APITOU_SYNC,
  ttlSegundos: number = LEASE_TTL_S,
  origem = "app",
): Promise<LeaseAdquirida | LeaseNegada> {
  const dono = `${origem}:${randomUUID()}`;
  try {
    const { pool } = await import("@/db");

    /*
     * O `where` do `on conflict` é o coração do lock: só sobrescreve a lease se
     * a anterior tiver EXPIRADO. Com a lease viva, o update não roda, nenhuma
     * linha volta e a resposta é "ocupado" — sem espera e sem corrida, porque
     * quem decide é o banco em uma instrução.
     */
    const { rows } = await pool.query<{ dono: string; expira_em: Date }>(
      `insert into sync_lock (nome, dono, expira_em)
       values ($1, $2, now() + ($3 || ' seconds')::interval)
       on conflict (nome) do update
         set dono = excluded.dono,
             expira_em = excluded.expira_em,
             atualizado_em = now()
         where sync_lock.expira_em < now()
       returning dono, expira_em`,
      [nome, dono, String(ttlSegundos)],
    );

    const ganhou = rows[0]?.dono === dono;
    if (!ganhou) {
      const atual = await lerLease(nome);
      return { ok: false, motivo: "ocupado", dono: atual?.dono, expiraEm: atual?.expiraEm };
    }

    let liberado = false;
    const expiraEm = new Date(rows[0].expira_em);
    return {
      ok: true,
      dono,
      expiraEm,
      liberar: async () => {
        if (liberado) return;
        liberado = true;
        try {
          await pool.query("delete from sync_lock where nome = $1 and dono = $2", [nome, dono]);
        } catch (e) {
          // Lease viva expira sozinha: falhar aqui atrasa o próximo sync, não
          // quebra nada. Nunca deixa o unlock derrubar a resposta.
          console.error(
            "[apitou/lock] liberar falhou (a lease expira sozinha):",
            e instanceof Error ? e.message : e,
          );
        }
      },
    };
  } catch (e) {
    // Tabela ausente (migration 0013 não aplicada) ou banco fora: é erro, não
    // "ocupado". Falha fechada de propósito — sync sem lock é o que causava
    // downloads simultâneos de 22 MB.
    return { ok: false, motivo: "erro", erro: e instanceof Error ? e.message : String(e) };
  }
}

/** Estado atual do lock (diagnóstico e mensagem de "ocupado"). */
export async function lerLease(
  nome: string = LOCK_APITOU_SYNC,
): Promise<{ dono: string; expiraEm: Date; viva: boolean } | null> {
  try {
    const { pool } = await import("@/db");
    const { rows } = await pool.query<{ dono: string; expira_em: Date; viva: boolean }>(
      "select dono, expira_em, (expira_em > now()) as viva from sync_lock where nome = $1",
      [nome],
    );
    if (!rows.length) return null;
    return { dono: rows[0].dono, expiraEm: new Date(rows[0].expira_em), viva: rows[0].viva };
  } catch {
    return null;
  }
}

/**
 * Roda `fn` sob o lock global. Não pegar o lock não é exceção: devolve
 * `negado: true` para quem chama decidir (as rotas servem o cache e seguem).
 */
export async function comLease<T>(
  fn: () => Promise<T>,
  nome: string = LOCK_APITOU_SYNC,
  origem = "app",
): Promise<{ negado: true; motivo: string; erro?: string } | { negado: false; valor: T }> {
  const lease = await tentarLease(nome, LEASE_TTL_S, origem);
  if (!lease.ok) return { negado: true, motivo: lease.motivo, erro: lease.erro };
  try {
    return { negado: false, valor: await fn() };
  } finally {
    await lease.liberar();
  }
}
