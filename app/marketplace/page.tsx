import { createClient } from "@/lib/server";
import { redirect } from "next/navigation";
import { MarketplaceClient } from "./MarketplaceClient";

export const metadata = {
  title: "MCP Marketplace — AssistantX",
  description: "Connect Jarvis to GitHub, Google, Slack, Postgres and more via official MCP servers.",
};

export default async function MarketplacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <MarketplaceClient dark={false} />;
}
