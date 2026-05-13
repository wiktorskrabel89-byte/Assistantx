/**
 * @jest-environment node
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/server";
import { GET as linkedAccountsGET } from "@/app/api/jarvis/linked-accounts/route";
import { POST as githubPOST } from "@/app/api/jarvis/linked-accounts/github/route";

const mockCreateClient = createClient as jest.Mock;
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("Jarvis linked accounts routes", () => {
  it("returns 503 for GET /api/jarvis/linked-accounts when Supabase config is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const res = await linkedAccountsGET(new Request("http://localhost/api/jarvis/linked-accounts") as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(503);
    const body = await res.json() as { code?: string };
    expect(body.code).toBe("linked_accounts_not_configured");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns 503 for POST /api/jarvis/linked-accounts/github?action=initiate when Supabase config is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    const req = new Request("http://localhost/api/jarvis/linked-accounts/github?action=initiate", { method: "POST" });
    const res = await githubPOST(req as unknown as import("next/server").NextRequest);

    expect(res.status).toBe(503);
    const body = await res.json() as { code?: string };
    expect(body.code).toBe("linked_accounts_not_configured");
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
