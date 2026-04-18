import { db, activityTable } from "@workspace/db";
import { generateId } from "./id";
import { logger } from "./logger";

export async function logActivity(params: {
  type: string;
  message: string;
  userId: string;
  username: string;
  deploymentId?: string;
  deploymentName?: string;
}): Promise<void> {
  try {
    await db.insert(activityTable).values({
      id: generateId("act"),
      type: params.type,
      message: params.message,
      userId: params.userId,
      username: params.username,
      deploymentId: params.deploymentId,
      deploymentName: params.deploymentName,
    });
  } catch (err) {
    logger.error({ err }, "Failed to log activity");
  }
}
