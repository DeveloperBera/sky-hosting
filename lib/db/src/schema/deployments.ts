import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deploymentsTable = pgTable("deployments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  githubUrl: text("github_url").notNull(),
  branch: text("branch").notNull().default("main"),
  status: text("status", { enum: ["queued", "building", "running", "failed", "stopped"] }).notNull().default("queued"),
  framework: text("framework", { enum: ["nodejs", "python", "static", "docker", "go"] }),
  liveUrl: text("live_url"),
  logsUrl: text("logs_url"),
  subdomain: text("subdomain"),
  customDomain: text("custom_domain"),
  buildCommand: text("build_command"),
  startCommand: text("start_command"),
  buildLogs: text("build_logs"),
  runtimeLogs: text("runtime_logs"),
  errorMessage: text("error_message"),
  envVarsEncrypted: text("env_vars_encrypted"),
  githubToken: text("github_token"),
  port: integer("port"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  deployedAt: timestamp("deployed_at", { withTimezone: true }),
});

export const insertDeploymentSchema = createInsertSchema(deploymentsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deploymentsTable.$inferSelect;
