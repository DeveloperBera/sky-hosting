import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "sky-hosting-secret-key-change-in-production";
const API_KEY_PREFIX = "sk_live_";

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function generateJwt(payload: { id: string; username: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyJwt(token: string): { id: string; username: string; role: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: string };
  } catch {
    return null;
  }
}

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const rawKey = nanoid(32);
  const key = `${API_KEY_PREFIX}${rawKey}`;
  const hash = bcrypt.hashSync(key, 10);
  const prefix = `${API_KEY_PREFIX}${rawKey.substring(0, 8)}`;
  return { key, hash, prefix };
}

export function verifyApiKey(key: string, hash: string): boolean {
  return bcrypt.compareSync(key, hash);
}
