import { NextRequest, NextResponse } from "next/server";
import { authProvider } from "./lib/auth";
import { SESSION_COOKIE } from "./lib/auth/session";
import type { Role } from "./lib/auth/types";

// Routes that are accessible without authentication
const PUBLIC_PATHS = ["/auth/login", "/api/auth/signin"];

// Role → allowed path prefix
const ROLE_PATHS: Record<Role, string[]> = {
  engineer: ["/ops"],
  marketer: ["/business"],
  store_manager: ["/business"],
  admin: ["/ops", "/business"],
};

// Default redirect per role after login
export const ROLE_HOME: Record<Role, string> = {
  engineer: "/ops/overview",
  marketer: "/business/summary",
  store_manager: "/business/summary",
  admin: "/ops/overview",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and Next.js internals
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/signout") ||
    pathname.startsWith("/api/auth/me") ||
    pathname === "/"
  ) {
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
