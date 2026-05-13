/**
 * @jest-environment node
 */

import { GET } from "@/app/api/jarvis/version/route";

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/jarvis/version", () => {
  it("returns available:false with 200 when the release tag is missing", async () => {
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
});
