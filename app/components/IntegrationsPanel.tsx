"use client";

import type { OAuthProvider } from "@/lib/integrations";
import { GitHubIntegration } from "@/app/components/integrations/GitHubIntegration";
import { DriveIntegration } from "@/app/components/integrations/DriveIntegration";
import { GmailIntegration } from "@/app/components/integrations/GmailIntegration";
import { CalendarIntegration } from "@/app/components/integrations/CalendarIntegration";

const PROVIDER_COPY: Record<OAuthProvider, { title: string; description: string }> = {
  google: {
    title: "Google",
    description: "Link Google for Drive, Gmail, and Calendar access directly in the chat.",
  },
  github: {
    title: "GitHub",
    description: "Link GitHub for private repo access, or browse public repos directly from the app.",
  },
};

function providerBadge(isConnected: boolean, dark: boolean) {
  if (isConnected) {
    return dark ? "bg-emerald-950 text-emerald-200" : "bg-emerald-100 text-emerald-800";
  }
  return dark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700";
}

export function IntegrationsPanel({
  dark,
  linkedProviders,
  authProvider,
  oauthLoading,
  copied,
  hasArtifacts,
  onConnectProvider,
  onImportFile,
  onCopyVsCodePrompt,
  onDownloadVsCodeBundle,
  onSendGoogleContext,
  highlightGitHubCard = false,
}: {
  dark: boolean;
  linkedProviders: OAuthProvider[];
  authProvider: OAuthProvider | null;
  oauthLoading: OAuthProvider | null;
  copied: string | null;
  hasArtifacts: boolean;
  onConnectProvider: (provider: OAuthProvider) => void;
  onImportFile: (file: File, prompt: string) => void;
  onCopyVsCodePrompt: () => void;
  onDownloadVsCodeBundle: () => void;
  /** Called with a context string to inject into the next chat message */
  onSendGoogleContext?: (context: string) => void;
  highlightGitHubCard?: boolean;
}) {
  return (
    <section className={`rounded-3xl border p-4 ${dark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
      <div>
        <h2 className="text-sm font-semibold">Integrations</h2>
        <p className="mt-1 text-xs text-gray-500">Google Drive, Gmail, Calendar, GitHub, and VS Code tools for this chat.</p>
      </div>

      <div className="mt-4 space-y-3">
        {(["google", "github"] as const).map((provider) => {
          const isConnected = linkedProviders.includes(provider) || authProvider === provider;
          return (
            <div
              key={provider}
              className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{PROVIDER_COPY[provider].title}</div>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{PROVIDER_COPY[provider].description}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${providerBadge(isConnected, dark)}`}>
                  {isConnected ? "Connected" : "Available"}
                </span>
              </div>
              <button
                onClick={() => onConnectProvider(provider)}
                disabled={oauthLoading !== null}
                className={`mt-3 w-full rounded-xl px-3 py-2 text-sm font-medium transition ${
                  dark
                    ? "bg-gray-800 text-gray-100 hover:bg-gray-700 disabled:opacity-50"
                    : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                }`}
              >
                {oauthLoading === provider ? `Redirecting to ${PROVIDER_COPY[provider].title}...` : isConnected ? `Refresh ${PROVIDER_COPY[provider].title} access` : `Connect ${PROVIDER_COPY[provider].title}`}
              </button>
            </div>
          );
        })}

        <GitHubIntegration
          dark={dark}
          linkedProviders={linkedProviders}
          authProvider={authProvider}
          onImportFile={onImportFile}
          highlightCard={highlightGitHubCard}
        />

        <DriveIntegration
          dark={dark}
          linkedProviders={linkedProviders}
          authProvider={authProvider}
          onImportFile={onImportFile}
        />

        <GmailIntegration
          dark={dark}
          linkedProviders={linkedProviders}
          authProvider={authProvider}
          onSendGoogleContext={onSendGoogleContext}
        />

        <CalendarIntegration
          dark={dark}
          linkedProviders={linkedProviders}
          authProvider={authProvider}
        />

        <div className={`rounded-2xl border px-3 py-3 ${dark ? "border-gray-800 bg-gray-950/60" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">VS Code</div>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                Copy or download the active chat with artifacts so you can continue inside VS Code or GitHub Copilot Chat.
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${dark ? "bg-cyan-950 text-cyan-200" : "bg-cyan-100 text-cyan-800"}`}>
              {hasArtifacts ? "Artifacts ready" : "Prompt ready"}
            </span>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onCopyVsCodePrompt}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-gray-800 text-gray-100 hover:bg-gray-700" : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100"}`}
            >
              {copied === "vscode-prompt" ? "Copied" : "Copy VS Code prompt"}
            </button>
            <button
              onClick={onDownloadVsCodeBundle}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${dark ? "bg-cyan-900 text-cyan-100 hover:bg-cyan-800" : "bg-cyan-600 text-white hover:bg-cyan-500"}`}
            >
              Download bundle
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
