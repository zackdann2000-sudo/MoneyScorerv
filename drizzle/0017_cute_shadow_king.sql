CREATE TABLE "hub_fixture_context" (
	"fixture_id" integer PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"h2h" jsonb,
	"stats" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_fixture_source" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"fixture_id" integer NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hub_fixture" ALTER COLUMN "sportmonks_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_league" ALTER COLUMN "sportmonks_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_player" ALTER COLUMN "sportmonks_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_team" ALTER COLUMN "sportmonks_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_fixture" ADD COLUMN "source" text DEFAULT 'sportmonks' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_fixture" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "hub_league" ADD COLUMN "source" text DEFAULT 'sportmonks' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_league" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "hub_player" ADD COLUMN "source" text DEFAULT 'sportmonks' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_player" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "hub_team" ADD COLUMN "source" text DEFAULT 'sportmonks' NOT NULL;--> statement-breakpoint
ALTER TABLE "hub_team" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "hub_fixture_context" ADD CONSTRAINT "hub_fixture_context_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_fixture_source" ADD CONSTRAINT "hub_fixture_source_fixture_id_hub_fixture_id_fk" FOREIGN KEY ("fixture_id") REFERENCES "public"."hub_fixture"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hub_fixture_source_uq" ON "hub_fixture_source" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "hub_fixture_source_fixture_idx" ON "hub_fixture_source" USING btree ("fixture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_fixture_source_ref_uq" ON "hub_fixture" USING btree ("source","external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_league_source_ref_uq" ON "hub_league" USING btree ("source","external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_player_source_ref_uq" ON "hub_player" USING btree ("source","external_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hub_team_source_ref_uq" ON "hub_team" USING btree ("source","external_ref");--> statement-breakpoint
UPDATE "hub_league" SET "external_ref" = "sportmonks_id"::text WHERE "external_ref" IS NULL AND "sportmonks_id" IS NOT NULL;--> statement-breakpoint
UPDATE "hub_team" SET "external_ref" = "sportmonks_id"::text WHERE "external_ref" IS NULL AND "sportmonks_id" IS NOT NULL;--> statement-breakpoint
UPDATE "hub_player" SET "external_ref" = "sportmonks_id"::text WHERE "external_ref" IS NULL AND "sportmonks_id" IS NOT NULL;--> statement-breakpoint
UPDATE "hub_fixture" SET "external_ref" = "sportmonks_id"::text WHERE "external_ref" IS NULL AND "sportmonks_id" IS NOT NULL;--> statement-breakpoint
INSERT INTO "hub_fixture_source" ("fixture_id", "provider", "external_id")
SELECT "id", 'sportmonks', "sportmonks_id"::text FROM "hub_fixture" WHERE "sportmonks_id" IS NOT NULL
ON CONFLICT ("provider", "external_id") DO NOTHING;
