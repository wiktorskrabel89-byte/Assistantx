/**
 * @jest-environment node
 */
import { POST } from "@/app/api/tts/route";

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("POST /api/tts", () => {
  function makeRequest(body: object) {
    return new Request("http://localhost/api/tts", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 400 when no text is provided", async () => {
    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 400 when text is empty string", async () => {
    const req = makeRequest({ text: "" });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it("returns audioContent on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: "base64audiocontent==" }),
    });

    const req = makeRequest({ text: "Hello world" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.audioContent).toBe("base64audiocontent==");
  });

  it("truncates text to 2000 characters before sending", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: "data==" }),
    });

    const longText = "a".repeat(3000);
    const req = makeRequest({ text: longText });
    await POST(req);

    const requestBody = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ) as { text: string };
    expect(requestBody.text.length).toBe(2000);
  });

  it("returns 500 when the TTS API returns an error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "Service Unavailable",
    });

    const req = makeRequest({ text: "Hello" });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("returns 500 when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));

    const req = makeRequest({ text: "Hello" });
    const res = await POST(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeDefined();
  });

  it("sends the correct voice and model configuration", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ audioContent: "data==" }),
    });

    const req = makeRequest({ text: "Test speech" });
    await POST(req);

    const requestBody = JSON.parse(
      mockFetch.mock.calls[0][1].body as string
    ) as { voiceId: string; modelId: string };
    expect(requestBody.voiceId).toBe("Dennis");
    expect(requestBody.modelId).toBe("inworld-tts-1.5-max");
  });
});
