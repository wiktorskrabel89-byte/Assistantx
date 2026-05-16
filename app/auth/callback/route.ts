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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const publicOrigin = getPublicRequestOrigin(request);
  const isSecureRequest = publicOrigin.startsWith("https://");
  const callbackUrl = new URL("/auth/callback", publicOrigin).toString();
  const supabaseProviderCallbackUrl = new URL("/auth/v1/callback", process.env.NEXT_PUBLIC_SUPABASE_URL).toString();
  const code = requestUrl.searchParams.get("code");
  const client = requestUrl.searchParams.get("client");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const state = requestUrl.searchParams.get("state") ?? "";

  if (!code) {
    const url = new URL("/auth/login", publicOrigin);
    url.searchParams.set("error", "Missing auth code.");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

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
  const desktopCallbackUrl = new URL("/jarvis/callback", publicOrigin);
  if (data.session?.access_token) {
    const hashParams = new URLSearchParams({
      access_token: data.session.access_token,
      email: data.user?.email ?? "",
      user_id: data.user?.id ?? "",
      signed_in_at: new Date().toISOString(),
    });
    if (state) hashParams.set("state", state);
    desktopCallbackUrl.hash = hashParams.toString();
  }
  const response = NextResponse.redirect(
    client === "jarvis-desktop" && data.session?.access_token
      ? desktopCallbackUrl
      : new URL(redirectPath, publicOrigin)
  );
  const providerValue = data.user?.app_metadata?.provider;
  const provider = isOAuthProvider(typeof providerValue === "string" ? providerValue : null) ? providerValue : null;

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

  return response;
}
