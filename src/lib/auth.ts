import bcrypt from "bcryptjs";
import { getSession } from "@/lib/session";

export { getSession, sessionOptions, type SessionData } from "@/lib/session";

/** True only once both password AND TOTP have been verified. */
export async function requireAuth(): Promise<{ userId: string; username: string }> {
  const session = await getSession();
  if (!session.userId || !session.username) {
    throw new AuthError("Not authenticated");
  }
  return { userId: session.userId, username: session.username };
}

export class AuthError extends Error {}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
