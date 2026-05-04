/**
 * @jest-environment node
 *
 * Tests for GET / POST / PATCH /api/templates/public
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(),
}));

import { NextRequest } from "next/server";
import { createClient as createServerClient } from "@/lib/server";
import { createClient as supabaseCreateClient } from "@supabase/supabase-js";

const mockCreateServerClient = createServerClient as jest.Mock;
const mockSupabaseCreateClient = supabaseCreateClient as jest.Mock;

// Fake templates
const FAKE_TEMPLATES = [
  { id: "t1", display_name: "Alice", label: "Summarise", content: "Summarise this", mode: "chat", upvotes: 10, created_at: "2024-01-01" },
  { id: "t2", display_name: "Bob", label: "Translate", content: "Translate this", mode: "chat", upvotes: 5, created_at: "2024-01-02" },
];

function makeServerSupabase({
  user = { id: "user-1" } as object | null,
  authError = null as Error | null,
  templates = FAKE_TEMPLATES as unknown[],
  fetchError = null as Error | null,
  insertData = FAKE_TEMPLATES[0] as unknown,
  insertError = null as Error | null,
  rpcError = null as Error | null,
} = {}) {
  const rpcMock = jest.fn().mockResolvedValue({ error: rpcError });
  const singleMock = jest.fn().mockResolvedValue({ data: insertData, error: insertError });
  const selectInsertMock = jest.fn().mockReturnValue({ single: singleMock });
  const insertMock = jest.fn().mockReturnValue({ select: selectInsertMock });
  const rangeMock = jest.fn().mockResolvedValue({ data: templates, error: fetchError });
  const orderMock2 = jest.fn().mockReturnValue({ range: rangeMock });
  const orderMock1 = jest.fn().mockReturnValue({ order: orderMock2 });
  const selectMock = jest.fn().mockReturnValue({ order: orderMock1 });

  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user }, error: authError }),
    },
    from: jest.fn().mockReturnValue({
      select: selectMock,
      insert: insertMock,
    }),
    rpc: rpcMock,
  };
}

function makeReq(method: string, url: string, body?: unknown, authToken?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authToken) headers["authorization"] = `Bearer ${authToken}`;
  return new NextRequest(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
describe("GET /api/templates/public", () => {
  let GET: (req: NextRequest) => Promise<Response>;
  beforeAll(async () => {
    ({ GET } = await import("@/app/api/templates/public/route"));
  });

  it("returns template list on success", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);

    const res = await GET(makeReq("GET", "http://localhost/api/templates/public"));
    expect(res.status).toBe(200);
    const body = await res.json() as { templates: unknown[] };
    expect(body.templates).toEqual(FAKE_TEMPLATES);
  });

  it("returns empty templates array when supabase returns null", async () => {
    const supabase = makeServerSupabase({ templates: [] });
    // Make range return null data
    const rangeMock = jest.fn().mockResolvedValue({ data: null, error: null });
    const orderMock2 = jest.fn().mockReturnValue({ range: rangeMock });
    const orderMock1 = jest.fn().mockReturnValue({ order: orderMock2 });
    supabase.from.mockReturnValue({ select: jest.fn().mockReturnValue({ order: orderMock1 }) });
    mockCreateServerClient.mockResolvedValue(supabase);

    const res = await GET(makeReq("GET", "http://localhost/api/templates/public"));
    const body = await res.json() as { templates: unknown[] };
    expect(body.templates).toEqual([]);
  });

  it("returns 500 on supabase error", async () => {
    const supabase = makeServerSupabase({ fetchError: new Error("DB error") });
    mockCreateServerClient.mockResolvedValue(supabase);

    const res = await GET(makeReq("GET", "http://localhost/api/templates/public"));
    expect(res.status).toBe(500);
  });

  it("respects limit and offset query params", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);

    await GET(makeReq("GET", "http://localhost/api/templates/public?limit=10&offset=20"));
    // range(20, 29) should have been called
    const fromMock = supabase.from("public_templates");
    const rangeMock = fromMock.select().order().order().range as jest.Mock;
    expect(rangeMock).toHaveBeenCalledWith(20, 29);
  });

  it("caps limit at 100", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);

    await GET(makeReq("GET", "http://localhost/api/templates/public?limit=500"));
    const fromMock = supabase.from("public_templates");
    const rangeMock = fromMock.select().order().order().range as jest.Mock;
    // limit capped at 100: range(0, 99)
    expect(rangeMock).toHaveBeenCalledWith(0, 99);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
describe("POST /api/templates/public", () => {
  let POST: (req: NextRequest) => Promise<Response>;
  beforeAll(async () => {
    ({ POST } = await import("@/app/api/templates/public/route"));
  });

  it("returns 401 when no bearer token is provided", async () => {
    const res = await POST(makeReq("POST", "http://localhost/api/templates/public", { label: "x", content: "y" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when token is invalid", async () => {
    const supabase = makeServerSupabase({ user: null, authError: new Error("Invalid") });
    mockCreateServerClient.mockResolvedValue(supabase);
    const res = await POST(makeReq("POST", "http://localhost/api/templates/public", { label: "x", content: "y" }, "bad-token"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when label is missing", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);
    const adminSupabase = makeServerSupabase();
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    const res = await POST(makeReq("POST", "http://localhost/api/templates/public", { content: "Some content" }, "valid-token"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);
    const adminSupabase = makeServerSupabase();
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    const res = await POST(makeReq("POST", "http://localhost/api/templates/public", { label: "My Template" }, "valid-token"));
    expect(res.status).toBe(400);
  });

  it("returns 201 with the new template on success", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);
    const adminSupabase = makeServerSupabase();
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    const res = await POST(makeReq("POST", "http://localhost/api/templates/public", {
      label: "My Template",
      content: "Do something helpful",
      mode: "chat",
      displayName: "Alice",
    }, "valid-token"));

    expect(res.status).toBe(201);
    const body = await res.json() as { template: unknown };
    expect(body.template).toBeDefined();
  });

  it("returns 500 on database insert error", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);
    const adminSupabase = makeServerSupabase({ insertError: new Error("Insert failed") });
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    const res = await POST(makeReq("POST", "http://localhost/api/templates/public", {
      label: "My Template",
      content: "Do something helpful",
    }, "valid-token"));
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH (upvote)
// ---------------------------------------------------------------------------
describe("PATCH /api/templates/public", () => {
  let PATCH: (req: NextRequest) => Promise<Response>;
  beforeAll(async () => {
    ({ PATCH } = await import("@/app/api/templates/public/route"));
  });

  it("returns 400 when id is missing", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);

    const res = await PATCH(makeReq("PATCH", "http://localhost/api/templates/public", {}));
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/id/i);
  });

  it("returns 400 when id is an empty string", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);

    const res = await PATCH(makeReq("PATCH", "http://localhost/api/templates/public", { id: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with ok:true on successful upvote", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);
    const adminSupabase = makeServerSupabase();
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    const res = await PATCH(makeReq("PATCH", "http://localhost/api/templates/public", { id: "template-1" }));
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 500 on rpc error", async () => {
    const supabase = makeServerSupabase();
    mockCreateServerClient.mockResolvedValue(supabase);
    const adminSupabase = makeServerSupabase({ rpcError: new Error("RPC failed") });
    mockSupabaseCreateClient.mockReturnValue(adminSupabase);

    const res = await PATCH(makeReq("PATCH", "http://localhost/api/templates/public", { id: "template-1" }));
    expect(res.status).toBe(500);
  });
});
