import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";

/**
 * DEBUG ENDPOINT - Shows OAuth configuration issues
 * Access at: /api/debug/oauth-config
 * 
 * WARNING: Remove this endpoint in production!
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = request.headers.get("host");
  const publicOrigin = forwardedHost
    ? `${forwardedProto ?? "https"}://${forwardedHost}`
    : host
      ? `${requestUrl.protocol}//${host}`
      : requestUrl.origin;
  const appCallbackUrl = `${publicOrigin}/auth/callback`;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseProviderCallbackUrl = supabaseUrl
    ? new URL("/auth/v1/callback", supabaseUrl).toString()
    : "[MISSING NEXT_PUBLIC_SUPABASE_URL]";

  try {
    await createClient();

    return NextResponse.json(
      {
        environment: process.env.NODE_ENV,
        appUrl: {
          origin: publicOrigin,
          callbackUrl: appCallbackUrl,
          description: "The URL your app redirects to after OAuth",
        },
        supabase: {
          url: supabaseUrl,
          providerCallbackUrl: supabaseProviderCallbackUrl,
          description:
            "The URL registered in Google Cloud OAuth app — usually supabase-url/auth/v1/callback",
        },
        configuration: {
          appCallbackMustBeIn: "Supabase Auth → Redirect URLs",
          providerCallbackMustBeIn:
            "Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs",
        },
        nextSteps: [
          `1. In Supabase Auth → Redirect URLs, ensure you have: ${appCallbackUrl}`,
          `2. In Google Cloud OAuth app, ensure you have: ${supabaseProviderCallbackUrl}`,
          "3. After saving, clear browser cache and try login again",
        ],
        note: "This endpoint is for development debugging only. Remove in production.",
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to generate OAuth config debug info",
        message: error instanceof Error ? error.message : String(error),
        appCallbackUrl,
        supabaseProviderCallbackUrl,
      },
      { status: 500 }
    );
  }
}
