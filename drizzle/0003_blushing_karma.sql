CREATE TABLE "player_photos" (
	"player_key" text PRIMARY KEY NOT NULL,
	"player_name" text DEFAULT '' NOT NULL,
	"photo" text,
	"source" text DEFAULT 'TheSportsDB' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_stats_cache" (
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
CREATE TABLE "team_badges" (
	"team_key" text PRIMARY KEY NOT NULL,
	"team_name" text DEFAULT '' NOT NULL,
	"badge" text,
	"source" text DEFAULT 'TheSportsDB' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "player_stats_cache_updated_idx" ON "player_stats_cache" USING btree ("updated_at");