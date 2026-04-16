/**
 * @jest-environment node
 */
import { POST } from "@/app/api/image/route";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("POST /api/image", () => {
  function makeRequest(body: object) {
    return new Request("http://localhost/api/image", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a URL on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const req = makeRequest({ prompt: "a cute cat" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.url).toBeTruthy();
    expect(json.model).toBe("Pollinations.ai (Free)");
  });

  it("includes the encoded prompt in the image URL", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const req = makeRequest({ prompt: "a red apple" });
    await POST(req);

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent("a red apple"));
  });

  it("returns error payload when fetch response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false });

    const req = makeRequest({ prompt: "a blue sky" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.url).toBeNull();
    expect(json.model).toBeNull();
    expect(json.error).toBeDefined();
  });

  it("returns error payload when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const req = makeRequest({ prompt: "a mountain" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.url).toBeNull();
    expect(json.error).toBeDefined();
  });

  it("uses HEAD method to verify image URL", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const req = makeRequest({ prompt: "test" });
    await POST(req);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "HEAD" })
    );
  });
});
