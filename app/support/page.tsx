import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SupportRedirect() {
  const router = useRouter();
  useEffect(() => {
    // Redirect to AssistantX support (update URL as needed)
    window.location.href = "https://assistantx.vercel.app/support";
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="text-xl">Redirecting to AssistantX support…</div>
    </main>
  );
}
