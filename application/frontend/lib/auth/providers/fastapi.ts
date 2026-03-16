import { jwtVerify } from "jose";
import type { IAuthProvider, SignInResult } from "../provider";
import type { AuthUser, Role } from "../types";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";
const JWT_ALGORITHM = process.env.JWT_ALGORITHM ?? "HS256";

/**
 * JWT payload shape from FastAPI backend.
 * sub = user_id (as string), username = login name
 */
interface JwtPayload {
  sub: string;        // user_id as string
  username: string;   // login username
  role: Role;
  store_id: number | null;
  exp: number;
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret) throw new Error("AUTH_COOKIE_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export const fastapiProvider: IAuthProvider = {
  async signIn(username: string, password: string): Promise<SignInResult> {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.detail ?? "ログインに失敗しました");
    }

    const data = await res.json();
    const token: string = data.access_token;

    // Decode without verify here — cookie will be set server-side and verified on each request
    const user = await fastapiProvider.verifyToken(token);
    if (!user) throw new Error("トークンの検証に失敗しました");

    return { token, user };
  },

  async signOut(_token: string): Promise<void> {
    // FastAPI JWT is stateless; cookie deletion is handled by the API route
  },

  async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      const secret = getJwtSecret();
      const { payload } = await jwtVerify(token, secret, {
        algorithms: [JWT_ALGORITHM as "HS256"],
      });

      const p = payload as unknown as JwtPayload;

      return {
        userId: parseInt(p.sub, 10),
        username: p.username,
        role: p.role,
        storeId: p.store_id ?? null,
      };
    } catch {
      return null;
    }
  },
};
