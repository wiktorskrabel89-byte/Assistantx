/**
 * Tests for app/support/page.tsx
 *
 * Covers:
 * - Failed fetch: error message is displayed and no duplicate bubbles are added
 * - SSE token streaming: tokens are accumulated and rendered in the assistant bubble
 * - Empty stream: shows a fallback "couldn't get a response" message
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SupportPage from "@/app/support/page";

// Ensure `fetch` exists on globalThis so jest.spyOn can intercept it.
// (jsdom does not always expose the Node.js global fetch.)
if (!("fetch" in globalThis)) {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: jest.fn(),
  });
}

/** Creates a fake fetch response that simulates SSE tokens over a body stream. */
function mockSSEFetch(tokens: string[]) {
  const lines = tokens.map((t) => `data: ${JSON.stringify({ token: t })}`).join("\n") + "\ndata: [DONE]\n";
  const bytes = new TextEncoder().encode(lines);
  let sent = false;
  const fakeBody = {
    getReader: () => ({
      read: async () => {
        if (sent) return { done: true as const, value: undefined };
        sent = true;
        return { done: false as const, value: bytes };
      },
    }),
  };
  return Promise.resolve({
    ok: true,
    body: fakeBody,
    text: () => Promise.resolve(lines),
  } as unknown as globalThis.Response);
}

/** Creates a fake fetch response that simulates a non-OK HTTP error. */
function mockErrorFetch(status: number, text = "Error") {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(text),
    statusText: text,
  } as unknown as globalThis.Response);
}

/** Creates a fake fetch response with an empty SSE body (no tokens). */
function mockEmptySSEFetch() {
  const bytes = new TextEncoder().encode("data: [DONE]\n");
  let sent = false;
  const fakeBody = {
    getReader: () => ({
      read: async () => {
        if (sent) return { done: true as const, value: undefined };
        sent = true;
        return { done: false as const, value: bytes };
      },
    }),
  };
  return Promise.resolve({
    ok: true,
    body: fakeBody,
    text: () => Promise.resolve("data: [DONE]\n"),
  } as unknown as globalThis.Response);
}

describe("SupportPage", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders the initial assistant greeting", () => {
    render(<SupportPage />);
    expect(screen.getByText(/AssistantX Support Assistant/i)).toBeInTheDocument();
  });

  it("displays an error bubble when fetch rejects (network error)", async () => {
    jest.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    render(<SupportPage />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello?" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText(/sorry, there was an error/i)).toBeInTheDocument();
    });
  });

  it("displays an error bubble when the server returns a non-OK status", async () => {
    jest.spyOn(globalThis, "fetch").mockReturnValue(mockErrorFetch(500, "Internal Server Error"));

    render(<SupportPage />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hello?" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText(/sorry, there was an error/i)).toBeInTheDocument();
    });
  });

  it("accumulates SSE tokens into the assistant bubble", async () => {
    jest.spyOn(globalThis, "fetch").mockReturnValue(mockSSEFetch(["Hel", "lo", " world"]));

    render(<SupportPage />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Hi" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("shows a fallback message when the server responds with an empty stream", async () => {
    jest.spyOn(globalThis, "fetch").mockReturnValue(mockEmptySSEFetch());

    render(<SupportPage />);
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Ping" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(screen.getByText(/couldn't get a response/i)).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});
