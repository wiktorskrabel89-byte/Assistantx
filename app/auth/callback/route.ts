import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";
import { getProviderTokenCookieName, isOAuthProvider } from "@/lib/integrations";

function getPublicRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const protocol = forwardedProto || requestUrl.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

function getDesktopRedirectTarget(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    if (url.protocol === "assistantx:" && url.hostname === "auth" && normalizedPath === "/callback") {
      return url;
    }
  } catch {
    return null;
  }
  return null;
}

function isAuthDebugEnabled(): boolean {
  return process.env.AUTH_DEBUG === "true";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicOrigin = getPublicRequestOrigin(request);
  const isSecureRequest = publicOrigin.startsWith("https://");
  const callbackUrl = new URL("/auth/callback", publicOrigin).toString();
  const supabaseProviderCallbackUrl = new URL("/auth/v1/callback", process.env.NEXT_PUBLIC_SUPABASE_URL).toString();
  const code = requestUrl.searchParams.get("code");
  const client = requestUrl.searchParams.get("client");
  const desktopRedirectTarget = getDesktopRedirectTarget(requestUrl.searchParams.get("redirect_to"));
  const next = requestUrl.searchParams.get("next") ?? "/";
  const state = requestUrl.searchParams.get("state") ?? "";

  if (isAuthDebugEnabled()) {
    console.log("[auth-debug][callback] incoming callback params", {
      hasCode: Boolean(code),
      code,
      client,
      next,
      hasDesktopRedirectTarget: Boolean(desktopRedirectTarget),
      state,
    });
  }

  if (!code) {
    const url = new URL("/auth/login", publicOrigin);
    url.searchParams.set("error", "Missing auth code.");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (isAuthDebugEnabled()) {
    console.log("[auth-debug][callback] exchange result", {
      hasSession: Boolean(data?.session),
      userId: data?.user?.id ?? null,
      errorMessage: error?.message ?? null,
      errorCode: error && "code" in error ? error.code : null,
    });
  }

  if (error) {
    console.error("[auth/callback] OAuth code exchange failed", {
      callbackUrl,
      errorCode: "code" in error ? error.code : undefined,
      errorMessage: error.message,
      forwardedHost: request.headers.get("x-forwarded-host"),
      forwardedProto: request.headers.get("x-forwarded-proto"),
      requestHost: request.headers.get("host"),
      supabaseProviderCallbackUrl,
    });

    const url = new URL("/auth/login", publicOrigin);
    url.searchParams.set("error", error.message);
    url.searchParams.set("error_code", "code" in error && typeof error.code === "string" ? error.code : "oauth_exchange_failed");
    url.searchParams.set("oauth_callback_url", callbackUrl);
    url.searchParams.set("supabase_provider_callback_url", supabaseProviderCallbackUrl);
    return NextResponse.redirect(url);
  }

  const redirectPath = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  const providerValue = data.user?.app_metadata?.provider;
  const provider = isOAuthProvider(typeof providerValue === "string" ? providerValue : null) ? providerValue : null;

  function applyProviderCookies(response: NextResponse) {
    for (const candidate of ["google", "github"] as const) {
      const cookieName = getProviderTokenCookieName(candidate);
      const providerToken = candidate === provider ? data.session?.provider_token : null;

      if (providerToken) {
        response.cookies.set(cookieName, providerToken, {
          httpOnly: true,
          secure: isSecureRequest,
          sameSite: "lax",
          path: "/",
          maxAge: Math.max(data.session?.expires_in ?? 3600, 300),
        });
      } else {
        response.cookies.set(cookieName, "", {
          maxAge: 0,
          path: "/",
          sameSite: "lax",
        });
      }
    }
  }

  const isDesktop = (client === "jarvis-desktop" || Boolean(desktopRedirectTarget)) && Boolean(data.session?.access_token);

  if (isDesktop) {
    const target = desktopRedirectTarget ?? new URL("assistantx://auth/callback");
    const queryParams = new URLSearchParams({
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token ?? "",
      token_type: "bearer",
      email: data.user?.email ?? "",
      user_id: data.user?.id ?? "",
      signed_in_at: data.user?.last_sign_in_at ?? data.session?.user?.last_sign_in_at ?? new Date().toISOString(),
    });
    if (state) queryParams.set("state", state);
    target.search = queryParams.toString();
    const response = NextResponse.redirect(target.toString());
    applyProviderCookies(response);
    return response;
  }

  const response = NextResponse.redirect(new URL(redirectPath, publicOrigin));
  applyProviderCookies(response);
  return response;
}
