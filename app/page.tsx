import { cookies, headers } from "next/headers";
import PublicHome from "./public-home";
import {
  detectPreferredPublicLanguage,
  UI_LANGUAGE_COOKIE_NAME,
} from "@/app/lib/ui-language";

// The public site IS the waitlist. Everyone — signed in or not — gets the
// cinematic waitlist landing page.  The old web workspace is intentionally
// unreachable from the site root; the desktop app has its own UI and only
// uses this deployment's API/auth/updater endpoints.
//
// Language detection happens here (server component) so first paint is in
// the right language — no flash-of-english for PL visitors.  Priority is
// the same as the shared middleware helper: cookie > geo-IP > Accept-Language.
export default async function Home() {
  const [cookieStore, headerBag] = await Promise.all([cookies(), headers()]);
  const language = detectPreferredPublicLanguage({
    existingCookie: cookieStore.get(UI_LANGUAGE_COOKIE_NAME)?.value ?? null,
    countryCode: headerBag.get("x-vercel-ip-country"),
    acceptLanguage: headerBag.get("accept-language"),
  });

  return <PublicHome language={language} />;
}
