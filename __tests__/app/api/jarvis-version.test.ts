/**
 * @jest-environment node
 */

import { GET } from "@/app/api/jarvis/version/route";

const mockFetch = jest.fn();
global.fetch = mockFetch;
const ORIGINAL_ENV = process.env;

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("GET /api/jarvis/version", () => {
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns manifest data when manifest source is enabled", async () => {
    process.env.JARVIS_UPDATE_MANIFEST_URL = "https://updates.assistantx.pl/versions.json";
    process.env.JARVIS_UPDATES_ALLOWED_HOSTS = "updates.assistantx.pl";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        channels: {
          stable: {
            windows: {
              latestVersion: "1.2.3",
              url: "https://updates.assistantx.pl/windows/JarvisSetup-x64.exe",
              releaseNotes: "Manifest release",
              publishedAt: "2026-05-23T20:00:00.000Z",
            },
            mac: {
              latestVersion: "1.2.3",
              artifacts: {
                x64: "https://updates.assistantx.pl/mac/JarvisSetup-x64.dmg",
                arm64: "https://updates.assistantx.pl/mac/JarvisSetup-arm64.dmg",
              },
            },
            linux: {
              latestVersion: "1.2.3",
              url: "https://updates.assistantx.pl/linux/Jarvis-x64.AppImage",
            },
            android: {
              latestVersion: "1.2.3",
              artifacts: {
                apk: "https://updates.assistantx.pl/android/Jarvis-android.apk",
              },
            },
          },
        },
      }),
    } as Response);

    const res = await GET();
    const body = await res.json() as { available: boolean; source: string; version: string; downloadUrlAndroid: string };
    expect(res.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.source).toBe("manifest");
    expect(body.version).toBe("1.2.3");
    expect(body.downloadUrlAndroid).toBe("https://updates.assistantx.pl/android/Jarvis-android.apk");
  });

  it("returns available:false when manifest fetch fails", async () => {
    process.env.JARVIS_UPDATE_MANIFEST_URL = "https://updates.assistantx.pl/versions.json";
    process.env.JARVIS_UPDATES_ALLOWED_HOSTS = "updates.assistantx.pl";

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    const res = await GET();
    const body = await res.json() as { available: boolean; source: string; error: string };
    expect(res.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.source).toBe("none");
    expect(body.error).toContain("manifest-fetch-failed");
  });

  it("supports manifest aliases version/path", async () => {
    process.env.JARVIS_UPDATE_MANIFEST_URL = "https://updates.assistantx.pl/versions.json";
    process.env.JARVIS_UPDATES_ALLOWED_HOSTS = "updates.assistantx.pl,github.com";

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        channels: {
          stable: {
            windows: {
              version: "1.3.0",
              path: "https://github.com/wiktorskrabel89-byte/Assistantx/releases/download/v1.3.0/JarvisSetup-x64.exe",
            },
            linux: {
              version: "1.3.0",
              path: "https://github.com/wiktorskrabel89-byte/Assistantx/releases/download/v1.3.0/Jarvis-x64.AppImage",
            },
          },
        },
      }),
    } as Response);

    const res = await GET();
    const body = await res.json() as { available: boolean; version: string; downloadUrlWindows: string; downloadUrlLinux: string };
    expect(res.status).toBe(200);
    expect(body.available).toBe(true);
    expect(body.version).toBe("1.3.0");
    expect(body.downloadUrlWindows).toContain("/JarvisSetup-x64.exe");
    expect(body.downloadUrlLinux).toContain("/Jarvis-x64.AppImage");
  });
});
