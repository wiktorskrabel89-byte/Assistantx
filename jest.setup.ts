import "@testing-library/jest-dom";

// jsdom does not implement scrollIntoView; guard for node environment tests
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = jest.fn();
}

// jsdom does not implement window.matchMedia; provide a minimal stub
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// jsdom does not expose Node.js's TextEncoder / TextDecoder globals; polyfill them
// so components that use the Encoding API (e.g. SSE parsing) work in tests.
if (typeof TextEncoder === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextEncoder, TextDecoder } = require("util") as {
    TextEncoder: typeof globalThis.TextEncoder;
    TextDecoder: typeof globalThis.TextDecoder;
  };
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}
