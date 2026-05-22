"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/client";

export type MCPInstallation = {
  id: string;
  user_id: string;
  server_id: string;
  enabled: boolean;
  config_encrypted: string | null;
  installed_at: string;
  updated_at: string;
};

const QUERY_KEY = ["mcp-installations"];

async function fetchInstallations(): Promise<MCPInstallation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("mcp_server_installations")
    .select("*")
    .order("installed_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export function useMCPInstallations() {
  const queryClient = useQueryClient();

  const { data: installations = [], isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchInstallations,
    staleTime: 30_000,
  });

  const installMutation = useMutation({
    mutationFn: async (serverId: string) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not-authenticated");
      const { error } = await supabase
        .from("mcp_server_installations")
        .upsert(
          { user_id: user.id, server_id: serverId, enabled: true },
          { onConflict: "user_id,server_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  const uninstallMutation = useMutation({
    mutationFn: async (serverId: string) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("not-authenticated");
      const { error } = await supabase
        .from("mcp_server_installations")
        .delete()
        .eq("user_id", user.id)
        .eq("server_id", serverId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });

  function isInstalled(serverId: string): boolean {
    return installations.some((i) => i.server_id === serverId && i.enabled);
  }

  function install(serverId: string) {
    return installMutation.mutateAsync(serverId);
  }

  function uninstall(serverId: string) {
    return uninstallMutation.mutateAsync(serverId);
  }

  return {
    installations,
    isLoading,
    error,
    install,
    uninstall,
    isInstalled,
    installedCount: installations.filter((i) => i.enabled).length,
    isInstalling: installMutation.isPending,
    isUninstalling: uninstallMutation.isPending,
  };
}
