import { NextRequest, NextResponse } from "next/server";
import { authProvider } from "./lib/auth";
import { SESSION_COOKIE } from "./lib/auth/session";
import { ROLE_HOME } from "./lib/auth/routes";
import type { Role } from "./lib/auth/types";

// Role → allowed path prefix
const ROLE_PATHS: Record<Role, string[]> = {
  engineer: ["/ops"],
  marketer: ["/business"],
  store_manager: ["/business"],
  admin: ["/ops", "/business"],
};

// Re-export for use in tests
export { ROLE_HOME };

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow Next.js internals, static files, and API proxy routes
  // /api/ops/* and /api/business/* handle their own auth via apiFetch
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/ops/") ||
    pathname.startsWith("/api/business/") ||
    pathname.startsWith("/api/auth/signout") ||
    pathname.startsWith("/api/auth/me") ||
    pathname.startsWith("/api/auth/users") ||
    pathname === "/" ||
    pathname === "/api/healthz" ||
    pathname.startsWith("/api/status/") ||
    pathname.startsWith("/status")
  ) {
    return NextResponse.next();
  }

  // For /auth/login: redirect already-authenticated users to their home
  if (pathname.startsWith("/auth/login")) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      const user = await authProvider.verifyToken(token);
      if (user) {
        const homeUrl = req.nextUrl.clone();
        homeUrl.pathname = ROLE_HOME[user.role];
        homeUrl.search = "";
        return NextResponse.redirect(homeUrl);
      }
    }
    return NextResponse.next();
  }

  // For /api/auth/signin: already-authenticated users get a JSON error (not a redirect)
  // Redirect would cause fetch() to receive HTML and crash with "ネットワークエラー"
  if (pathname.startsWith("/api/auth/signin")) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      const user = await authProvider.verifyToken(token);
      if (user) {
        return NextResponse.json(
          { error: `既に ${user.username} としてログインされています。別のアカウントでログインするには、先にサインアウトしてください。` },
          { status: 409 }
        );
      }
    }
    return NextResponse.next();
  }

  // Verify session token
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await authProvider.verifyToken(token) : null;

  // Not authenticated → redirect to login
  if (!user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Check role-based access
  const allowedPrefixes = ROLE_PATHS[user.role] ?? [];
  const hasAccess = allowedPrefixes.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!hasAccess) {
    // Redirect to the role's home page
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = ROLE_HOME[user.role];
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths except static files and Next.js internals.
     * This runs on Edge Runtime.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
