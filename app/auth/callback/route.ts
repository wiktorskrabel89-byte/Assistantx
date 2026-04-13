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
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";

  if (!code) {
    const url = new URL("/auth/login", publicOrigin);
    url.searchParams.set("error", "Missing auth code.");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/auth/login", publicOrigin);
    url.searchParams.set("error", error.message);
    return NextResponse.redirect(url);
  }

  const redirectPath = next.startsWith("/") ? next : "/";
  const response = NextResponse.redirect(new URL(redirectPath, publicOrigin));
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