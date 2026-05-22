/**
 * @jest-environment node
 */
import fs from "node:fs";

import { GET } from "@/app/api/jarvis/download/route";

describe("GET /api/jarvis/download", () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.JARVIS_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    global.fetch = jest.fn();
    jest.spyOn(fs.promises, "access").mockRejectedValue(new Error("missing"));
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("returns actionable 503 when no GitHub token is configured for private releases", async () => {
    const res = await GET(new Request("http://localhost/api/jarvis/download?arch=x64"));
    const payload = await res.json() as {
      reason?: string;
      instructions?: string;
    };

    expect(res.status).toBe(503);
    expect(payload.reason).toBe("private_release_requires_server_token");
    expect(payload.instructions).toContain("JARVIS_GITHUB_TOKEN");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("proxies the private release asset when a GitHub token is configured", async () => {
    process.env.JARVIS_GITHUB_TOKEN = "secret-token";
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;

    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          assets: [
            {
              name: "JarvisSetup-x64.exe",
              url: "https://api.github.com/repos/wiktorskrabel89-byte/Assistantx/releases/assets/1",
              browser_download_url:
                "https://github.com/wiktorskrabel89-byte/Assistantx/releases/download/jarvis-latest/JarvisSetup-x64.exe",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        new Response("binary-installer", {
          headers: { "content-type": "application/octet-stream" },
        })
      );

    const res = await GET(new Request("http://localhost/api/jarvis/download?arch=x64"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="JarvisSetup-x64.exe"');
    await expect(res.text()).resolves.toBe("binary-installer");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.github.com/repos/wiktorskrabel89-byte/Assistantx/releases/tags/jarvis-latest",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer secret-token",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.github.com/repos/wiktorskrabel89-byte/Assistantx/releases/assets/1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/octet-stream",
          Authorization: "Bearer secret-token",
        }),
      })
    );
  });

  it("returns missing-installer 503 when authenticated release lookup finds no installer", async () => {
    process.env.JARVIS_GITHUB_TOKEN = "secret-token";
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;

    fetchMock.mockResolvedValueOnce(Response.json({ assets: [] }));

    const res = await GET(new Request("http://localhost/api/jarvis/download?arch=arm64"));
    const payload = await res.json() as {
      error?: string;
      instructions?: string;
    };

    expect(res.status).toBe(503);
    expect(payload.error).toBe("Installer not yet available");
    expect(payload.instructions).toContain("Build and publish the installer first");
  });
});
