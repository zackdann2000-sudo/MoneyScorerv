CREATE TABLE "match_team_stats_cache" (
	"match_id" text PRIMARY KEY NOT NULL,
	"league" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"fixture_id" text DEFAULT '' NOT NULL,
	"finalizada" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "match_team_stats_updated_idx" ON "match_team_stats_cache" USING btree ("updated_at");