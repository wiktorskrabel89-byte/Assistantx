import PublicHome from "./public-home";
import WorkspaceHome from "./workspace-home";
import { createClient } from "@/lib/server";
import { cookies } from "next/headers";

const SUPABASE_AUTH_COOKIE_NAME_FRAGMENT = "-auth-token";

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

function isSupabaseAuthCookie(cookieName: string) {
  return cookieName.startsWith("sb-") && cookieName.includes(SUPABASE_AUTH_COOKIE_NAME_FRAGMENT);
}

export default async function Home() {
  if (!hasSupabaseConfig()) {
    return <PublicHome />;
  }

  let hasAuthCookie = false;
  try {
    const cookieStore = await cookies();
    hasAuthCookie = cookieStore.getAll().some(({ name }) => isSupabaseAuthCookie(name));
  } catch {
    hasAuthCookie = false;
  }

  if (!hasAuthCookie) {
    return <PublicHome />;
  }

  let isAuthenticated = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    isAuthenticated = !error && Boolean(data.user);
  } catch {
    isAuthenticated = false;
  }

  if (!isAuthenticated) {
    return <PublicHome />;
  }

  return <WorkspaceHome />;
}
