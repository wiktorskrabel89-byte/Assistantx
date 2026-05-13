import PublicHome from "./public-home";
import WorkspaceHome from "./workspace-home";
import { createClient } from "@/lib/server";
import { cookies } from "next/headers";

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export default async function Home() {
  if (!hasSupabaseConfig()) {
    return <PublicHome />;
  }

  let hasAuthCookie = false;
  try {
    const cookieStore = await cookies();
    hasAuthCookie = cookieStore.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  } catch {
    hasAuthCookie = false;
  }

  if (!hasAuthCookie) {
    return <PublicHome />;
  }

  let isAuthenticated = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    isAuthenticated = !error && Boolean(data?.claims);
  } catch {
    isAuthenticated = false;
  }

  if (!isAuthenticated) {
    return <PublicHome />;
  }

  return <WorkspaceHome />;
}
