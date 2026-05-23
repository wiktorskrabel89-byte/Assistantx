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

  it("returns available:false with 200 when the release tag is missing", async () => {
    process.env.JARVIS_UPDATE_SOURCE = "github";
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json() as { available?: boolean; error?: string };
    expect(body.available).toBe(false);
    expect(body.error).toBe("Release not found");
  });

  it("returns manifest data when manifest source is enabled", async () => {
    process.env.JARVIS_UPDATE_SOURCE = "manifest";
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

  it("falls back to github when manifest source fails", async () => {
    process.env.JARVIS_UPDATE_SOURCE = "manifest";
    process.env.JARVIS_UPDATE_MANIFEST_URL = "https://updates.assistantx.pl/versions.json";
    process.env.JARVIS_UPDATES_ALLOWED_HOSTS = "updates.assistantx.pl";

    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 123,
          tag_name: "jarvis-latest",
          name: "1.2.4",
          body: "GitHub fallback",
          published_at: "2026-05-23T10:00:00.000Z",
          updated_at: "2026-05-23T11:00:00.000Z",
        }),
      } as Response);

    const res = await GET();
    const body = await res.json() as { source: string; warning: string; version: string };
    expect(res.status).toBe(200);
    expect(body.source).toBe("github-fallback");
    expect(body.warning).toContain("manifest-fetch-failed");
    expect(body.version).toBe("1.2.4");
  });
});
