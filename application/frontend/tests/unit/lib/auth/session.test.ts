/**
 * Tests for getSession().
 * We mock next/headers to control cookie values.
 */

import type { AuthUser } from "@/lib/auth/types";

const TEST_SECRET = "test-secret-for-unit-tests-32chars!!";

// Mock next/headers
const mockGet = jest.fn();
jest.mock("next/headers", () => ({
  cookies: jest.fn(() => Promise.resolve({ get: mockGet })),
}));

// Mock authProvider — use jest.fn() inside factory to avoid hoisting issues
jest.mock("@/lib/auth/index", () => ({
  authProvider: {
    verifyToken: jest.fn(),
  },
}));

// Import after mocks
import { getSession, SESSION_COOKIE } from "@/lib/auth/session";
import { authProvider } from "@/lib/auth/index";

// Typed reference to the mock
const mockVerifyToken = authProvider.verifyToken as jest.MockedFunction<
  typeof authProvider.verifyToken
>;

describe("getSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when no session cookie", async () => {
    mockGet.mockReturnValue(undefined);

    const user = await getSession();
    expect(user).toBeNull();
    expect(mockVerifyToken).not.toHaveBeenCalled();
  });

  it("returns null when cookie exists but token is invalid", async () => {
    mockGet.mockImplementation((name: string) =>
      name === SESSION_COOKIE ? { value: "bad.token" } : undefined
    );
    mockVerifyToken.mockResolvedValue(null);

    const user = await getSession();
    expect(user).toBeNull();
    expect(mockVerifyToken).toHaveBeenCalledWith("bad.token");
  });

  it("returns AuthUser when cookie has valid token", async () => {
    const expectedUser: AuthUser = {
      userId: 1,
      username: "engineer",
      role: "engineer",
      storeId: null,
    };

    mockGet.mockImplementation((name: string) =>
      name === SESSION_COOKIE ? { value: "valid.token.here" } : undefined
    );
    mockVerifyToken.mockResolvedValue(expectedUser);

    const user = await getSession();
    expect(user).toEqual(expectedUser);
  });
});
