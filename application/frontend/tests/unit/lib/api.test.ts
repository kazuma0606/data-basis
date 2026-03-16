/**
 * Unit tests for apiFetch.
 * We mock next/headers to inject cookies and use global fetch mock.
 *
 * @jest-environment node
 */

import { ApiError } from "@/lib/api";

// Mock next/headers
const mockGet = jest.fn();
jest.mock("next/headers", () => ({
  cookies: jest.fn(() => Promise.resolve({ get: mockGet })),
}));

// Mock global fetch
const mockFetch = jest.fn<Promise<Response>, [RequestInfo, RequestInit?]>();
global.fetch = mockFetch as typeof fetch;

import { apiFetch } from "@/lib/api";

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("apiFetch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BACKEND_URL = "http://backend:8000";
  });

  it("attaches Bearer token from cookie", async () => {
    mockGet.mockImplementation((name: string) =>
      name === "tm_session" ? { value: "my.jwt.token" } : undefined
    );
    mockFetch.mockResolvedValue(mockResponse(200, { data: "ok" }));

    await apiFetch("/test");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("http://backend:8000/test");
    expect((init?.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer my.jwt.token"
    );
  });

  it("makes request without Authorization when no cookie", async () => {
    mockGet.mockReturnValue(undefined);
    mockFetch.mockResolvedValue(mockResponse(200, {}));

    await apiFetch("/test");

    const [, init] = mockFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>)["Authorization"]).toBeUndefined();
  });

  it("throws ApiError(401) on 401 response", async () => {
    mockGet.mockReturnValue(undefined);
    mockFetch.mockResolvedValue(mockResponse(401, { detail: "Unauthorized" }));

    await expect(apiFetch("/protected")).rejects.toThrow(ApiError);
    await expect(apiFetch("/protected")).rejects.toMatchObject({ status: 401 });
  });

  it("throws ApiError(403) on 403 response", async () => {
    mockGet.mockReturnValue(undefined);
    mockFetch.mockResolvedValue(mockResponse(403, {}));

    await expect(apiFetch("/admin")).rejects.toMatchObject({ status: 403 });
  });

  it("throws ApiError on 500 with detail message", async () => {
    mockGet.mockReturnValue(undefined);
    mockFetch.mockResolvedValue(mockResponse(500, { detail: "Internal error" }));

    await expect(apiFetch("/crash")).rejects.toMatchObject({
      status: 500,
      message: "Internal error",
    });
  });

  it("returns parsed JSON on success", async () => {
    mockGet.mockReturnValue(undefined);
    const payload = { id: 42, name: "テスト" };
    mockFetch.mockResolvedValue(mockResponse(200, payload));

    const result = await apiFetch<{ id: number; name: string }>("/data");
    expect(result).toEqual(payload);
  });
});
