/**
 * Unit tests for middleware routing logic.
 * We mock authProvider.verifyToken to return specific users.
 * NextRequest requires the Web Request API — use jest-environment-node or polyfill.
 *
 * @jest-environment node
 */

import type { AuthUser } from "@/lib/auth/types";

// Mock the auth provider
jest.mock("@/lib/auth/index", () => ({
  authProvider: {
    verifyToken: jest.fn(),
  },
}));

import { NextRequest } from "next/server";
import { middleware, ROLE_HOME } from "@/middleware";
import { authProvider } from "@/lib/auth/index";

const mockVerifyToken = authProvider.verifyToken as jest.MockedFunction<
  typeof authProvider.verifyToken
>;

function makeRequest(path: string, token?: string): NextRequest {
  const url = `http://localhost:3000${path}`;
  const req = new NextRequest(url);
  if (token) {
    req.cookies.set("tm_session", token);
  }
  return req;
}

describe("middleware", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("unauthenticated", () => {
    it("redirects to /auth/login for protected path without cookie", async () => {
      const req = makeRequest("/ops/overview");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/auth/login");
    });

    it("redirects to /auth/login when token is invalid", async () => {
      mockVerifyToken.mockResolvedValue(null);
      const req = makeRequest("/business/summary", "bad.token");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/auth/login");
    });

    it("allows access to /auth/login without cookie", async () => {
      const req = makeRequest("/auth/login");
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
    });
  });

  describe("role-based routing — engineer", () => {
    const engineer: AuthUser = {
      userId: 1, username: "engineer", role: "engineer", storeId: null,
    };

    it("allows /ops/* access", async () => {
      mockVerifyToken.mockResolvedValue(engineer);
      const res = await middleware(makeRequest("/ops/kafka", "token"));
      expect(res.status).not.toBe(307);
    });

    it("redirects to /ops/overview when accessing /business/*", async () => {
      mockVerifyToken.mockResolvedValue(engineer);
      const res = await middleware(makeRequest("/business/summary", "token"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain(ROLE_HOME.engineer);
    });
  });

  describe("role-based routing — marketer", () => {
    const marketer: AuthUser = {
      userId: 2, username: "marketer", role: "marketer", storeId: null,
    };

    it("allows /business/* access", async () => {
      mockVerifyToken.mockResolvedValue(marketer);
      const res = await middleware(makeRequest("/business/customers", "token"));
      expect(res.status).not.toBe(307);
    });

    it("redirects to /business/summary when accessing /ops/*", async () => {
      mockVerifyToken.mockResolvedValue(marketer);
      const res = await middleware(makeRequest("/ops/overview", "token"));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain(ROLE_HOME.marketer);
    });
  });

  describe("role-based routing — store_manager", () => {
    const storeManager: AuthUser = {
      userId: 3, username: "store_manager", role: "store_manager", storeId: 1,
    };

    it("allows /business/* access", async () => {
      mockVerifyToken.mockResolvedValue(storeManager);
      const res = await middleware(makeRequest("/business/customers", "token"));
      expect(res.status).not.toBe(307);
    });
  });
});
