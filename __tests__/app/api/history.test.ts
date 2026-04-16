/**
 * @jest-environment node
 */
import { GET, POST, DELETE } from "@/app/api/history/route";

const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockDelete = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockEq = jest.fn();
const mockFrom = jest.fn();
const mockGetUser = jest.fn();

const FAKE_USER = { id: "user-123" };

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      from: mockFrom,
      auth: { getUser: mockGetUser },
    })
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();

  mockGetUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });

  // GET chain: select → eq → order → limit
  mockLimit.mockResolvedValue({ data: [], error: null });
  mockOrder.mockReturnValue({ limit: mockLimit });
  mockEq.mockReturnValue({ order: mockOrder });
  mockSelect.mockReturnValue({ eq: mockEq });

  // POST
  mockInsert.mockResolvedValue({ error: null });

  // DELETE chain: delete → eq
  mockDelete.mockReturnValue({ eq: mockEq });

  mockFrom.mockImplementation(() => ({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  }));
});

describe("GET /api/history", () => {
  it("returns messages array on success", async () => {
    const rows = [
      { id: 1, user_message: "hi", ai_message: "hello", model: "gpt-5" },
    ];
    mockLimit.mockResolvedValueOnce({ data: rows, error: null });

    const res = await GET();
    const json = await res.json();

    expect(json.messages).toEqual(rows);
  });

  it("returns empty messages array when supabase returns no rows", async () => {
    mockLimit.mockResolvedValueOnce({ data: null, error: null });

    const res = await GET();
    const json = await res.json();

    expect(json.messages).toEqual([]);
  });

  it("returns empty messages array on error", async () => {
    mockLimit.mockResolvedValueOnce({
      data: null,
      error: new Error("db error"),
    });

    const res = await GET();
    const json = await res.json();

    expect(json.messages).toEqual([]);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const res = await GET();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.messages).toEqual([]);
  });

  it("returns empty messages when getUser throws", async () => {
    mockGetUser.mockResolvedValueOnce({ data: {}, error: new Error("auth error") });

    const res = await GET();
    const json = await res.json();
    expect(json.messages).toEqual([]);
  });
});

describe("POST /api/history", () => {
  function makeRequest(body: object) {
    return new Request("http://localhost/api/history", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns ok:true on successful insert", async () => {
    const req = makeRequest({
      user: "Hello",
      ai: "Hi there",
      model: "gpt-5",
    });

    const res = await POST(req);
    const json = await res.json();

    expect(json.ok).toBe(true);
  });

  it("inserts with user_id from authenticated user", async () => {
    const req = makeRequest({ user: "Hello", ai: "Hi", model: "gpt-5" });
    await POST(req);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: FAKE_USER.id })
    );
  });

  it("passes imageUrl as null when not provided", async () => {
    const req = makeRequest({ user: "Hello", ai: "Hi", model: "gpt-5" });
    await POST(req);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: null })
    );
  });

  it("passes imageUrl when provided", async () => {
    const req = makeRequest({
      user: "Look",
      ai: "I see",
      model: "gpt-5",
      imageUrl: "https://example.com/img.png",
    });
    await POST(req);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ image_url: "https://example.com/img.png" })
    );
  });

  it("returns ok:false on insert error", async () => {
    mockInsert.mockResolvedValueOnce({ error: new Error("insert failed") });

    const req = makeRequest({ user: "Hello", ai: "Hi", model: "gpt-5" });
    const res = await POST(req);
    const json = await res.json();

    expect(json.ok).toBe(false);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const req = makeRequest({ user: "Hello", ai: "Hi", model: "gpt-5" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});

describe("DELETE /api/history", () => {
  it("returns ok:true on successful delete", async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    const res = await DELETE();
    const json = await res.json();

    expect(json.ok).toBe(true);
  });

  it("calls delete with eq user_id to delete user rows", async () => {
    mockEq.mockResolvedValueOnce({ error: null });

    await DELETE();

    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("user_id", FAKE_USER.id);
  });

  it("returns ok:false on delete error", async () => {
    mockEq.mockResolvedValueOnce({ error: new Error("delete failed") });

    const res = await DELETE();
    const json = await res.json();

    expect(json.ok).toBe(false);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    const res = await DELETE();
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
