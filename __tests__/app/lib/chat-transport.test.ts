/**
 * @jest-environment node
 */
import { isAbortLikeError } from "@/app/lib/chat-transport";

describe("isAbortLikeError", () => {
  it("returns true for DOMException with name AbortError", () => {
    const err = new DOMException("The operation was aborted.", "AbortError");
    expect(isAbortLikeError(err)).toBe(true);
  });

  it("returns false for DOMException with a different name", () => {
    const err = new DOMException("timeout", "TimeoutError");
    expect(isAbortLikeError(err)).toBe(false);
  });

  it("returns true for Error with name AbortError", () => {
    const err = new Error("cancelled");
    err.name = "AbortError";
    expect(isAbortLikeError(err)).toBe(true);
  });

  it('returns true for Error with "aborted" in message', () => {
    const err = new Error("The request was aborted by the user");
    expect(isAbortLikeError(err)).toBe(true);
  });

  it("returns false for a generic Error", () => {
    expect(isAbortLikeError(new Error("network failure"))).toBe(false);
  });

  it("returns false for non-error values", () => {
    expect(isAbortLikeError(null)).toBe(false);
    expect(isAbortLikeError(undefined)).toBe(false);
    expect(isAbortLikeError("AbortError")).toBe(false);
    expect(isAbortLikeError(42)).toBe(false);
  });
});
