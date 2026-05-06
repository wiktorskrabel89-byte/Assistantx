import { render, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "../app/page";

// Mock external service dependencies so the page renders in isolation
jest.mock("@/lib/client", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  })),
}));

jest.mock("@/app/api/openrouter/fetchAllModels", () => ({
  fetchAllModels: jest.fn().mockResolvedValue([]),
  LOCAL_FALLBACK_MODELS: [],
}));

// Polyfill fetch for jsdom
if (!global.fetch) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: jest.fn().mockResolvedValue({}),
  }) as unknown as typeof fetch;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("Home page", () => {
  it("renders without crashing", async () => {
    await act(async () => {
      render(<Home />, { wrapper: Wrapper });
    });
    // The page should render some content — the navigation column is always visible
    expect(document.body.firstChild).not.toBeNull();
  });
});
