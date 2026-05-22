/** @type {import('next').NextConfig} */
const isVercelBuild = process.env.VERCEL === '1' || process.env.VERCEL === 'true'

const nextConfig = {
  ...(isVercelBuild ? {} : { output: 'standalone' }),
  productionBrowserSourceMaps: true,
  generateEtags: false,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86400,
  },
  // Allow Next.js's webpack/turbopack build process to transpile ESM-only packages
  // in the react-markdown and react-syntax-highlighter dependency trees
  // Periodically revalidate this list after dependency upgrades and remove entries no longer needed.
  transpilePackages: [
    'react-markdown',
    'unified',
    'bail',
    'is-plain-obj',
    'trough',
    'vfile',
    'vfile-message',
    'unist-util-stringify-position',
    'remark-parse',
    'remark-rehype',
    'mdast-util-from-markdown',
    'mdast-util-to-hast',
    'mdast-util-to-markdown',
    'mdast-util-to-string',
    'mdast-util-phrasing',
    'hast-util-to-jsx-runtime',
    'hast-util-whitespace',
    'hast-util-parse-selector',
    'hastscript',
    'html-url-attributes',
    'property-information',
    'space-separated-tokens',
    'comma-separated-tokens',
    'unist-util-visit',
    'unist-util-visit-parents',
    'unist-util-is',
    'unist-util-position',
    'devlop',
    'refractor',
    'micromark',
    'micromark-core-commonmark',
    'micromark-factory-destination',
    'micromark-factory-label',
    'micromark-factory-space',
    'micromark-factory-title',
    'micromark-factory-whitespace',
    'micromark-util-character',
    'micromark-util-chunked',
    'micromark-util-classify-character',
    'micromark-util-combine-extensions',
    'micromark-util-decode-numeric-character-reference',
    'micromark-util-decode-string',
    'micromark-util-encode',
    'micromark-util-html-tag-name',
    'micromark-util-normalize-identifier',
    'micromark-util-resolve-all',
    'micromark-util-sanitize-uri',
    'micromark-util-subtokenize',
    'micromark-util-symbol',
    'micromark-util-types',
    'decode-named-character-reference',
    'character-entities',
    'character-entities-html4',
    'character-entities-legacy',
    'character-reference-invalid',
    'trim-lines',
    'zwitch',
    'longest-streak',
    'stringify-entities',
    'parse-entities',
    'ccount',
    'is-alphabetical',
    'is-alphanumerical',
    'is-decimal',
    'is-hexadecimal',
    '@ungap/structured-clone',
    'estree-util-is-identifier-name',
    'mdast-util-mdx-expression',
    'mdast-util-mdx-jsx',
    'mdast-util-mdxjs-esm',
  ],
  headers: async () => {
    const headers = [
      {
        // Security headers for all responses
        source: '/(.*)',
        headers: [
        // Prevent clickjacking (belt-and-suspenders alongside frame-ancestors in CSP)
        { key: 'X-Frame-Options', value: 'DENY' },
        // Prevent MIME-type sniffing
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        // Limit Referer leakage to cross-origin requests
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // Disable browser features not needed by this app
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        // Enforce HTTPS for 2 years, include subdomains, request preload
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        // Isolate the browsing context so opener references are not leaked across origins.
        // Required for Lighthouse "Ensure proper origin isolation with COOP" audit.
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        // Content-Security-Policy — static baseline; the per-request middleware
        // (lib/middleware.ts / proxy.ts) injects a stricter nonce-based policy for
        // pages that run through the Edge middleware.  This header acts as a
        // defence-in-depth fallback for any path not covered by the middleware matcher.
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
            "img-src 'self' blob: data: https:",
            "font-src 'self' https://fonts.gstatic.com data:",
            "connect-src *",
            // Monaco Editor creates blob workers and the app registers a service worker
            "worker-src 'self' blob:",
            "frame-src 'none'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        },
        ],
      },
    ]

    if (process.env.NODE_ENV === 'production') {
      headers.push({
        // Long-lived immutable cache for hashed Next.js static assets
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      })
    }

    return headers
  },
};

export default nextConfig;
