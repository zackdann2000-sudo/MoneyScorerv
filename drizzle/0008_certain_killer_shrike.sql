ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "device_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "registration_ip" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_device_idx" ON "users" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_ip_idx" ON "users" USING btree ("registration_ip");
