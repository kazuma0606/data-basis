import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./auth/session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function isNotFound(err: unknown): boolean {
  return isApiError(err) && err.status === 404;
}

export function isUnauthorized(err: unknown): boolean {
  return isApiError(err) && err.status === 401;
}

/**
 * Server-side fetch wrapper for the FastAPI backend.
 * Reads the session cookie and attaches it as Bearer token.
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8000";
  const res = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers,
    // Disable Next.js fetch cache for API calls (always fresh)
    cache: "no-store",
  });

  if (res.status === 401) {
    throw new ApiError(401, "認証が必要です");
  }
  if (res.status === 403) {
    throw new ApiError(403, "このリソースへのアクセス権がありません");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.detail ?? `サーバーエラー (${res.status})`);
  }

  return res.json() as Promise<T>;
}

/**
 * Client-side fetch wrapper. Uses relative /api/* routes which proxy to FastAPI.
 * Token is carried automatically via httpOnly cookie.
 */
export async function clientFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });

  if (res.status === 401) throw new ApiError(401, "認証が必要です");
  if (res.status === 403) throw new ApiError(403, "アクセス権がありません");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.detail ?? `エラー (${res.status})`);
  }

  return res.json() as Promise<T>;
}
