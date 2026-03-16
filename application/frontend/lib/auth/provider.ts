import type { AuthUser } from "./types";

export interface SignInResult {
  token: string;
  user: AuthUser;
}

export interface IAuthProvider {
  /**
   * Authenticate with credentials. Returns token + user on success.
   * Throws on failure.
   */
  signIn(username: string, password: string): Promise<SignInResult>;

  /**
   * Invalidate the session (server-side if needed).
   */
  signOut(token: string): Promise<void>;

  /**
   * Verify a JWT token and return the decoded AuthUser.
   * Returns null if invalid or expired.
   */
  verifyToken(token: string): Promise<AuthUser | null>;
}
