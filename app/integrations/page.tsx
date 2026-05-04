import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/server";
import { IntegrationsPageClient } from "./IntegrationsPageClient";

export const metadata: Metadata = {
  title: "Integracje – AssistantX",
  description: "Połącz GitHub, Google Drive i inne usługi z AssistantX.",
};

export default async function IntegrationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.15),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <IntegrationsPageClient dark={false} />
      </div>
    </div>
  );
}
