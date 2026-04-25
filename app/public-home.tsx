
import Link from "next/link";
import dynamic from "next/dynamic";

const PublicChatWidget = dynamic(() => import("./components/PublicChatWidget"), { ssr: false });

export default function PublicHome() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-blue-100 p-8">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow-lg p-8 border border-blue-200">
        <h1 className="text-4xl font-bold text-blue-700 mb-4">AssistantX</h1>
        <p className="text-lg text-gray-700 mb-4">
          <strong>AssistantX</strong> is an advanced AI workspace for chat, code, file uploads, image generation, and cloud-synced projects. It integrates with GitHub, Google Drive, and Supabase for seamless productivity.
        </p>
        <ul className="list-disc pl-6 text-gray-700 mb-4">
          <li>Multi-model AI chat (GPT, Claude, Gemini, and more)</li>
          <li>Code review, file uploads, and image generation</li>
          <li>GitHub & Google Drive integration</li>
          <li>Supabase-backed authentication and cloud sync</li>
        </ul>
        <p className="text-gray-600 mb-4">
          No login required to view this page. To use the app, sign in or register for a free account.
        </p>
        <Link href="/auth/login" className="inline-block bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition">Sign In</Link>
      </div>
      <footer className="mt-8 text-gray-400 text-sm">&copy; {new Date().getFullYear()} AssistantX. All rights reserved.</footer>
      <PublicChatWidget />
    </main>
  );
}
