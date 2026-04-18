import { Router, type IRouter } from "express";
import { eq, and, count } from "drizzle-orm";
import { db, deploymentsTable, usersTable } from "@workspace/db";
import {
  CreateDeploymentBody,
  ListDeploymentsQueryParams,
  GetDeploymentParams,
  DeleteDeploymentParams,
  GetDeploymentLogsParams,
  GetDeploymentLogsQueryParams,
  GetDeploymentEnvParams,
  UpdateDeploymentEnvParams,
  UpdateDeploymentEnvBody,
  RestartDeploymentParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { generateId } from "../lib/id";
import { runDeployment, getLiveUrl } from "../lib/deploy-engine";
import { logActivity } from "../lib/activity";
import { nanoid } from "nanoid";

const router: IRouter = Router();

function buildSubdomain(name: string): string {
  const clean = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").substring(0, 32);
  const rand = nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, "x");
  return `${clean}-${rand}`;
}

function formatDeployment(d: typeof deploymentsTable.$inferSelect) {
  return {
    id: d.id,
    userId: d.userId,
    name: d.name,
    githubUrl: d.githubUrl,
    branch: d.branch,
    status: d.status,
    framework: d.framework,
    liveUrl: d.liveUrl,
    logsUrl: d.logsUrl,
    subdomain: d.subdomain,
    customDomain: d.customDomain,
    buildCommand: d.buildCommand,
    startCommand: d.startCommand,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    deployedAt: d.deployedAt,
  };
}

router.post("/v1/deploy", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateDeploymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { github_url, branch = "main", name, framework, build_command, start_command, env_vars, github_token } = parsed.data;

  const repoName = github_url.split("/").pop()?.replace(".git", "") ?? "app";
  const deploymentName = name || repoName;
  const subdomain = buildSubdomain(deploymentName);
  const liveUrl = getLiveUrl(subdomain);
  const deploymentId = generateId("dep");

  const logsUrl = `/api/v1/deployments/${deploymentId}`;

  const envVarsEncrypted = env_vars ? JSON.stringify(env_vars) : null;

  await db.insert(deploymentsTable).values({
    id: deploymentId,
    userId: req.user!.id,
    name: deploymentName,
    githubUrl: github_url,
    branch,
    status: "queued",
    framework: framework as "nodejs" | "python" | "static" | "docker" | "go" | undefined,
    subdomain,
    liveUrl,
    logsUrl,
    buildCommand: build_command,
    startCommand: start_command,
    envVarsEncrypted,
    githubToken: github_token,
  });

  await logActivity({
    type: "deployment_created",
    message: `Deployment ${deploymentName} created from ${github_url}`,
    userId: req.user!.id,
    username: req.user!.username,
    deploymentId,
    deploymentName,
  });

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));

  setImmediate(() => {
    runDeployment(deploymentId).catch((err) => {
      console.error("Background deployment error:", err);
    });
  });

  res.status(201).json(formatDeployment(deployment!));
});

router.get("/v1/deployments", requireAuth, async (req, res): Promise<void> => {
  const params = ListDeploymentsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const conditions = [eq(deploymentsTable.userId, req.user!.id)];

  const deployments = await db.select().from(deploymentsTable)
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(deploymentsTable.createdAt);

  const [totalResult] = await db.select({ count: count() }).from(deploymentsTable)
    .where(and(...conditions));

  res.json({
    deployments: deployments.map(formatDeployment),
    total: totalResult?.count ?? 0,
    limit,
    offset,
  });
});

router.get("/v1/deployments/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, rawId));
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (deployment.userId !== req.user!.id && req.user!.role !== "admin") {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, deployment.userId));
  const [userCountResult] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, deployment.userId));

  res.json({
    ...formatDeployment(deployment),
    buildLogs: deployment.buildLogs,
    runtimeLogs: deployment.runtimeLogs,
    errorMessage: deployment.errorMessage,
    user: user ? {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      apiKeyPrefix: user.apiKeyPrefix,
      deploymentCount: userCountResult?.count ?? 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    } : null,
  });
});

router.delete("/v1/deployments/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, rawId));
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (deployment.userId !== req.user!.id && req.user!.role !== "admin") {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  await db.delete(deploymentsTable).where(eq(deploymentsTable.id, rawId));

  await logActivity({
    type: "deployment_deleted",
    message: `Deployment ${deployment.name} deleted`,
    userId: req.user!.id,
    username: req.user!.username,
    deploymentId: deployment.id,
    deploymentName: deployment.name,
  });

  res.sendStatus(204);
});

router.get("/v1/deployments/:id/logs", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, rawId));
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (deployment.userId !== req.user!.id && req.user!.role !== "admin") {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  res.json({
    deploymentId: rawId,
    buildLogs: deployment.buildLogs,
    runtimeLogs: deployment.runtimeLogs,
  });
});

router.get("/v1/deployments/:id/env", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, rawId));
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (deployment.userId !== req.user!.id && req.user!.role !== "admin") {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const keys: string[] = [];
  if (deployment.envVarsEncrypted) {
    try {
      const envVars = JSON.parse(deployment.envVarsEncrypted) as Record<string, string>;
      keys.push(...Object.keys(envVars));
    } catch {
      // ignore
    }
  }

  res.json({ deploymentId: rawId, keys });
});

router.put("/v1/deployments/:id/env", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, rawId));
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (deployment.userId !== req.user!.id && req.user!.role !== "admin") {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const parsed = UpdateDeploymentEnvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const envVarsEncrypted = JSON.stringify(parsed.data.env_vars);
  await db.update(deploymentsTable).set({ envVarsEncrypted }).where(eq(deploymentsTable.id, rawId));

  res.json({
    deploymentId: rawId,
    keys: Object.keys(parsed.data.env_vars),
  });
});

router.post("/v1/deployments/:id/restart", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [deployment] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, rawId));
  if (!deployment) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (deployment.userId !== req.user!.id && req.user!.role !== "admin") {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  await db.update(deploymentsTable)
    .set({ status: "queued", buildLogs: "", runtimeLogs: "", errorMessage: null })
    .where(eq(deploymentsTable.id, rawId));

  await logActivity({
    type: "deployment_restarted",
    message: `Deployment ${deployment.name} restarted`,
    userId: req.user!.id,
    username: req.user!.username,
    deploymentId: deployment.id,
    deploymentName: deployment.name,
  });

  setImmediate(() => {
    runDeployment(rawId).catch((err) => {
      console.error("Background restart error:", err);
    });
  });

  const [updated] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, rawId));
  res.json(formatDeployment(updated!));
});

export default router;
