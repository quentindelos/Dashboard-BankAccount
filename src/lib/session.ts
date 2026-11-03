import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";

// Deliberately kept free of any Node-only dependency (bcrypt, etc.): this
// module is imported by middleware.ts, which runs in the Edge runtime.
// Password hashing lives in auth.ts instead.

export interface SessionData {
  // Set once username+password are correct, before 2FA is confirmed.
  // A session is NOT considered authenticated until `userId` is also set.
  pendingUserId?: string;
  pendingUsername?: string;
  // Set only after the TOTP code has been verified. This is the
  // "fully logged in" flag every protected route checks for.
  userId?: string;
  username?: string;
}

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  throw new Error(
    "SESSION_SECRET is missing or shorter than 32 characters. Set a long random " +
      "value in your .env (e.g. `openssl rand -base64 48`) before starting the app."
  );
}

export const sessionOptions: SessionOptions = {
  password: secret,
  cookieName: "patrimoine_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}
