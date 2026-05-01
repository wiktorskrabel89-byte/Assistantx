/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/middleware";

const mockGetClaims = jest.fn();
const mockGetAll = jest.fn(() => []);

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getClaims: mockGetClaims,
    },
  })),
}));

function makeRequest(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`);
}

describe("updateSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAll.mockReturnValue([]);
  });

  it("redirects to /auth/login when there is no user and path is not /login or /auth", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: null } });

    const req = makeRequest("/dashboard");
    const res = await updateSession(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login");
  });

  it("does not redirect when path starts with /login", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: null } });

    const req = makeRequest("/login");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it("does not redirect when path starts with /auth", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: null } });

    const req = makeRequest("/auth/callback");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it("does not redirect when a user is present", async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-id-123", email: "user@example.com" } },
    });

    const req = makeRequest("/dashboard");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it("returns a NextResponse", async () => {
    mockGetClaims.mockResolvedValue({
      data: { claims: { sub: "user-id-123" } },
    });

    const req = makeRequest("/home");
    const res = await updateSession(req);

    expect(res).toBeInstanceOf(NextResponse);
  });

  it("redirects to /auth/login (not /login) when unauthenticated", async () => {
    mockGetClaims.mockResolvedValue({ data: { claims: null } });

    const req = makeRequest("/profile");
    const res = await updateSession(req);

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth/login");
  });
});
