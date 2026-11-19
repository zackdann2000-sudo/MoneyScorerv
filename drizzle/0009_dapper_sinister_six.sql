CREATE TABLE IF NOT EXISTS "player_props_cache" (
	"team_key" text PRIMARY KEY NOT NULL,
	"team_id" text DEFAULT '' NOT NULL,
	"team_name" text DEFAULT '' NOT NULL,
	"sample" integer DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
