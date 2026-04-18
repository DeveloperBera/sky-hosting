import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { LoginBody, GetMeResponse } from "@workspace/api-zod";
import { hashPassword, verifyPassword, generateJwt, generateApiKey } from "../lib/auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/v1/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = verifyPassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateJwt({ id: user.id, username: user.username, role: user.role });

  const deploymentCount = await db.$count(
    db.select().from(usersTable).where(eq(usersTable.id, user.id)).as("d")
  ).catch(() => 0);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      apiKeyPrefix: user.apiKeyPrefix,
      deploymentCount: 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

router.get("/v1/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { deploymentsTable } = await import("@workspace/db");
  const { count } = await import("drizzle-orm");
  const [countResult] = await db.select({ count: count() }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    apiKeyPrefix: user.apiKeyPrefix,
    deploymentCount: countResult?.count ?? 0,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

router.post("/v1/auth/regenerate-key", requireAuth, async (req, res): Promise<void> => {
  const { key, hash, prefix } = generateApiKey();

  await db.update(usersTable)
    .set({ apiKeyHash: hash, apiKeyPrefix: prefix })
    .where(eq(usersTable.id, req.user!.id));

  res.json({
    apiKey: key,
    apiKeyPrefix: prefix,
    message: "New API key generated. Store it safely — it will only be shown once.",
  });
});

export default router;
