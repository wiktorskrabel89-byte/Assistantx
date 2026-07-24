import { headers } from "next/headers";
import { normalizePublicLanguage, type PublicUILanguage } from "@/app/lib/ui-language";

export async function getUiLang(): Promise<PublicUILanguage> {
  const h = await headers();
  return normalizePublicLanguage(h.get("x-assistantx-ui-language"));
}
