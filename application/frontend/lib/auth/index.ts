// ── Provider switch point ──────────────────────────────────────────────────
// To switch providers (e.g. Cognito, Auth0):
//   1. Add lib/auth/providers/cognito.ts implementing IAuthProvider
//   2. Change the import below — nothing else needs to change
// ──────────────────────────────────────────────────────────────────────────
export { fastapiProvider as authProvider } from "./providers/fastapi";
export type { IAuthProvider, SignInResult } from "./provider";
export type { AuthUser, Role } from "./types";
