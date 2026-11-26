CREATE TABLE "team_history_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"league" text NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text DEFAULT '' NOT NULL,
	"payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"amostra" integer DEFAULT 0 NOT NULL,
	"base_parcial" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'espn' NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "team_history_fetched_idx" ON "team_history_cache" ("fetched_at");
--> statement-breakpoint
CREATE INDEX "team_history_league_idx" ON "team_history_cache" ("league");
