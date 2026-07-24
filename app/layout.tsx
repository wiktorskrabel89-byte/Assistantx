import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { headers } from "next/headers";
import { Analytics } from "@vercel/analytics/next";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { AppBootTasks } from "./components/AppBootTasks";
import { QueryProvider } from "./components/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AssistantX",
    template: "%s | AssistantX",
  },
  metadataBase: new URL("https://www.assistantx.pl"),
  description: "AssistantX is your AI assistant — a workspace for chat, uploads, integrations, cloud-synced projects, creation, and editing.",
  applicationName: "AssistantX",
  keywords: [
    "AssistantX",
    "AI assistant",
    "AI workspace",
    "chat",
    "AI integrations",
    "cloud sync",
    "AI creation",
    "AI editing",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "https://www.assistantx.pl",
    siteName: "AssistantX",
    title: "AssistantX — your AI assistant",
    description:
      "A workspace for chat, uploads, integrations, cloud-synced projects, creation, and editing.",
    locale: "en_US",
    images: [
      {
        url: "/icon-512.png",
        width: 512,
        height: 512,
        alt: "AssistantX",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AssistantX — your AI assistant",
    description:
      "A workspace for chat, uploads, integrations, cloud-synced projects, creation, and editing.",
    images: ["/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
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
  const h = await headers();
  const uiLang = h.get("x-assistantx-ui-language") === "pl" ? "pl" : "en";

  return (
    <html
      lang={uiLang}
      className={`dark ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
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
        <Analytics />
        <SpeedInsights />
        <Toaster richColors closeButton position="bottom-right" />
      </body>
    </html>
  );
}
