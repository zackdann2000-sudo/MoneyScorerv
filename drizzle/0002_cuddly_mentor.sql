CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limits_expires_at_idx" ON "rate_limits" USING btree ("expires_at");