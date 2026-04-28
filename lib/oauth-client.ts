import { getProviderLabel, isOAuthProvider, type OAuthProvider } from "@/lib/integrations";

const OAUTH_PENDING_STORAGE_KEY = "assistantx.oauth-pending-provider";

type OAuthErrorLike = {
  code?: string | null;
  message?: string | null;
};

function getBrowserOAuthCallbackUrl() {
  if (typeof window === "undefined") return "/auth/callback";
  return `${window.location.origin}/auth/callback`;
}

function getSupabaseProviderCallbackUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return "[your-supabase-project-url]/auth/v1/callback";
  return new URL("/auth/v1/callback", supabaseUrl).toString();
}

function formatExternalCodeExchangeMessage(
  provider?: OAuthProvider | null,
  callbackUrl?: string | null,
  supabaseProviderCallbackUrl?: string | null,
  rawErrorDetail?: string | null,
) {
  const label = provider ? getProviderLabel(provider) : "OAuth";
  const resolvedCallbackUrl = callbackUrl || getBrowserOAuthCallbackUrl();
  const resolvedSupabaseProviderCallbackUrl = supabaseProviderCallbackUrl || getSupabaseProviderCallbackUrl();
  const detail = rawErrorDetail?.trim();
  const detailSuffix = detail ? ` Raw provider error: ${detail}` : "";
  return `${label} sign-in could not be completed. Verify ${label} is enabled in Supabase, the ${label} client ID and secret are correct, Supabase Auth redirect URLs include ${resolvedCallbackUrl}, and the ${label} OAuth app allows ${resolvedSupabaseProviderCallbackUrl}.${detailSuffix}`;
}

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
      return formatExternalCodeExchangeMessage(provider, undefined, undefined, hashErrorDescription);
    }

    if (hashError === "access_denied" || hashErrorCode === "access_denied") {
      return getOAuthInterruptedMessage(provider);
    }

    return hashErrorDescription;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const searchError = decodeOAuthValue(searchParams.get("error"));
  const searchErrorCode = decodeOAuthValue(searchParams.get("error_code")).toLowerCase();
  const callbackUrl = decodeOAuthValue(searchParams.get("oauth_callback_url"));
  const supabaseProviderCallbackUrl = decodeOAuthValue(searchParams.get("supabase_provider_callback_url"));

  if (
    searchError.toLowerCase().includes("unable to exchange external code") ||
    searchErrorCode === "oauth_exchange_failed"
  ) {
    return formatExternalCodeExchangeMessage(provider, callbackUrl, supabaseProviderCallbackUrl, searchError);
  }

  return searchError;
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
    return formatExternalCodeExchangeMessage(provider, undefined, undefined, message);
  }

  return message || fallback;
}