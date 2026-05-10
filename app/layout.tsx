import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { headers } from "next/headers";
import { AppBootTasks } from "./components/AppBootTasks";
import { QueryProvider } from "./components/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AssistantX",
    template: "%s | AssistantX",
  },
  description: "AssistantX is an AI workspace for chat, uploads, integrations, and cloud-synced projects.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Calling headers() opts this layout into dynamic rendering so Next.js can
  // read the x-nonce request header (set by lib/middleware.ts) and stamp its
  // own inline bootstrap <script> tags with the correct nonce attribute.
  // Without this, browsers that honour nonces in CSP ignore 'unsafe-inline'
  // and block Next.js's hydration scripts.
  await headers();

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
        {/* Preconnect to critical external services to reduce DNS + TLS overhead */}
        <link rel="preconnect" href="https://api.groq.com" />
        <link rel="preconnect" href="https://generativelanguage.googleapis.com" />
        <link rel="preconnect" href="https://openrouter.ai" />
        <link rel="dns-prefetch" href="https://api.groq.com" />
        <link rel="dns-prefetch" href="https://generativelanguage.googleapis.com" />
        <link rel="dns-prefetch" href="https://openrouter.ai" />
      </head>
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
        <AppBootTasks />
      </body>
    </html>
  );
}
