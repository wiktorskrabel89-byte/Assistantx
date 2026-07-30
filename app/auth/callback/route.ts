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
  const desktopState = requestUrl.searchParams.get("desktop_state") ?? requestUrl.searchParams.get("state") ?? "";

  if (isAuthDebugEnabled()) {
    console.log("[auth-debug][callback] incoming callback params", {
      hasCode: Boolean(code),
      code,
      client,
      next,
      hasDesktopRedirectTarget: Boolean(desktopRedirectTarget),
      hasDesktopState: Boolean(desktopState),
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
    const setCookie = response.cookies?.set?.bind(response.cookies);
    if (!setCookie) return;

    for (const candidate of ["google", "github"] as const) {
      const cookieName = getProviderTokenCookieName(candidate);
      const providerToken = candidate === provider ? data.session?.provider_token : null;

      if (providerToken) {
        setCookie(cookieName, providerToken, {
          httpOnly: true,
          secure: isSecureRequest,
          sameSite: "lax",
          path: "/",
          maxAge: Math.max(data.session?.expires_in ?? 3600, 300),
        });
      } else {
        setCookie(cookieName, "", {
          maxAge: 0,
          path: "/",
          sameSite: "lax",
        });
      }
    }
  }

  const isDesktop = Boolean(desktopRedirectTarget) && Boolean(data.session?.access_token);

  if (isDesktop) {
    const target = desktopRedirectTarget!;
    const queryParams = new URLSearchParams({
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token ?? "",
      token_type: "bearer",
      email: data.user?.email ?? "",
      user_id: data.user?.id ?? "",
      signed_in_at: data.user?.last_sign_in_at ?? data.session?.user?.last_sign_in_at ?? new Date().toISOString(),
    });
    if (desktopState) {
      queryParams.set("desktop_state", desktopState);
      queryParams.set("state", desktopState);
    }
    target.search = queryParams.toString();
    const tokenUrl = target.toString();
    console.log("[desktop-auth] redirect target:", tokenUrl);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Returning to Jarvis…</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: #0b0d10;
    color: #e2e8f0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(125,211,252,0.15);
    border-radius: 16px;
    padding: 40px 36px;
    max-width: 420px;
    width: 100%;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }
  .icon {
    width: 56px; height: 56px;
    background: rgba(125,211,252,0.1);
    border: 1px solid rgba(125,211,252,0.25);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px;
    font-size: 24px;
  }
  h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 8px; }
  .sub { color: rgba(226,232,240,0.5); font-size: 0.875rem; line-height: 1.5; margin-bottom: 28px; }
  .btn {
    display: inline-flex; align-items: center; gap: 8px;
    background: linear-gradient(135deg, #7dd3fc 0%, #38bdf8 100%);
    color: #0b0d10;
    font-weight: 600; font-size: 0.9rem;
    padding: 12px 24px;
    border-radius: 10px;
    border: none; cursor: pointer;
    text-decoration: none;
    transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.85; }
  .hint {
    margin-top: 20px;
    color: rgba(226,232,240,0.3);
    font-size: 0.75rem;
    line-height: 1.5;
  }
  .spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(11,13,16,0.3);
    border-top-color: #0b0d10;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  #status { margin-top: 12px; font-size: 0.8rem; color: rgba(226,232,240,0.4); min-height: 20px; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">🔐</div>
  <h1>Returning to Jarvis…</h1>
  <p class="sub">Sign-in successful. Opening the Jarvis desktop app now.</p>
  <a href="${tokenUrl}" class="btn" id="open-btn">
    <span class="spinner"></span>
    Open Jarvis
  </a>
  <p id="status">Opening automatically in <span id="countdown">3</span>s…</p>
  <p class="hint">Keep this tab open until Jarvis confirms sign-in.<br>If the app doesn't open, click the button above.</p>
</div>
<script>
  var url = ${JSON.stringify(tokenUrl)};
  var countdown = 3;
  var el = document.getElementById('countdown');
  var status = document.getElementById('status');
  var btn = document.getElementById('open-btn');

  // Remove spinner from button after click
  btn.addEventListener('click', function() {
    btn.querySelector('.spinner').style.display = 'none';
    status.textContent = 'Opened! You can close this tab.';
  });

  // Auto-redirect after short delay
  setTimeout(function() { window.location.href = url; }, 300);

  var timer = setInterval(function() {
    countdown--;
    if (el) el.textContent = countdown;
    if (countdown <= 0) {
      clearInterval(timer);
      status.textContent = 'If Jarvis didn\\'t open, click the button above.';
    }
  }, 1000);
</script>
</body>
</html>`;

    const htmlResponse = new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    // Apply provider cookies — cast needed since Response !== NextResponse
    applyProviderCookies(htmlResponse as unknown as NextResponse);
    return htmlResponse;
  }

  const response = NextResponse.redirect(new URL(redirectPath, publicOrigin));
  applyProviderCookies(response);
  return response;
}
