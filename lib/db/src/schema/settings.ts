import { pgTable, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemSettingsTable = pgTable("system_settings", {
  id: text("id").primaryKey().default("singleton"),
  baseDomain: text("base_domain").notNull().default("sky-hosting.com"),
  maxDeploymentsPerUser: integer("max_deployments_per_user").notNull().default(10),
  allowPublicRegistration: boolean("allow_public_registration").notNull().default(false),
  defaultBuildTimeout: integer("default_build_timeout").notNull().default(600),
  enableDockerDeployments: boolean("enable_docker_deployments").notNull().default(true),
  maintenanceMode: boolean("maintenance_mode").notNull().default(false),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettingsTable);
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSettings = typeof systemSettingsTable.$inferSelect;
