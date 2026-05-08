import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#2563eb" />
      </head>
      <body className="min-h-full flex flex-col">
        <QueryProvider>{children}</QueryProvider>
        <AppBootTasks />
      </body>
    </html>
  );
}
