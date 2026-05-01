/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  generateEtags: false,
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://assistantx.pl; style-src 'self' 'unsafe-inline'; img-src * blob: data:; font-src 'self'; connect-src *; frame-src 'self';"
        },
      ],
    },
    {
      source: '/_next/static/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ],
};

export default nextConfig;
