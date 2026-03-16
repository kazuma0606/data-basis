import { cookies } from "next/headers";
import { authProvider } from "./index";
import type { AuthUser } from "./types";

export const SESSION_COOKIE = "tm_session";

/**
 * Server-side: read the session cookie and verify the JWT.
 * Returns null if not authenticated or token is invalid/expired.
 *
 * Usage: Server Components and middleware (via Edge-compatible jose).
 */
export async function getSession(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return authProvider.verifyToken(token);
}
