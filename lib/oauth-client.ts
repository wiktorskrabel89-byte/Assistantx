import { getProviderLabel, isOAuthProvider, type OAuthProvider } from "@/lib/integrations";

const OAUTH_PENDING_STORAGE_KEY = "moje-ai.oauth-pending-provider";

type OAuthErrorLike = {
  message?: string | null;
};

export function rememberPendingOAuthProvider(provider: OAuthProvider) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(OAUTH_PENDING_STORAGE_KEY, provider);
}

export function getPendingOAuthProvider() {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(OAUTH_PENDING_STORAGE_KEY);
  return isOAuthProvider(value) ? value : null;
}

export function clearPendingOAuthProvider() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(OAUTH_PENDING_STORAGE_KEY);
}

function decodeOAuthValue(value: string | null) {
  if (!value) return "";
  let decoded = value;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded;
}

export function clearOAuthErrorFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("error");
  url.hash = "";
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
}

export function getOAuthInterruptedMessage(provider?: OAuthProvider | null) {
  if (!provider) {
    return "Sign-in was interrupted. You can try again or use another sign-in method.";
  }

  return `${getProviderLabel(provider)} sign-in was interrupted. You can try again or use another sign-in method.`;
}

export function readOAuthErrorFromLocation(provider?: OAuthProvider | null) {
  if (typeof window === "undefined") return "";

  const hashParams = new URLSearchParams(window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash);
  const hashError = decodeOAuthValue(hashParams.get("error")).toLowerCase();
  const hashErrorCode = decodeOAuthValue(hashParams.get("error_code")).toLowerCase();
  const hashErrorDescription = decodeOAuthValue(hashParams.get("error_description"));

  if (hashErrorDescription) {
    const normalizedDescription = hashErrorDescription.toLowerCase();

    if (normalizedDescription.includes("unable to exchange external code")) {
      const label = provider ? getProviderLabel(provider) : "OAuth";
      return `${label} sign-in could not be completed. Check the provider configuration and allowed redirect URLs in Supabase, then try again.`;
    }

    if (hashError === "access_denied" || hashErrorCode === "access_denied") {
      return getOAuthInterruptedMessage(provider);
    }

    return hashErrorDescription;
  }

  const searchParams = new URLSearchParams(window.location.search);
  return decodeOAuthValue(searchParams.get("error"));
}

export function formatOAuthErrorMessage(provider: OAuthProvider, error: unknown) {
  const label = getProviderLabel(provider);
  const fallback = `${label} sign-in failed. You can try again or use another sign-in method.`;
  const message = error && typeof error === "object" && "message" in error && typeof (error as OAuthErrorLike).message === "string"
    ? (error as OAuthErrorLike).message ?? ""
    : error instanceof Error
      ? error.message
      : "";
  const normalized = message.toLowerCase();

  if (normalized.includes("unsupported provider") || normalized.includes("provider is not enabled")) {
    return `${label} sign-in is not enabled for this app yet. Enable ${label} in Supabase Auth providers, or use another sign-in method.`;
  }

  if (normalized.includes("cancel") || normalized.includes("closed")) {
    return getOAuthInterruptedMessage(provider);
  }

  if (normalized.includes("unable to exchange external code")) {
    return `${label} sign-in could not be completed. Check the provider configuration and allowed redirect URLs in Supabase, then try again.`;
  }

  return message || fallback;
}