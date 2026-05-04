/**
 * @jest-environment node
 *
 * Tests for GET /api/integrations/github and POST /api/integrations/github
 */

// Mock next/headers before importing the route
jest.mock("next/headers", () => ({
  cookies: jest.fn(),
}));

jest.mock("@/lib/integrations", () => {
  const actual = jest.requireActual<typeof import("@/lib/integrations")>("@/lib/integrations");
  return {
    ...actual,
    // Use real implementations for all helpers
  };
});

import { cookies } from "next/headers";
import { GET, POST } from "@/app/api/integrations/github/route";

const mockCookies = cookies as jest.Mock;
const mockFetch = jest.fn();
global.fetch = mockFetch;

// A minimal valid GitHub tree response
const REPO_DATA = {
  default_branch: "main",
  description: "A test repo",
  private: false,
};

const TREE_DATA = {
  truncated: false,
  tree: [
    { type: "blob", path: "src/index.ts", size: 1024 },
    { type: "blob", path: "README.md", size: 512 },
    { type: "tree", path: "src" }, // directories should be filtered out
    { type: "blob", path: "file.exe", size: 100 }, // should be filtered by isGitHubImportablePath
  ],
};

const FILE_CONTENT_DATA = {
  type: "file",
  encoding: "base64",
  content: Buffer.from("console.log('hello')").toString("base64"),
  name: "index.ts",
  size: 20,
};

function mockCookieStore(tokenValue: string | null = null) {
  const get = jest.fn().mockReturnValue(tokenValue ? { value: tokenValue } : undefined);
  mockCookies.mockResolvedValue({ get });
}

function makeJsonResponse(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function makeReq(method: "GET" | "POST", url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCookieStore(null);
});

// ---------------------------------------------------------------------------
// GET — fetch repository tree
// ---------------------------------------------------------------------------
describe("GET /api/integrations/github", () => {
  it("returns 400 when repo query param is missing", async () => {
    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github"));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/valid GitHub/i);
  });

  it("returns 400 when repo query param is not a valid GitHub repo", async () => {
    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=not-a-repo"));
    expect(res.status).toBe(400);
  });

  it("returns file list for a valid repo", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(REPO_DATA))   // repo info
      .mockResolvedValueOnce(makeJsonResponse(TREE_DATA));    // tree

    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=owner/repo"));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      repo: string;
      ref: string;
      files: Array<{ path: string }>;
    };
    expect(body.repo).toBe("owner/repo");
    expect(body.ref).toBe("main");
    // Directories and non-importable files are filtered
    expect(body.files.every((f) => f.path !== "src")).toBe(true);
  });

  it("uses a custom ref when provided", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(REPO_DATA))
      .mockResolvedValueOnce(makeJsonResponse({ truncated: false, tree: [] }));

    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=owner/repo&ref=develop"));
    const body = await res.json() as { ref: string };
    expect(body.ref).toBe("develop");
  });

  it("returns 500 when GitHub API returns a 404", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ message: "Not Found" }, false, 404));
    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=owner/private-repo"));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 500 when GitHub API returns a 403", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ message: "Forbidden" }, false, 403));
    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=owner/repo"));
    expect(res.status).toBe(500);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/denied|rate limited/i);
  });

  it("returns 500 on fetch network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=owner/repo"));
    expect(res.status).toBe(500);
  });

  it("forwards the GitHub token from cookies when available", async () => {
    mockCookieStore("github-token-abc");
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(REPO_DATA))
      .mockResolvedValueOnce(makeJsonResponse({ truncated: false, tree: [] }));

    await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=owner/repo"));
    // First call to github API should include auth header
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer github-token-abc");
  });

  it("marks truncated when tree is truncated", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse(REPO_DATA))
      .mockResolvedValueOnce(makeJsonResponse({ truncated: true, tree: [] }));

    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=owner/repo"));
    const body = await res.json() as { truncated: boolean };
    expect(body.truncated).toBe(true);
  });

  it("includes description and isPrivate from repo data", async () => {
    mockFetch
      .mockResolvedValueOnce(makeJsonResponse({ ...REPO_DATA, private: true, description: "My private repo" }))
      .mockResolvedValueOnce(makeJsonResponse({ truncated: false, tree: [] }));

    const res = await GET(makeReq("GET", "http://localhost/api/integrations/github?repo=owner/repo"));
    const body = await res.json() as { isPrivate: boolean; description: string };
    expect(body.isPrivate).toBe(true);
    expect(body.description).toBe("My private repo");
  });
});

// ---------------------------------------------------------------------------
// POST — import file content
// ---------------------------------------------------------------------------
describe("POST /api/integrations/github", () => {
  it("returns 400 when repo is missing", async () => {
    const res = await POST(makeReq("POST", "http://localhost/api/integrations/github", { path: "src/index.ts" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when path is missing", async () => {
    const res = await POST(makeReq("POST", "http://localhost/api/integrations/github", { repo: "owner/repo" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when path is not importable (e.g. .exe file)", async () => {
    const res = await POST(makeReq("POST", "http://localhost/api/integrations/github", { repo: "owner/repo", path: "build/app.exe" }));
    expect(res.status).toBe(400);
  });

  it("returns file content on success", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse(FILE_CONTENT_DATA));
    const res = await POST(makeReq("POST", "http://localhost/api/integrations/github", {
      repo: "owner/repo",
      ref: "main",
      path: "src/index.ts",
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      name: string;
      mimeType: string;
      base64: string;
      prompt: string;
      sourceLabel: string;
    };
    expect(body.name).toBe("index.ts");
    expect(body.sourceLabel).toContain("owner/repo");
    expect(body.base64).toBeDefined();
  });

  it("returns 400 when GitHub returns a non-file item", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ type: "dir", encoding: null, content: null }));
    const res = await POST(makeReq("POST", "http://localhost/api/integrations/github", {
      repo: "owner/repo",
      path: "src/index.ts",
    }));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/cannot be imported/i);
  });

  it("returns 413 when the file is too large", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({
      ...FILE_CONTENT_DATA,
      size: 700_000,
    }));
    const res = await POST(makeReq("POST", "http://localhost/api/integrations/github", {
      repo: "owner/repo",
      path: "src/index.ts",
    }));
    expect(res.status).toBe(413);
  });

  it("returns 500 when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    const res = await POST(makeReq("POST", "http://localhost/api/integrations/github", {
      repo: "owner/repo",
      path: "src/index.ts",
    }));
    expect(res.status).toBe(500);
  });

  it("forwards the GitHub token from cookies when available", async () => {
    mockCookieStore("github-token-abc");
    mockFetch.mockResolvedValueOnce(makeJsonResponse(FILE_CONTENT_DATA));

    await POST(makeReq("POST", "http://localhost/api/integrations/github", {
      repo: "owner/repo",
      path: "src/index.ts",
    }));
    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer github-token-abc");
  });
});
