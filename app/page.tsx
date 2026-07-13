import PublicHome from "./public-home";

// The public site IS the waitlist. Everyone — signed in or not — gets the
// cinematic waitlist landing page. The old web workspace is intentionally
// unreachable from the site root; the desktop app has its own UI and only
// uses this deployment's API/auth/updater endpoints.
export default function Home() {
  return <PublicHome />;
}
