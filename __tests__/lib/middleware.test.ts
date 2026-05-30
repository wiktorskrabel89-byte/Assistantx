/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { updateSession } from "@/lib/middleware";

const mockCreateServerClient = createServerClient as jest.Mock;
const mockGetUser = jest.fn();
const mockGetAll = jest.fn(() => []);

jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: mockGetUser,
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
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "publishable-key";
  });

  it("redirects to /auth/login when there is no user and path is not /login or /auth", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/dashboard");
    const res = await updateSession(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/auth/login");
  });

  it("does not redirect when path starts with /login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/login");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it("does not redirect when path starts with /auth", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/auth/callback");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it("does not redirect when a user is present", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-id-123", email: "user@example.com" } },
    });

    const req = makeRequest("/dashboard");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it("returns a NextResponse", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-id-123" } },
    });

    const req = makeRequest("/home");
    const res = await updateSession(req);

    expect(res).toBeInstanceOf(NextResponse);
  });

  it("redirects to /auth/login (not /login) when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/profile");
    const res = await updateSession(req);

    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/auth/login");
  });

  it("sets Content-Security-Policy header with a nonce on authenticated responses", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-id-123" } },
    });

    const req = makeRequest("/home");
    const res = await updateSession(req);

    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/script-src/);
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/]+=*'/);
  });

  it("nonce in CSP is a non-empty base64 string", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-id-123" } },
    });

    const req = makeRequest("/home");
    const res = await updateSession(req);

    const csp = res.headers.get("Content-Security-Policy") ?? "";
    const match = csp.match(/'nonce-([A-Za-z0-9+/]+=*)'/);
    expect(match).not.toBeNull();
    // The nonce extracted from the CSP must be a non-empty base64 string.
    expect(match![1].length).toBeGreaterThan(0);
  });

  it("does not redirect manifest requests when there is no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/manifest.json");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it.each([
    "/versions.json",
    "/updates/versions.json",
    "/latest.yml",
    "/windows/latest.yml",
    "/windows/JarvisSetup-x64.exe",
    "/windows/JarvisSetup-x64.exe.blockmap",
    "/windows/release-notes.json",
    "/beta/windows/latest.yml",
    "/mac/latest-mac.yml",
    "/linux/Jarvis-x64.AppImage",
    "/android/Jarvis-android.apk",
  ])("does not redirect public updater path %s when there is no authenticated user", async (pathname) => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest(pathname);
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it("skips Supabase session refresh when Supabase env vars are missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const req = makeRequest("/api/workspaces/state");
    const res = await updateSession(req);

    expect(res.status).toBe(200);
    expect(mockCreateServerClient).not.toHaveBeenCalled();
  });

  it("does not redirect when path starts with /api and there is no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const req = makeRequest("/api/history");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
  });

  it("accepts a freshly-created authenticated session user without redirecting", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "fresh-session-user",
          email: "fresh@example.com",
          last_sign_in_at: "2026-05-16T20:00:00.000Z",
        },
      },
    });

    const req = makeRequest("/workspace");
    const res = await updateSession(req);

    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });
});
