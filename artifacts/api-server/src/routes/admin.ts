import { Router, type IRouter } from "express";
import { eq, count, desc, and, gte, sql } from "drizzle-orm";
import { db, usersTable, deploymentsTable, systemSettingsTable, activityTable } from "@workspace/db";
import {
  AdminListUsersQueryParams,
  AdminCreateUserBody,
  AdminGetUserParams,
  AdminUpdateUserParams,
  AdminUpdateUserBody,
  AdminDeleteUserParams,
  AdminRegenerateApiKeyParams,
  AdminListDeploymentsQueryParams,
  AdminUpdateSettingsBody,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { generateId } from "../lib/id";
import { hashPassword, generateApiKey } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { nanoid } from "nanoid";
import * as os from "os";

const router: IRouter = Router();

router.get("/v1/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = AdminListUsersQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 50) : 50;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const users = await db.select().from(usersTable)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(usersTable.createdAt));

  const [totalResult] = await db.select({ count: count() }).from(usersTable);

  const usersWithCount = await Promise.all(users.map(async (user) => {
    const [depCount] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      apiKeyPrefix: user.apiKeyPrefix,
      deploymentCount: depCount?.count ?? 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }));

  res.json({
    users: usersWithCount,
    total: totalResult?.count ?? 0,
    limit,
    offset,
  });
});

router.post("/v1/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = AdminCreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, email, password, role = "user" } = parsed.data;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing) {
    res.status(400).json({ error: "Username already taken" });
    return;
  }

  const userId = generateId("usr");
  const passwordHash = hashPassword(password);
  const { key: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = generateApiKey();

  await db.insert(usersTable).values({
    id: userId,
    username,
    email,
    passwordHash,
    role: role as "admin" | "user",
    isActive: true,
    apiKeyHash,
    apiKeyPrefix,
  });

  await logActivity({
    type: "user_created",
    message: `User ${username} created`,
    userId: req.user!.id,
    username: req.user!.username,
  });

  res.status(201).json({
    id: userId,
    username,
    email,
    role,
    isActive: true,
    apiKey,
    deploymentCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});

router.get("/v1/admin/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, rawId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [depCount] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    apiKeyPrefix: user.apiKeyPrefix,
    deploymentCount: depCount?.count ?? 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

router.patch("/v1/admin/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, rawId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const parsed = AdminUpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.email !== undefined) updates.email = parsed.data.email;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role as "admin" | "user";
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.password !== undefined) updates.passwordHash = hashPassword(parsed.data.password);

  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, rawId)).returning();
  const [depCount] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, rawId));

  res.json({
    id: updated!.id,
    username: updated!.username,
    email: updated!.email,
    role: updated!.role,
    isActive: updated!.isActive,
    apiKeyPrefix: updated!.apiKeyPrefix,
    deploymentCount: depCount?.count ?? 0,
    createdAt: updated!.createdAt,
    updatedAt: updated!.updatedAt,
  });
});

router.delete("/v1/admin/users/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, rawId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.id === req.user!.id) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  await db.delete(deploymentsTable).where(eq(deploymentsTable.userId, rawId));
  await db.delete(usersTable).where(eq(usersTable.id, rawId));

  await logActivity({
    type: "user_deleted",
    message: `User ${user.username} deleted`,
    userId: req.user!.id,
    username: req.user!.username,
  });

  res.sendStatus(204);
});

router.post("/v1/admin/users/:id/regenerate-key", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, rawId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { key: apiKey, hash: apiKeyHash, prefix: apiKeyPrefix } = generateApiKey();
  const [updated] = await db.update(usersTable)
    .set({ apiKeyHash, apiKeyPrefix })
    .where(eq(usersTable.id, rawId))
    .returning();

  const [depCount] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, rawId));

  res.json({
    id: updated!.id,
    username: updated!.username,
    email: updated!.email,
    role: updated!.role,
    isActive: updated!.isActive,
    apiKey,
    deploymentCount: depCount?.count ?? 0,
    createdAt: updated!.createdAt,
    updatedAt: updated!.updatedAt,
  });
});

router.get("/v1/admin/deployments", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = AdminListDeploymentsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 50) : 50;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const conditions = [];
  if (params.success && params.data.userId) {
    conditions.push(eq(deploymentsTable.userId, params.data.userId));
  }
  if (params.success && params.data.status) {
    conditions.push(eq(deploymentsTable.status, params.data.status as "building" | "running" | "failed" | "stopped" | "queued"));
  }

  const deployments = await db.select().from(deploymentsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit)
    .offset(offset)
    .orderBy(desc(deploymentsTable.createdAt));

  const [totalResult] = await db.select({ count: count() }).from(deploymentsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  const deploymentsWithUsers = await Promise.all(deployments.map(async (d) => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, d.userId));
    const [userDepCount] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, d.userId));
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
      buildLogs: d.buildLogs,
      runtimeLogs: d.runtimeLogs,
      errorMessage: d.errorMessage,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      deployedAt: d.deployedAt,
      user: user ? {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        apiKeyPrefix: user.apiKeyPrefix,
        deploymentCount: userDepCount?.count ?? 0,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      } : null,
    };
  }));

  res.json({
    deployments: deploymentsWithUsers,
    total: totalResult?.count ?? 0,
    limit,
    offset,
  });
});

router.get("/v1/admin/stats", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const [activeUsers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.isActive, true));
  const [totalDeployments] = await db.select({ count: count() }).from(deploymentsTable);
  const [runningDeployments] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.status, "running"));
  const [buildingDeployments] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.status, "building"));
  const [failedDeployments] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.status, "failed"));
  const [stoppedDeployments] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.status, "stopped"));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  const [deploymentsToday] = await db.select({ count: count() }).from(deploymentsTable)
    .where(gte(deploymentsTable.createdAt, today));
  const [deploymentsThisWeek] = await db.select({ count: count() }).from(deploymentsTable)
    .where(gte(deploymentsTable.createdAt, weekAgo));

  const frameworkRows = await db.select({
    framework: deploymentsTable.framework,
    count: count(),
  }).from(deploymentsTable)
    .groupBy(deploymentsTable.framework);

  const frameworkBreakdown: Record<string, number> = {};
  for (const row of frameworkRows) {
    frameworkBreakdown[row.framework ?? "unknown"] = row.count;
  }

  const recentActivity = await db.select().from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(20);

  const cpuUsage = os.loadavg()[0];
  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  res.json({
    totalUsers: totalUsers?.count ?? 0,
    activeUsers: activeUsers?.count ?? 0,
    totalDeployments: totalDeployments?.count ?? 0,
    runningDeployments: runningDeployments?.count ?? 0,
    buildingDeployments: buildingDeployments?.count ?? 0,
    failedDeployments: failedDeployments?.count ?? 0,
    stoppedDeployments: stoppedDeployments?.count ?? 0,
    deploymentsToday: deploymentsToday?.count ?? 0,
    deploymentsThisWeek: deploymentsThisWeek?.count ?? 0,
    frameworkBreakdown,
    recentActivity: recentActivity.map((a) => ({
      id: a.id,
      type: a.type,
      message: a.message,
      userId: a.userId,
      username: a.username,
      deploymentId: a.deploymentId,
      deploymentName: a.deploymentName,
      createdAt: a.createdAt,
    })),
  });
});

router.get("/v1/admin/settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  let [settings] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.id, "singleton"));
  if (!settings) {
    await db.insert(systemSettingsTable).values({ id: "singleton" }).onConflictDoNothing();
    [settings] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.id, "singleton"));
  }
  res.json({
    baseDomain: settings!.baseDomain,
    maxDeploymentsPerUser: settings!.maxDeploymentsPerUser,
    allowPublicRegistration: settings!.allowPublicRegistration,
    defaultBuildTimeout: settings!.defaultBuildTimeout,
    enableDockerDeployments: settings!.enableDockerDeployments,
    maintenanceMode: settings!.maintenanceMode,
    rateLimitPerMinute: settings!.rateLimitPerMinute,
  });
});

router.put("/v1/admin/settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = AdminUpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Partial<typeof systemSettingsTable.$inferInsert> = {};
  const d = parsed.data;
  if (d.baseDomain !== undefined) updates.baseDomain = d.baseDomain;
  if (d.maxDeploymentsPerUser !== undefined) updates.maxDeploymentsPerUser = d.maxDeploymentsPerUser;
  if (d.allowPublicRegistration !== undefined) updates.allowPublicRegistration = d.allowPublicRegistration;
  if (d.defaultBuildTimeout !== undefined) updates.defaultBuildTimeout = d.defaultBuildTimeout;
  if (d.enableDockerDeployments !== undefined) updates.enableDockerDeployments = d.enableDockerDeployments;
  if (d.maintenanceMode !== undefined) updates.maintenanceMode = d.maintenanceMode;
  if (d.rateLimitPerMinute !== undefined) updates.rateLimitPerMinute = d.rateLimitPerMinute;

  await db.insert(systemSettingsTable).values({ id: "singleton", ...updates }).onConflictDoUpdate({
    target: systemSettingsTable.id,
    set: updates,
  });

  const [updated] = await db.select().from(systemSettingsTable).where(eq(systemSettingsTable.id, "singleton"));
  res.json({
    baseDomain: updated!.baseDomain,
    maxDeploymentsPerUser: updated!.maxDeploymentsPerUser,
    allowPublicRegistration: updated!.allowPublicRegistration,
    defaultBuildTimeout: updated!.defaultBuildTimeout,
    enableDockerDeployments: updated!.enableDockerDeployments,
    maintenanceMode: updated!.maintenanceMode,
    rateLimitPerMinute: updated!.rateLimitPerMinute,
  });
});

export default router;
