/**
 * @jest-environment node
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@/app/lib/ai-platform", () => ({
  formatWebSearchContext: jest.fn(() => "formatted context"),
  getCachedWebSearch: jest.fn(),
  logUsageEvent: jest.fn(),
  runTavilySearch: jest.fn(),
  saveWebSearchCache: jest.fn(),
}));

import { createClient } from "@/lib/server";
import {
  getCachedWebSearch,
  logUsageEvent,
  runTavilySearch,
  saveWebSearchCache,
} from "@/app/lib/ai-platform";
import { GET, POST } from "@/app/api/web-search/route";

const mockCreateClient = createClient as jest.Mock;
const mockGetCachedWebSearch = getCachedWebSearch as jest.Mock;
const mockRunTavilySearch = runTavilySearch as jest.Mock;
const mockSaveWebSearchCache = saveWebSearchCache as jest.Mock;
const mockLogUsageEvent = logUsageEvent as jest.Mock;

function makeSupabase(user: { id: string } | null = { id: "user-1" }) {
  const limit = jest.fn().mockResolvedValue({ data: [] });
  const order = jest.fn().mockReturnValue({ limit });
  const eq = jest.fn().mockReturnValue({ order });
  const select = jest.fn().mockReturnValue({ eq });
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user } }),
    },
    from: jest.fn().mockReturnValue({ select }),
  };
}

describe("/api/web-search", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns cached searches for GET when authenticated", async () => {
    const supabase = makeSupabase();
    const searches = [{ id: "1", query: "latest ai", provider: "tavily", result_count: 3 }];
    const limit = jest.fn().mockResolvedValue({ data: searches });
    const order = jest.fn().mockReturnValue({ limit });
    const eq = jest.fn().mockReturnValue({ order });
    supabase.from.mockReturnValue({ select: jest.fn().mockReturnValue({ eq }) });
    mockCreateClient.mockResolvedValue(supabase);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.searches).toEqual(searches);
  });

  it("returns cached Tavily result without forcing a new search", async () => {
    const supabase = makeSupabase();
    mockCreateClient.mockResolvedValue(supabase);
    mockGetCachedWebSearch.mockResolvedValue({
      query: "latest ai",
      provider: "tavily",
      answer: "cached answer",
      results: [],
      cached: true,
    });

    const req = new Request("http://localhost/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "latest ai" }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(true);
    expect(mockRunTavilySearch).not.toHaveBeenCalled();
  });

  it("runs Tavily and stores the result when cache is missed", async () => {
    const supabase = makeSupabase();
    mockCreateClient.mockResolvedValue(supabase);
    mockGetCachedWebSearch.mockResolvedValue(null);
    mockRunTavilySearch.mockResolvedValue({
      query: "ship news",
      provider: "tavily",
      answer: "fresh answer",
      results: [{ title: "Source", url: "https://example.com", content: "Result" }],
      cached: false,
    });
    mockSaveWebSearchCache.mockResolvedValue("2026-05-08T18:00:00.000Z");

    const req = new Request("http://localhost/api/web-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "ship news", forceFresh: true }),
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.cached).toBe(false);
    expect(mockRunTavilySearch).toHaveBeenCalledWith("ship news");
    expect(mockSaveWebSearchCache).toHaveBeenCalled();
    expect(mockLogUsageEvent).toHaveBeenCalled();
  });
});
