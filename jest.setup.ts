import "@testing-library/jest-dom";

// jsdom does not implement scrollIntoView; guard for node environment tests
if (typeof Element !== "undefined") {
  Element.prototype.scrollIntoView = jest.fn();
}
