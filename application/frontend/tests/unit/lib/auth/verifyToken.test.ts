/**
 * @jest-environment node
 */

import { SignJWT, importJWK } from "jose";
import { fastapiProvider } from "@/lib/auth/providers/fastapi";

// We test verifyToken by generating real JWTs signed with the test secret
const TEST_SECRET = "test-secret-for-unit-tests-32chars!!";

beforeEach(() => {
  process.env.AUTH_COOKIE_SECRET = TEST_SECRET;
  process.env.JWT_ALGORITHM = "HS256";
});

async function signToken(
  payload: Record<string, unknown>,
  expiresIn: string = "8h"
) {
  const secret = new TextEncoder().encode(TEST_SECRET);
  const { SignJWT: Signer } = await import("jose");
  return new Signer(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expiresIn)
    .sign(secret);
}

describe("fastapiProvider.verifyToken", () => {
  it("returns AuthUser for valid token", async () => {
    const token = await signToken({
      sub: "1",
      username: "engineer",
      role: "engineer",
      store_id: null,
    });

    const user = await fastapiProvider.verifyToken(token);

    expect(user).not.toBeNull();
    expect(user?.username).toBe("engineer");
    expect(user?.userId).toBe(1);
    expect(user?.role).toBe("engineer");
    expect(user?.storeId).toBeNull();
  });

  it("returns null for expired token", async () => {
    const token = await signToken(
      { sub: "1", username: "engineer", role: "engineer", store_id: null },
      "0s" // expires immediately
    );

    // Small delay to ensure expiry
    await new Promise((r) => setTimeout(r, 10));

    const user = await fastapiProvider.verifyToken(token);
    expect(user).toBeNull();
  });

  it("returns null for token signed with wrong secret", async () => {
    const wrongSecret = new TextEncoder().encode("wrong-secret-totally-different");
    const { SignJWT: Signer } = await import("jose");
    const token = await new Signer({ sub: "99", username: "hacker", role: "admin", store_id: null })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(wrongSecret);

    const user = await fastapiProvider.verifyToken(token);
    expect(user).toBeNull();
  });

  it("returns null for malformed token string", async () => {
    const user = await fastapiProvider.verifyToken("not.a.valid.jwt");
    expect(user).toBeNull();
  });

  it("maps store_manager with storeId correctly", async () => {
    const token = await signToken({
      sub: "5",
      username: "store_manager",
      role: "store_manager",
      store_id: 3,
    });

    const user = await fastapiProvider.verifyToken(token);
    expect(user?.role).toBe("store_manager");
    expect(user?.storeId).toBe(3);
  });
});
