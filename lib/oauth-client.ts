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

export function getOAuthInterruptedMessage(provider: OAuthProvider) {
  return `${getProviderLabel(provider)} sign-in was interrupted. You can try again or use another sign-in method.`;
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

  return message || fallback;
}