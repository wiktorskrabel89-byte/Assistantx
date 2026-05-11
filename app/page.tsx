import PublicHome from "./public-home";
import WorkspaceHome from "./workspace-home";
import { createClient } from "@/lib/server";

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
