/**
 * @jest-environment node
 */
import { POST } from "@/app/api/image/route";

describe("POST /api/image", () => {
  function makeRequest(body: object) {
    return new Request("http://localhost/api/image", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  beforeEach(() => {
    // Ensure no OpenAI key so tests use Pollinations path
    delete process.env.OPENAI_API_KEY;
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
});
