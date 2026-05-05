import {
  rememberPendingOAuthProvider,
  getPendingOAuthProvider,
  clearPendingOAuthProvider,
  clearOAuthErrorFromLocation,
  getOAuthInterruptedMessage,
  readOAuthErrorFromLocation,
  formatOAuthErrorMessage,
} from "@/lib/oauth-client";

// Reset sessionStorage and URL before each test.
beforeEach(() => {
  window.sessionStorage.clear();
  window.history.pushState({}, "", "/");
});

// ---------------------------------------------------------------------------
// rememberPendingOAuthProvider / getPendingOAuthProvider / clearPendingOAuthProvider
// ---------------------------------------------------------------------------
describe("rememberPendingOAuthProvider / getPendingOAuthProvider / clearPendingOAuthProvider", () => {
  it("stores and retrieves 'google' as a pending provider", () => {
    rememberPendingOAuthProvider("google");
    expect(getPendingOAuthProvider()).toBe("google");
  });

  it("stores and retrieves 'github' as a pending provider", () => {
    rememberPendingOAuthProvider("github");
    expect(getPendingOAuthProvider()).toBe("github");
  });

  it("returns null when no provider has been stored", () => {
    expect(getPendingOAuthProvider()).toBeNull();
  });

  it("returns null after clearing the stored provider", () => {
    rememberPendingOAuthProvider("google");
    clearPendingOAuthProvider();
    expect(getPendingOAuthProvider()).toBeNull();
  });

  it("overwrites a previously stored provider", () => {
    rememberPendingOAuthProvider("google");
    rememberPendingOAuthProvider("github");
    expect(getPendingOAuthProvider()).toBe("github");
  });

  it("returns null when an unrecognised value is in sessionStorage", () => {
    window.sessionStorage.setItem("assistantx.oauth-pending-provider", "twitter");
    expect(getPendingOAuthProvider()).toBeNull();
  });

  it("returns null when sessionStorage contains an empty string", () => {
    window.sessionStorage.setItem("assistantx.oauth-pending-provider", "");
    expect(getPendingOAuthProvider()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getOAuthInterruptedMessage
// ---------------------------------------------------------------------------
describe("getOAuthInterruptedMessage", () => {
  it("returns a generic interrupted message when no provider is given", () => {
    const msg = getOAuthInterruptedMessage();
    expect(msg).toContain("interrupted");
    expect(msg).toContain("try again");
  });

  it("returns a provider-specific message for 'google'", () => {
    const msg = getOAuthInterruptedMessage("google");
    expect(msg).toContain("Google");
    expect(msg).toContain("interrupted");
  });

  it("returns a provider-specific message for 'github'", () => {
    const msg = getOAuthInterruptedMessage("github");
    expect(msg).toContain("GitHub");
    expect(msg).toContain("interrupted");
  });

  it("returns the generic message when provider is null", () => {
    const msg = getOAuthInterruptedMessage(null);
    expect(msg).toContain("interrupted");
    expect(msg).not.toContain("Google");
    expect(msg).not.toContain("GitHub");
  });

  it("returns the generic message when provider is undefined", () => {
    const msg = getOAuthInterruptedMessage(undefined);
    expect(msg).toContain("interrupted");
  });
});

// ---------------------------------------------------------------------------
// formatOAuthErrorMessage
// ---------------------------------------------------------------------------
describe("formatOAuthErrorMessage", () => {
  it("returns 'not enabled' message when error mentions unsupported provider", () => {
    const msg = formatOAuthErrorMessage("google", { message: "unsupported provider" });
    expect(msg.toLowerCase()).toContain("not enabled");
    expect(msg).toContain("Google");
  });

  it("returns 'not enabled' message when error mentions provider is not enabled", () => {
    const msg = formatOAuthErrorMessage("github", { message: "provider is not enabled for this app" });
    expect(msg.toLowerCase()).toContain("not enabled");
    expect(msg).toContain("GitHub");
  });

  it("returns interrupted message when error mentions 'cancel'", () => {
    const msg = formatOAuthErrorMessage("google", { message: "User cancel" });
    expect(msg).toContain("interrupted");
  });

  it("returns interrupted message when error mentions 'closed'", () => {
    const msg = formatOAuthErrorMessage("github", { message: "Popup window closed" });
    expect(msg).toContain("interrupted");
  });

  it("returns exchange error message when error mentions 'unable to exchange external code'", () => {
    const msg = formatOAuthErrorMessage("google", {
      message: "unable to exchange external code: bad_code",
    });
    expect(msg).toContain("Google");
    expect(msg.toLowerCase()).toContain("verify");
  });

  it("returns the raw error message for a generic error string", () => {
    const msg = formatOAuthErrorMessage("google", { message: "Something unexpected happened" });
    expect(msg).toBe("Something unexpected happened");
  });

  it("returns the fallback message when error object has no message property", () => {
    const msg = formatOAuthErrorMessage("google", {});
    expect(msg.toLowerCase()).toContain("sign-in failed");
    expect(msg).toContain("Google");
  });

  it("returns the fallback message for a non-object, non-Error value", () => {
    const msg = formatOAuthErrorMessage("github", "raw string error" as unknown as Error);
    expect(msg.toLowerCase()).toContain("sign-in failed");
  });

  it("uses Error.message for a native Error instance", () => {
    const msg = formatOAuthErrorMessage("google", new Error("cancel flow"));
    expect(msg).toContain("interrupted");
  });

  it("returns the fallback when Error.message is empty", () => {
    const msg = formatOAuthErrorMessage("github", new Error(""));
    expect(msg.toLowerCase()).toContain("sign-in failed");
  });
});

// ---------------------------------------------------------------------------
// clearOAuthErrorFromLocation
// ---------------------------------------------------------------------------
describe("clearOAuthErrorFromLocation", () => {
  it("removes the 'error' query param from the URL", () => {
    window.history.pushState({}, "", "/?error=access_denied&other=value");
    clearOAuthErrorFromLocation();
    expect(window.location.search).not.toContain("error=");
    expect(window.location.search).toContain("other=value");
  });

  it("clears the hash from the URL", () => {
    window.history.pushState({}, "", "/#error=some_error");
    clearOAuthErrorFromLocation();
    expect(window.location.hash).toBe("");
  });

  it("leaves the pathname intact after clearing", () => {
    window.history.pushState({}, "", "/dashboard?error=something");
    clearOAuthErrorFromLocation();
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).not.toContain("error=");
  });

  it("is a no-op when there is no error param or hash", () => {
    window.history.pushState({}, "", "/dashboard");
    clearOAuthErrorFromLocation();
    expect(window.location.pathname).toBe("/dashboard");
    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("");
  });

  it("removes the 'error_code' query param from the URL", () => {
    window.history.pushState({}, "", "/?error_code=oauth_exchange_failed&other=value");
    clearOAuthErrorFromLocation();
    expect(window.location.search).not.toContain("error_code=");
    expect(window.location.search).toContain("other=value");
  });

  it("removes both 'error' and 'error_code' when both are present", () => {
    window.history.pushState({}, "", "/?error=access_denied&error_code=oauth_exchange_failed");
    clearOAuthErrorFromLocation();
    expect(window.location.search).not.toContain("error=");
    expect(window.location.search).not.toContain("error_code=");
  });
});

// ---------------------------------------------------------------------------
// readOAuthErrorFromLocation
// ---------------------------------------------------------------------------
describe("readOAuthErrorFromLocation", () => {
  it("returns empty string when there is no hash or search error", () => {
    window.history.pushState({}, "", "/");
    expect(readOAuthErrorFromLocation("google")).toBe("");
  });

  it("returns the hash error_description for a generic hash error", () => {
    const desc = "Something went wrong during OAuth";
    window.history.pushState(
      {},
      "",
      `/#error=server_error&error_description=${encodeURIComponent(desc)}`
    );
    const msg = readOAuthErrorFromLocation("google");
    expect(msg).toBe(desc);
  });

  it("returns an interrupted message when hash error is access_denied", () => {
    window.history.pushState(
      {},
      "",
      `/#error=access_denied&error_description=${encodeURIComponent("User denied access")}`
    );
    const msg = readOAuthErrorFromLocation("google");
    expect(msg).toContain("interrupted");
  });

  it("returns an interrupted message when hash error_code is access_denied", () => {
    window.history.pushState(
      {},
      "",
      `/#error_code=access_denied&error_description=${encodeURIComponent("Access denied")}`
    );
    const msg = readOAuthErrorFromLocation("github");
    expect(msg).toContain("interrupted");
  });

  it("returns an exchange error message when hash error_description mentions exchange failure", () => {
    const desc = "Unable to exchange external code: bad_code";
    window.history.pushState(
      {},
      "",
      `/#error=server_error&error_description=${encodeURIComponent(desc)}`
    );
    const msg = readOAuthErrorFromLocation("google");
    expect(msg).toContain("Google");
    expect(msg.toLowerCase()).toContain("verify");
  });

  it("returns a formatted message when search error_code is oauth_exchange_failed", () => {
    window.history.pushState(
      {},
      "",
      "/?error=exchange+failed&error_code=oauth_exchange_failed"
    );
    const msg = readOAuthErrorFromLocation("github");
    expect(msg).toContain("GitHub");
    expect(msg.toLowerCase()).toContain("verify");
  });

  it("returns a formatted message when search error mentions 'unable to exchange external code'", () => {
    const errMsg = "unable to exchange external code: something";
    window.history.pushState(
      {},
      "",
      `/?error=${encodeURIComponent(errMsg)}`
    );
    const msg = readOAuthErrorFromLocation("google");
    expect(msg).toContain("Google");
    expect(msg.toLowerCase()).toContain("verify");
  });

  it("returns the plain search error string for a generic search error", () => {
    window.history.pushState({}, "", "/?error=something_generic");
    const msg = readOAuthErrorFromLocation(null);
    expect(msg).toBe("something_generic");
  });

  it("returns empty string when search has no error param", () => {
    window.history.pushState({}, "", "/?other=param");
    expect(readOAuthErrorFromLocation("google")).toBe("");
  });

  it("uses the provider label in exchange error messages from search params", () => {
    window.history.pushState(
      {},
      "",
      "/?error=unable+to+exchange+external+code"
    );
    const msg = readOAuthErrorFromLocation("github");
    expect(msg).toContain("GitHub");
  });
});
