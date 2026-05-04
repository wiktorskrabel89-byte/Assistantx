"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/client";
import {
  getLinkedProviders,
  getOAuthQueryParams,
  getOAuthScopes,
  isOAuthProvider,
  type OAuthProvider,
} from "@/lib/integrations";
import {
  clearPendingOAuthProvider,
  formatOAuthErrorMessage,
  getPendingOAuthProvider,
  rememberPendingOAuthProvider,
} from "@/lib/oauth-client";
import { IntegrationsPanel } from "@/app/components/IntegrationsPanel";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function IntegrationsPageClient({ dark }: { dark: boolean }) {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const [authProvider, setAuthProvider] = useState<OAuthProvider | null>(null);
  const [linkedProviders, setLinkedProviders] = useState<OAuthProvider[]>([]);
  const [oauthLoading, setOauthLoading] = useState<OAuthProvider | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = createClient();
    supabaseRef.current = supabase;
    let active = true;

    const applySession = (provider: OAuthProvider | null, identities: OAuthProvider[]) => {
      if (!active) return;
      clearPendingOAuthProvider();
      setAuthProvider(provider);
      setLinkedProviders(identities);
      setOauthLoading(null);
    };

    supabase.auth.onAuthStateChange((_event, session) => {
      const providerValue = session?.user?.app_metadata?.provider as string | undefined;
      const provider: OAuthProvider | null = isOAuthProvider(providerValue) ? providerValue : null;
      applySession(provider, getLinkedProviders(session?.user?.identities));
    });

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      const providerValue = session?.user?.app_metadata?.provider as string | undefined;
      const provider: OAuthProvider | null = isOAuthProvider(providerValue) ? providerValue : null;
      applySession(provider, getLinkedProviders(session?.user?.identities));

      // Recover interrupted OAuth
      const pendingProvider = getPendingOAuthProvider();
      if (pendingProvider && active) {
        clearPendingOAuthProvider();
        setOauthLoading(null);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    const supabase = supabaseRef.current;
    if (!supabase || typeof window === "undefined") return;

    setOauthLoading(provider);
    rememberPendingOAuthProvider(provider);

    const options = {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: getOAuthScopes(provider),
      queryParams: getOAuthQueryParams(provider),
    };

    const shouldLink = Boolean(authProvider) && !linkedProviders.includes(provider) && authProvider !== provider;
    try {
      const { error } = shouldLink
        ? await supabase.auth.linkIdentity({ provider, options })
        : await supabase.auth.signInWithOAuth({ provider, options });
      if (error) {
        clearPendingOAuthProvider();
        setOauthLoading(null);
      }
    } catch {
      clearPendingOAuthProvider();
      setOauthLoading(null);
    }
  }, [authProvider, linkedProviders]);

  const handleCopyVsCodePrompt = useCallback(() => {
    const prompt = "Please review my code and suggest improvements.";
    void navigator.clipboard.writeText(prompt).then(() => {
      setCopied("vscode");
      setTimeout(() => setCopied(null), 2000);
    });
  }, []);

  const handleDownloadVsCodeBundle = useCallback(() => {
    // Bundle download is not available in the standalone integrations page context.
  }, []);

  const shellBg = dark
    ? "bg-slate-900 border-slate-800"
    : "bg-white/92 border-sky-200/60 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.28)]";

  return (
    <div className={`rounded-[26px] border p-6 ${shellBg}`}>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/"
          className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
            dark ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200" : "text-slate-500 hover:bg-sky-50 hover:text-slate-700"
          }`}
        >
          <ArrowLeft className="h-4 w-4" />
          Wróć do aplikacji
        </Link>
        <h1 className="text-xl font-bold">Integracje</h1>
      </div>
      <IntegrationsPanel
        dark={dark}
        linkedProviders={linkedProviders}
        authProvider={authProvider}
        oauthLoading={oauthLoading}
        copied={copied}
        hasArtifacts={false}
        onConnectProvider={(provider) => void signInWithProvider(provider)}
        onImportFile={() => undefined}
        onCopyVsCodePrompt={handleCopyVsCodePrompt}
        onDownloadVsCodeBundle={handleDownloadVsCodeBundle}
      />
    </div>
  );
}
