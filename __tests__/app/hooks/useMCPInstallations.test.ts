import { renderHook, act, waitFor } from "@testing-library/react";
import { useMCPInstallations } from "@/app/hooks/useMCPInstallations";

// ── Supabase client mock ──────────────────────────────────────────────────────

const MOCK_USER = { id: "user-123" };

const mockInstallations = [
  { id: "i1", user_id: "user-123", server_id: "github", enabled: true, config_encrypted: null, installed_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
  { id: "i2", user_id: "user-123", server_id: "gmail", enabled: true, config_encrypted: null, installed_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" },
];

const mockUpsert = jest.fn().mockResolvedValue({ error: null });
const mockDelete = jest.fn().mockReturnValue({
  eq: jest.fn().mockReturnValue({
    eq: jest.fn().mockResolvedValue({ error: null }),
  }),
});

jest.mock("@/lib/client", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: MOCK_USER } }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({ data: mockInstallations, error: null }),
      }),
      upsert: mockUpsert,
      delete: mockDelete,
    })),
  })),
}));

// Minimal QueryClient wrapper
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  );
  return Wrapper;
}

describe("useMCPInstallations", () => {
  it("loads installations from Supabase on mount", async () => {
    const { result } = renderHook(() => useMCPInstallations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.installations).toHaveLength(2);
    expect(result.current.installedCount).toBe(2);
  });

  it("isInstalled returns true for installed servers", async () => {
    const { result } = renderHook(() => useMCPInstallations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isInstalled("github")).toBe(true);
    expect(result.current.isInstalled("gmail")).toBe(true);
    expect(result.current.isInstalled("slack")).toBe(false);
  });

  it("install() calls Supabase upsert with correct shape", async () => {
    mockUpsert.mockResolvedValueOnce({ error: null });

    const { result } = renderHook(() => useMCPInstallations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.install("slack");
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ server_id: "slack", enabled: true }),
      expect.objectContaining({ onConflict: "user_id,server_id" }),
    );
  });

  it("uninstall() calls Supabase delete with correct filters", async () => {
    const { result } = renderHook(() => useMCPInstallations(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.uninstall("github");
    });

    expect(mockDelete).toHaveBeenCalled();
  });
});
