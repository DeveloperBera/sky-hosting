import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

async function seedAdmin(): Promise<void> {
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
  const API_KEY_PREFIX = "sk_live_";

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, ADMIN_USERNAME));
  if (existing) {
    console.log(`Admin user '${ADMIN_USERNAME}' already exists`);
    process.exit(0);
  }

  const passwordHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  const rawKey = nanoid(32);
  const apiKey = `${API_KEY_PREFIX}${rawKey}`;
  const apiKeyHash = bcrypt.hashSync(apiKey, 10);
  const apiKeyPrefix = `${API_KEY_PREFIX}${rawKey.substring(0, 8)}`;
  const userId = `usr_${nanoid(10)}`;

  await db.insert(usersTable).values({
    id: userId,
    username: ADMIN_USERNAME,
    passwordHash,
    role: "admin",
    isActive: true,
    apiKeyHash,
    apiKeyPrefix,
  });

  console.log("=== Sky-Hosting Admin Account Created ===");
  console.log(`Username: ${ADMIN_USERNAME}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log(`API Key: ${apiKey}`);
  console.log("");
  console.log("Save your API key — it will not be shown again.");
  console.log("Use it to deploy via: curl -X POST /api/v1/deploy -H 'Authorization: Bearer " + apiKey + "'");
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
