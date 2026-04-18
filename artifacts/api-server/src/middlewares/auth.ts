import { Request, Response, NextFunction } from "express";
import { verifyJwt, verifyApiKey } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: string;
        isActive: boolean;
      };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: "Authorization required" });
    return;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    res.status(401).json({ error: "Invalid authorization format" });
    return;
  }

  const token = parts[1];

  if (token.startsWith("sk_live_")) {
    const allUsers = await db.select().from(usersTable).where(eq(usersTable.isActive, true));
    let foundUser = null;
    for (const user of allUsers) {
      if (user.apiKeyHash && verifyApiKey(token, user.apiKeyHash)) {
        foundUser = user;
        break;
      }
    }
    if (!foundUser) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }
    req.user = {
      id: foundUser.id,
      username: foundUser.username,
      role: foundUser.role,
      isActive: foundUser.isActive,
    };
    next();
    return;
  }

  const payload = verifyJwt(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.id));
  if (!user || !user.isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  req.user = {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
  };
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
