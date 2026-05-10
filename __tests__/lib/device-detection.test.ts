import { getDeviceType, isMobileDevice } from "@/lib/device-detection";

describe("device-detection", () => {
  it("detects mobile user agents", () => {
    expect(isMobileDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(true);
    expect(getDeviceType("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("phone");
  });

  it("detects desktop user agents", () => {
    expect(isMobileDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(false);
    expect(getDeviceType("Mozilla/5.0 (X11; Linux x86_64)")).toBe("pc");
  });
});
