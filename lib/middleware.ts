import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  detectPreferredPublicLanguage,
  normalizePublicLanguage,
  UI_LANGUAGE_COOKIE_NAME,
} from '@/app/lib/ui-language'

const PUBLIC_METADATA_PATHS = new Set(['/manifest.json', '/manifest.webmanifest'])
const PUBLIC_UPDATER_ROOT_PATHS = new Set([
  '/latest.yml',
  '/latest.yml.sig',
  '/latest-mac.yml',
  '/latest-mac.yml.sig',
  '/release-notes.json',
  '/versions.json',
  '/updates/versions.json',
])
const PUBLIC_UPDATER_PATH_PREFIXES = [
  '/windows/',
  '/linux/',
  '/mac/',
  '/android/',
  '/beta/windows/',
  '/beta/linux/',
  '/beta/mac/',
  '/beta/android/',
]
const AUTH_OPTIONAL_PATH_PREFIXES = ['/auth', '/privacy', '/terms', '/support', '/demo', '/roadmap', '/pricing']
const AUTH_REDIRECT_EXCLUDED_PREFIXES = ['/api', '/auth', '/login', '/privacy', '/terms', '/support', '/demo', '/roadmap', '/pricing']
const PUBLIC_UPDATER_FILE_PATTERN =
  /(?:^|\/)(?:latest(?:-[^/]+)?\.yml(?:\.sig)?|release-notes\.json|[^/]+\.(?:exe|nupkg|dmg|appimage|apk|blockmap))$/i

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}

function isAuthOptionalPath(pathname: string): boolean {
  return pathname === '/' || AUTH_OPTIONAL_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isPublicUpdaterPath(pathname: string): boolean {
  if (PUBLIC_UPDATER_ROOT_PATHS.has(pathname)) return true

  return (
    PUBLIC_UPDATER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    && PUBLIC_UPDATER_FILE_PATTERN.test(pathname)
  )
}

function isAuthDebugEnabled(): boolean {
  return process.env.AUTH_DEBUG === 'true'
}

/**
 * Builds a per-request Content-Security-Policy header value.
 *
 * The nonce is included in script-src so modern browsers enforce it and
 * silently ignore the 'unsafe-inline' fallback that is kept only for
 * compatibility with older user-agents.  'unsafe-eval' is only permitted
 * in development (required by Next.js webpack HMR).
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development'
  const directives = [
    "default-src 'self'",
    // 'unsafe-inline' is overridden by the nonce in browsers that support it;
    // kept as a fallback.  'unsafe-eval' only in dev for HMR.
    `script-src 'self' 'nonce-${nonce}' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://assistantx.pl https://cdn.jsdelivr.net`,
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    // Restrict images to HTTPS + safe data URIs; avoid the broad wildcard '*'
    "img-src 'self' blob: data: https:",
    // Allow Google Fonts, self-hosted fonts, and data-URI fonts (Monaco editor codicons)
    "font-src 'self' https://fonts.gstatic.com data:",
    // API and WebSocket connections are allowed to any origin (LLM providers etc.)
    "connect-src *",
    // Monaco Editor creates blob workers and the app registers a service worker
    "worker-src 'self' blob:",
    // No iframes at all
    "frame-src 'none'",
    // Block this page from being embedded in any frame (CSP equivalent of X-Frame-Options: DENY)
    "frame-ancestors 'none'",
    // No Flash / other plugins
    "object-src 'none'",
    // Prevent base-tag hijacking
    "base-uri 'self'",
    // Limit form submissions to same origin
    "form-action 'self'",
  ]
  return directives.join('; ')
}

export async function updateSession(request: NextRequest) {
  // Generate a cryptographically strong nonce using raw random bytes.
  // crypto.getRandomValues() fills a Uint8Array with random bytes which is
  // then base64-encoded — providing much more entropy than a UUID string.
  const nonceBytes = new Uint8Array(16)
  crypto.getRandomValues(nonceBytes)
  const nonce = btoa(String.fromCharCode(...nonceBytes))
  const csp = buildCsp(nonce)
  const pathname = request.nextUrl.pathname
  const existingLangCookie = request.cookies.get(UI_LANGUAGE_COOKIE_NAME)?.value ?? null
  const detectedUiLanguage = detectPreferredPublicLanguage({
    existingCookie: existingLangCookie,
    countryCode: request.headers.get('x-vercel-ip-country'),
    acceptLanguage: request.headers.get('accept-language'),
  })

  // Propagate the nonce to server components via a request header
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-assistantx-ui-language', detectedUiLanguage)

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

  if (
    PUBLIC_METADATA_PATHS.has(pathname)
    || isPublicUpdaterPath(pathname)
    || !hasSupabaseConfig()
    || isAuthOptionalPath(pathname)
  ) {
    if (!existingLangCookie) {
      supabaseResponse.cookies.set(UI_LANGUAGE_COOKIE_NAME, detectedUiLanguage, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      })
    } else if (normalizePublicLanguage(existingLangCookie) !== detectedUiLanguage) {
      requestHeaders.set('x-assistantx-ui-language', normalizePublicLanguage(existingLangCookie))
    }
    supabaseResponse.headers.set('Content-Security-Policy', csp)
    supabaseResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    return supabaseResponse
  }

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          // Re-create the response so Supabase can control cookie settings,
          // but preserve the nonce-carrying request headers.
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getUser() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (isAuthDebugEnabled()) {
    console.log('[auth-debug][middleware] resolved session', {
      pathname,
      hasUser: Boolean(user),
      userId: user?.id ?? null,
    })
  }

  const shouldRedirectToLogin =
    !user
    && pathname !== '/'
    && !AUTH_REDIRECT_EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if (shouldRedirectToLogin) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    if (isAuthDebugEnabled()) {
      console.log('[auth-debug][middleware] redirecting unauthenticated request', {
        pathname,
        redirectTo: url.pathname,
      })
    }
    return NextResponse.redirect(url)
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
  // If you're creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!

  // Attach the per-request CSP (set after cookies are finalised so the header
  // is always present on the actual response that gets returned).
  supabaseResponse.headers.set('Content-Security-Policy', csp)
  supabaseResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  if (!existingLangCookie) {
    supabaseResponse.cookies.set(UI_LANGUAGE_COOKIE_NAME, detectedUiLanguage, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  return supabaseResponse
}
