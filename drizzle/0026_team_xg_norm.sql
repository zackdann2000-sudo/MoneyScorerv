-- 0026_team_xg_norm.sql
--
-- Cache de xG oficial: busca por NOME NORMALIZADO, indexada.
--
-- POR QUE EXISTE: `lerCachePorNome()` (src/lib/xgOfficial.ts) fazia
-- `db.select().from(team_xg_cache)` SEM filtro e comparava linha por linha em
-- JS — duas vezes por jogo analisado. Numa tabela que só cresce (um time por
-- linha, para sempre), isso virou varredura completa por análise.
--
-- A coluna `team_name_norm` guarda o nome na MESMA forma que a leitura usa:
-- minúsculas, sem acento e só [a-z0-9] (a função `norm()` do módulo). Com o
-- índice, a leitura é um `WHERE team_name_norm = 'flamengo'`.
--
-- O `UPDATE` de backfill replica essa normalização em SQL para o acervo que já
-- estava no banco. `translate()` cobre o Latin-1 usado nos nomes de clubes
-- (á à â ã ä å é è ê ë í ì î ï ó ò ô õ ö ú ù û ü ç ñ ý, nas duas caixas) e
-- `regexp_replace` remove o que sobra. Nomes fora disso (cirílico, grego)
-- normalizam para vazio em JS e ficam com '' — continuam funcionando pelo
-- caminho por `team_id`, só não aparecem na busca por nome.
--
-- Aplicar com: npm run db:migrate-xg-norm  (idempotente)

ALTER TABLE "team_xg_cache" ADD COLUMN IF NOT EXISTS "team_name_norm" text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "team_xg_cache_norm_idx" ON "team_xg_cache" ("team_name_norm");
--> statement-breakpoint
UPDATE "team_xg_cache"
SET "team_name_norm" = regexp_replace(
      lower(translate(
        "team_name",
        'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝáàâãäåéèêëíìîïóòôõöúùûüçñý',
        'AAAAAAEEEEIIIIOOOOOUUUUCNYaaaaaaeeeeiiiiooooouuuucny'
      )),
      '[^a-z0-9]', '', 'g'
    )
WHERE "team_name_norm" = ''
  AND "team_name" <> '';
