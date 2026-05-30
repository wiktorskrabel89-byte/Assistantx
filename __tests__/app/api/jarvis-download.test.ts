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
    global.fetch = jest.fn();
    jest.spyOn(fs.promises, "access").mockRejectedValue(new Error("missing"));
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it("redirects to manifest installer url when manifest contains platform entry", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      Response.json({
        channels: {
          stable: {
            windows: {
              latestVersion: "1.2.3",
              artifacts: {
                x64: "https://updates.assistantx.pl/windows/JarvisSetup-x64.exe",
              },
            },
          },
        },
      }),
    );

    const res = await GET(new Request("http://localhost/api/jarvis/download?platform=windows&arch=x64"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://updates.assistantx.pl/windows/JarvisSetup-x64.exe");
  });

  it("redirects to canonical installer url when manifest host is not allowed", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      Response.json({
        channels: {
          stable: {
            windows: {
              latestVersion: "1.2.3",
              artifacts: {
                x64: "https://evil.example.com/JarvisSetup-x64.exe",
              },
            },
          },
        },
      }),
    );

    const res = await GET(new Request("http://localhost/api/jarvis/download?platform=windows&arch=x64"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://updates.assistantx.pl/windows/JarvisSetup-x64.exe");
  });

  it("returns missing-installer 503 when manifest has no platform entry", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(Response.json({ channels: { stable: {} } }));

    const res = await GET(new Request("http://localhost/api/jarvis/download?platform=windows&arch=arm64"));
    const payload = await res.json() as { error?: string; reason?: string };
    expect(res.status).toBe(503);
    expect(payload.error).toBe("Installer not yet available");
    expect(payload.reason).toBe("manifest-platform-entry-missing");
  });

  it("redirects android requests to canonical fallback url when manifest JSON is invalid", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      new Response("<html>oops</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const res = await GET(new Request("http://localhost/api/jarvis/download?platform=android"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://updates.assistantx.pl/android/Jarvis-android.apk");
  });

  it("redirects windows requests to canonical fallback url when manifest JSON is invalid", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      new Response("<html>oops</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const res = await GET(new Request("http://localhost/api/jarvis/download?platform=windows&arch=arm64"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://updates.assistantx.pl/windows/JarvisSetup-arm64.exe");
  });
});
