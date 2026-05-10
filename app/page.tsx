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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return <PublicHome />;
  }

  return <WorkspaceHome />;
}
