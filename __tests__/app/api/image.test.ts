/**
 * @jest-environment node
 */
import { POST } from "@/app/api/image/route";

describe("POST /api/image", () => {
  const originalFetch = global.fetch;

  function makeRequest(body: object) {
    return new Request("http://localhost/api/image", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  beforeEach(() => {
    delete process.env.IMAGE_GEN_API_URL;
    delete process.env.IMAGE_GEN_PROVIDER_MODE;
    delete process.env.IMAGE_GEN_MODEL_LABEL;
    delete process.env.OPENAI_API_KEY;
    global.fetch = originalFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("returns a Pollinations URL and model name on success", async () => {
    const req = makeRequest({ prompt: "a cute cat" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.url).toContain("image.pollinations.ai");
    expect(json.model).toBe("Pollinations Turbo");
  });

  it("encodes the prompt in the Pollinations URL", async () => {
    const req = makeRequest({ prompt: "a red apple" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.url).toContain(encodeURIComponent("a red apple"));
  });

  it("includes width, height, nologo and enhance query params", async () => {
    const req = makeRequest({ prompt: "test" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.url).toContain("width=1024");
    expect(json.url).toContain("height=1024");
    expect(json.url).toContain("nologo=true");
    expect(json.url).toContain("enhance=true");
  });

  it("returns error payload when request body is invalid JSON", async () => {
    const req = new Request("http://localhost/api/image", {
      method: "POST",
      body: "not-valid-json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const json = await res.json();

    expect(json.url).toBeNull();
    expect(json.model).toBeNull();
    expect(json.error).toBeDefined();
  });

  it("url is a well-formed https URL", async () => {
    const req = makeRequest({ prompt: "mountain lake" });
    const res = await POST(req);
    const json = await res.json();

    expect(() => new URL(json.url)).not.toThrow();
    expect(json.url).toMatch(/^https:\/\//);
  });

  it("uses the local image backend when configured", async () => {
    process.env.IMAGE_GEN_API_URL = "http://127.0.0.1:7860/sdapi/v1/txt2img";
    process.env.IMAGE_GEN_MODEL_LABEL = "Local Forge";
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ images: ["YWJj"] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as typeof global.fetch;

    const req = makeRequest({ prompt: "robot portrait" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.provider).toBe("Local");
    expect(json.model).toBe("Local Forge");
    expect(json.url).toContain("data:image/png;base64,YWJj");
  });

  it("falls back to Pollinations when the local backend fails", async () => {
    process.env.IMAGE_GEN_API_URL = "http://127.0.0.1:7860/sdapi/v1/txt2img";
    global.fetch = jest.fn().mockRejectedValue(new Error("local backend offline")) as typeof global.fetch;

    const req = makeRequest({ prompt: "city skyline" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.provider).toBe("Pollinations");
    expect(json.url).toContain("image.pollinations.ai");
  });
});
