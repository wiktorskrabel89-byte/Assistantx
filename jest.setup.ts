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
