/**
 * @jest-environment node
 */

jest.mock("@/lib/server", () => ({
  createClient: jest.fn(),
}));

import { createClient } from "@/lib/server";
import { POST as generatePOST } from "@/app/api/pairing/generate/route";
import { POST as confirmPOST } from "@/app/api/pairing/confirm/route";
import { GET as statusGET } from "@/app/api/pairing/status/route";

const mockCreateClient = createClient as jest.Mock;

type PairRow = {
  pairing_code: string;
  status: "pending" | "paired" | "expired";
  expires_at: string;
  paired_at: string | null;
  initiator_device: "phone" | "pc";
  created_at: string;
};

function createQueryBuilder({
  maybeSingleData = null as unknown,
  maybeSingleError = null as Error | null,
  singleData = null as unknown,
  singleError = null as Error | null,
  updateError = null as Error | null,
  rpcData = true as unknown,
  rpcError = null as Error | null,
} = {}) {
  const builder = {
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    lte: jest.fn().mockResolvedValue({ error: updateError }),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: maybeSingleData, error: maybeSingleError }),
    single: jest.fn().mockResolvedValue({ data: singleData, error: singleError }),
  };

  const supabase = {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    },
    from: jest.fn().mockReturnValue(builder),
    rpc: jest.fn().mockResolvedValue({ data: rpcData, error: rpcError }),
  };

  return { supabase, builder };
}

describe("pairing routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  });

  it("generates a pairing code for an authenticated user", async () => {
    const { supabase } = createQueryBuilder({
      singleData: { pairing_code: "AX7K2P", expires_at: "2026-05-10T16:00:00.000Z" },
    });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await generatePOST(new Request("http://localhost/api/pairing/generate", {
      method: "POST",
      body: JSON.stringify({ initiatorDevice: "phone" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: "AX7K2P",
      expiresAt: "2026-05-10T16:00:00.000Z",
    });
  });

  it("returns pending pairing status when a pending row exists", async () => {
    const pendingRow: PairRow = {
      pairing_code: "AX7K2P",
      status: "pending",
      expires_at: "2026-05-10T16:00:00.000Z",
      paired_at: null,
      initiator_device: "phone",
      created_at: "2026-05-10T15:00:00.000Z",
    };
    const { supabase, builder } = createQueryBuilder();
    builder.maybeSingle
      .mockResolvedValueOnce({ data: pendingRow, error: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await statusGET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "pending",
      code: "AX7K2P",
      expiresAt: "2026-05-10T16:00:00.000Z",
      pairedAt: null,
      initiatorDevice: "phone",
    });
  });

  it("returns paired status when the latest active pairing is already confirmed", async () => {
    const pairedRow: PairRow = {
      pairing_code: "AX7K2P",
      status: "paired",
      expires_at: "2026-05-10T16:00:00.000Z",
      paired_at: "2026-05-10T15:05:00.000Z",
      initiator_device: "phone",
      created_at: "2026-05-10T15:00:00.000Z",
    };
    const { supabase, builder } = createQueryBuilder();
    builder.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: pairedRow, error: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await statusGET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "paired",
      code: "AX7K2P",
      expiresAt: "2026-05-10T16:00:00.000Z",
      pairedAt: "2026-05-10T15:05:00.000Z",
      initiatorDevice: "phone",
    });
  });

  it("confirms a valid pending pairing code", async () => {
    const pendingRow: PairRow = {
      pairing_code: "AX7K2P",
      status: "pending",
      expires_at: "2099-05-10T16:00:00.000Z",
      paired_at: null,
      initiator_device: "phone",
      created_at: "2026-05-10T15:00:00.000Z",
    };
    const confirmedRow: PairRow = {
      ...pendingRow,
      status: "paired",
      paired_at: "2026-05-10T15:10:00.000Z",
    };
    const { supabase, builder } = createQueryBuilder();
    builder.maybeSingle
      .mockResolvedValueOnce({ data: pendingRow, error: null })
      .mockResolvedValueOnce({ data: confirmedRow, error: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await confirmPOST(new Request("http://localhost/api/pairing/confirm", {
      method: "POST",
      body: JSON.stringify({ code: "ax7k2p" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      pairedAt: "2026-05-10T15:10:00.000Z",
    });
    expect(supabase.rpc).toHaveBeenCalledWith("confirm_device_pairing", { p_code: "AX7K2P" });
  });

  it("returns expired when the pairing code is stale", async () => {
    const expiredRow: PairRow = {
      pairing_code: "AX7K2P",
      status: "expired",
      expires_at: "2026-05-10T15:00:00.000Z",
      paired_at: null,
      initiator_device: "phone",
      created_at: "2026-05-10T14:50:00.000Z",
    };
    const { supabase, builder } = createQueryBuilder();
    builder.maybeSingle.mockResolvedValueOnce({ data: expiredRow, error: null });
    mockCreateClient.mockResolvedValue(supabase);

    const response = await confirmPOST(new Request("http://localhost/api/pairing/confirm", {
      method: "POST",
      body: JSON.stringify({ code: "AX7K2P" }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      code: "expired",
      error: "That pairing code has expired.",
    });
  });
});
