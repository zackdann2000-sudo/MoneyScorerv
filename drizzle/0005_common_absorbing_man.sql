CREATE TABLE IF NOT EXISTS "team_xg_cache" (
	"team_id" text PRIMARY KEY NOT NULL,
	"team_name" text DEFAULT '' NOT NULL,
	"xg_for" real DEFAULT 0 NOT NULL,
	"xg_against" real DEFAULT 0 NOT NULL,
	"sample" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'api-football' NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
