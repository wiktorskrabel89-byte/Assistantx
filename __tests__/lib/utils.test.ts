import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes with falsy values", () => {
    expect(cn("foo", false && "bar", undefined, null, "baz")).toBe("foo baz");
  });

  it("resolves conflicting Tailwind utility classes (last wins)", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("merges Tailwind variants correctly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("handles an array of class names", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("handles object syntax from clsx", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
  });

  it("returns empty string for no arguments", () => {
    expect(cn()).toBe("");
  });

  it("returns empty string for all falsy arguments", () => {
    expect(cn(false, undefined, null, "")).toBe("");
  });

  it("handles mixed input types", () => {
    expect(cn("base", { active: true, disabled: false }, ["extra"])).toBe(
      "base active extra"
    );
  });
});
