import type { Metadata } from "next";
import { headers } from "next/headers";
import { normalizePublicLanguage } from "@/app/lib/ui-language";
import WaitlistPage from "./waitlist-page";

export const metadata: Metadata = {
  title: "AssistantX — Join the Waitlist",
  description:
    "AssistantX is the intelligent desktop layer that acts, not just talks. Local-first, self-healing, 25 PLN/month. Join the beta waitlist.",
  openGraph: {
    title: "AssistantX — Manifest V1.0",
    description:
      "The assistant that ACTS. Local-first AI desktop layer with autonomous coding, browsing, and self-healing. Join the waitlist.",
    type: "website",
  },
};

export default async function Page() {
  const headerList = await headers();
  const initialLanguage = normalizePublicLanguage(headerList.get("x-assistantx-ui-language"));

  return <WaitlistPage initialLanguage={initialLanguage} />;
}
