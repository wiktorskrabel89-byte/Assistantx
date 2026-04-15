"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { createClient as createSupabaseClient } from "@/lib/client";
import { getLinkedProviders, getOAuthQueryParams, getOAuthScopes, getProviderLabel, isOAuthProvider, type OAuthProvider } from "@/lib/integrations";
import {
  clearPendingOAuthProvider,
  formatOAuthErrorMessage,
  getOAuthInterruptedMessage,
  getPendingOAuthProvider,
  rememberPendingOAuthProvider,
} from "@/lib/oauth-client";
import { formatCloudSyncError, sanitizeForStorage, upgradeState } from "../lib/chat-state";
import type { CloudSyncStatus, StoredState } from "../lib/chat-types";

type UseWorkspaceSyncArgs = {
  loaded: boolean;
  state: StoredState;
  setState: Dispatch<SetStateAction<StoredState>>;
  stateRef: RefObject<StoredState>;
};

export function useWorkspaceSync({ loaded, state, setState, stateRef }: UseWorkspaceSyncArgs) {
  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<OAuthProvider | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<OAuthProvider[]>([]);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>("checking");
  const [cloudSyncMessage, setCloudSyncMessage] = useState("Checking session...");
  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(false);
  const [cloudBootstrapped, setCloudBootstrapped] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof createSupabaseClient> | null>(null);
  const lastSyncedPayloadRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = createSupabaseClient();
    supabaseRef.current = supabase;
    let active = true;

    const applySession = (email: string | null, provider: OAuthProvider | null, identities: OAuthProvider[]) => {
      if (!active) return;
      clearPendingOAuthProvider();
      setUserEmail(email);
      setAuthProvider(provider);
      setLinkedProviders(identities);
      setOauthLoading(null);
      setAuthReady(true);

      if (email) {
        setCloudSyncEnabled(true);
        setCloudBootstrapped(false);
        setCloudSyncStatus("checking");
        setCloudSyncMessage("Loading your cloud workspace...");
      } else {
        setCloudSyncEnabled(false);
        setCloudBootstrapped(true);
        setCloudSyncStatus("local");
        setCloudSyncMessage("No active session. Workspace changes stay local.");
      }
    };

    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthReady(true);
        setCloudSyncEnabled(false);
        setCloudBootstrapped(true);
        setCloudSyncStatus("error");
        setCloudSyncMessage(error.message);
        return;
      }

      const providerValue = typeof data.user?.app_metadata?.provider === "string" ? data.user.app_metadata.provider : null;
      const provider: OAuthProvider | null = isOAuthProvider(providerValue) ? providerValue : null;
      applySession(data.user?.email ?? null, provider, getLinkedProviders(data.user?.identities));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const providerValue = typeof session?.user?.app_metadata?.provider === "string" ? session.user.app_metadata.provider : null;
      const provider: OAuthProvider | null = isOAuthProvider(providerValue) ? providerValue : null;
      applySession(session?.user?.email ?? null, provider, getLinkedProviders(session?.user?.identities));
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const recoverFromInterruptedOAuth = useCallback((provider: OAuthProvider) => {
    clearPendingOAuthProvider();
    setOauthLoading(null);

    if (userEmail) {
      setCloudSyncStatus(cloudSyncEnabled && cloudBootstrapped ? "synced" : "checking");
      setCloudSyncMessage(`${getProviderLabel(provider)} sign-in was interrupted. Your current session is still active, so you can try again.`);
      return;
    }

    setCloudSyncStatus("local");
    setCloudSyncMessage(getOAuthInterruptedMessage(provider));
  }, [cloudBootstrapped, cloudSyncEnabled, userEmail]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const restorePendingOAuth = () => {
      const pendingProvider = getPendingOAuthProvider();
      if (!pendingProvider) return;
      recoverFromInterruptedOAuth(pendingProvider);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        restorePendingOAuth();
      }
    };

    window.addEventListener("pageshow", restorePendingOAuth);
    window.addEventListener("focus", restorePendingOAuth);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", restorePendingOAuth);
      window.removeEventListener("focus", restorePendingOAuth);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [recoverFromInterruptedOAuth]);

  useEffect(() => {
    if (!loaded || !authReady || !userEmail || !cloudSyncEnabled) return;
    let cancelled = false;

    async function hydrateCloudState() {
      try {
        setCloudSyncStatus("checking");
        setCloudSyncMessage("Loading your cloud workspace...");

        const response = await fetch("/api/workspaces/state", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const failure = formatCloudSyncError(response.status, data, "Failed to load cloud workspace state.");
          if (failure.status === "local") {
            setCloudSyncEnabled(false);
            setCloudBootstrapped(true);
            setCloudSyncStatus("local");
            setCloudSyncMessage(failure.message);
            return;
          }
          throw new Error(failure.message);
        }

        const remoteState = upgradeState((data as { state?: StoredState | null }).state ?? null);

        if (cancelled) return;

        if (remoteState) {
          lastSyncedPayloadRef.current = JSON.stringify(sanitizeForStorage(remoteState));
          setState(remoteState);
          setCloudBootstrapped(true);
          setCloudSyncStatus("synced");
          setCloudSyncMessage("Cloud workspace loaded.");
          return;
        }

        const initialState = sanitizeForStorage(stateRef.current);
        const payload = JSON.stringify(initialState);
        const seedResponse = await fetch("/api/workspaces/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        const seedData = await seedResponse.json().catch(() => ({}));

        if (!seedResponse.ok) {
          throw new Error(formatCloudSyncError(seedResponse.status, seedData, "Failed to initialize cloud workspace state.").message);
        }

        if (cancelled) return;
        lastSyncedPayloadRef.current = payload;
        setCloudBootstrapped(true);
        setCloudSyncStatus("synced");
        setCloudSyncMessage("Cloud workspace created.");
      } catch (error) {
        if (cancelled) return;
        setCloudSyncEnabled(false);
        setCloudBootstrapped(true);
        setCloudSyncStatus("error");
        setCloudSyncMessage(error instanceof Error ? error.message : "Cloud sync setup is incomplete.");
      }
    }

    void hydrateCloudState();

    return () => {
      cancelled = true;
    };
  }, [authReady, cloudSyncEnabled, loaded, setState, stateRef, userEmail]);

  useEffect(() => {
    if (!loaded || !authReady || !userEmail || !cloudSyncEnabled || !cloudBootstrapped || typeof window === "undefined") return;

    const payload = JSON.stringify(sanitizeForStorage(state));
    if (payload === lastSyncedPayloadRef.current) return;

    const timeout = window.setTimeout(async () => {
      try {
        setCloudSyncStatus("syncing");
        setCloudSyncMessage("Saving workspace changes...");

        const response = await fetch("/api/workspaces/state", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          const failure = formatCloudSyncError(response.status, data, "Failed to save workspace changes.");
          if (failure.status === "local") {
            setCloudSyncEnabled(false);
            setCloudSyncStatus("local");
            setCloudSyncMessage(failure.message);
            return;
          }
          throw new Error(failure.message);
        }

        lastSyncedPayloadRef.current = payload;
        setCloudSyncStatus("synced");
        setCloudSyncMessage("All workspace changes synced.");
      } catch (error) {
        setCloudSyncStatus("error");
        setCloudSyncMessage(error instanceof Error ? error.message : "Failed to save workspace changes.");
      }
    }, 700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [authReady, cloudBootstrapped, cloudSyncEnabled, loaded, state, userEmail]);

  const signOut = useCallback(async () => {
    try {
      clearPendingOAuthProvider();
      setCloudSyncStatus("checking");
      setCloudSyncMessage("Signing out...");
      await fetch("/api/integrations/provider-tokens", { method: "DELETE" }).catch(() => undefined);
      const supabase = supabaseRef.current;
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      if (typeof window !== "undefined") {
        window.location.assign("/auth/login");
      }
    }
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    const supabase = supabaseRef.current;
    if (!supabase || typeof window === "undefined") return;

    setOauthLoading(provider);
    setCloudSyncStatus("checking");
    setCloudSyncMessage(`Redirecting to ${provider === "google" ? "Google" : "GitHub"}...`);
    rememberPendingOAuthProvider(provider);

    const options = {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: getOAuthQueryParams(provider),
      scopes: getOAuthScopes(provider),
    };
    const shouldLinkIdentity = Boolean(userEmail) && !linkedProviders.includes(provider) && authProvider !== provider;
    try {
      const { error } = shouldLinkIdentity
        ? await supabase.auth.linkIdentity({ provider, options })
        : await supabase.auth.signInWithOAuth({ provider, options });

      if (!error) return;

      clearPendingOAuthProvider();
      setOauthLoading(null);
      setCloudSyncStatus("error");
      setCloudSyncMessage(formatOAuthErrorMessage(provider, error));
    } catch (error) {
      clearPendingOAuthProvider();
      setOauthLoading(null);
      setCloudSyncStatus("error");
      setCloudSyncMessage(formatOAuthErrorMessage(provider, error));
    }
  }, [authProvider, linkedProviders, userEmail]);

  return {
    authReady,
    userEmail,
    authProvider,
    linkedProviders,
    oauthLoading,
    cloudSyncStatus,
    cloudSyncMessage,
    cloudSyncEnabled,
    cloudBootstrapped,
    signOut,
    signInWithProvider,
  };
}