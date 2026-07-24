import { headers } from "next/headers";
import PublicHome from "./public-home";
import { normalizePublicLanguage } from "@/app/lib/ui-language";

// The public site IS the waitlist. Everyone — signed in or not — gets the
// cinematic waitlist landing page. The old web workspace is intentionally
// unreachable from the site root; the desktop app has its own UI and only
// uses this deployment's API/auth/updater endpoints.
//
// Language: middleware pre-computes the preferred UI language (from cookie,
// geo, and Accept-Language) and puts it on `x-assistantx-ui-language`.
export default async function Home() {
  const h = await headers();
  const lang = normalizePublicLanguage(h.get("x-assistantx-ui-language"));
  return <PublicHome lang={lang} />;
}
