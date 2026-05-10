
import Link from "next/link";
import { DeferredPublicChatWidget } from "./components/DeferredPublicChatWidget";

export default function PublicHome() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-100 px-6 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-center gap-8">
        <div className="rounded-[2rem] border border-blue-200/70 bg-white/90 p-8 shadow-[0_24px_80px_-28px_rgba(37,99,235,0.28)] backdrop-blur">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-medium text-blue-700">
              AI workspace for chat, code, files, and integrations
            </span>
            <nav className="flex flex-wrap items-center gap-3">
              <Link href="/privacy" className="font-medium underline decoration-blue-200 underline-offset-4 hover:text-blue-700">
                Privacy Policy
              </Link>
              <Link href="/terms" className="font-medium underline decoration-blue-200 underline-offset-4 hover:text-blue-700">
                Terms of Service
              </Link>
              <Link href="/support" className="font-medium underline decoration-blue-200 underline-offset-4 hover:text-blue-700">
                Support
              </Link>
            </nav>
          </div>

          <h1 className="mb-4 text-4xl font-bold text-blue-700">AssistantX</h1>
          <p className="mb-4 text-lg text-slate-700">
          <strong>AssistantX</strong> is an advanced AI workspace for chat, code, file uploads, image generation, and cloud-synced projects. It integrates with GitHub, Google Drive, and Supabase for seamless productivity.
          </p>
          <ul className="mb-6 list-disc pl-6 text-slate-700">
            <li>Multi-model AI chat (GPT, Claude, Gemini, and more)</li>
            <li>Code review, file uploads, and image generation</li>
            <li>GitHub & Google Drive integration</li>
            <li>Supabase-backed authentication and cloud sync</li>
          </ul>
          <p className="mb-6 text-slate-600">
            No login is required to view this page. To use the workspace, sign in or create an account.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/auth/login" className="inline-flex rounded-xl bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700">
              Sign In
            </Link>
            <Link href="/privacy" className="inline-flex rounded-xl border border-slate-200 px-6 py-3 font-medium text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
              Review Privacy Policy
            </Link>
          </div>
        </div>
      </div>
      <footer className="mt-8 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} AssistantX. All rights reserved.
      </footer>
      <DeferredPublicChatWidget />
    </main>
  );
}
