CREATE TABLE IF NOT EXISTS "rankings_cache" (
	"liga" text PRIMARY KEY NOT NULL,
	"times" integer DEFAULT 0 NOT NULL,
	"jogos" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
