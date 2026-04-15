"use client";

import type { OAuthProvider } from "@/lib/integrations";
import { X } from "lucide-react";
import { useEffect } from "react";
import { IntegrationsPanel } from "./IntegrationsPanel";

type GitHubPanelProps = {
  open: boolean;
  dark: boolean;
  linkedProviders: OAuthProvider[];
  authProvider: OAuthProvider | null;
  oauthLoading: OAuthProvider | null;
  copied: string | null;
  hasArtifacts: boolean;
  onClose: () => void;
  onConnectProvider: (provider: OAuthProvider) => void;
  onImportFile: (file: File, prompt: string) => void;
  onCopyVsCodePrompt: () => void;
  onDownloadVsCodeBundle: () => void;
};

export function GitHubPanel({
  open,
  dark,
  linkedProviders,
  authProvider,
  oauthLoading,
  copied,
  hasArtifacts,
  onClose,
  onConnectProvider,
  onImportFile,
  onCopyVsCodePrompt,
  onDownloadVsCodeBundle,
}: GitHubPanelProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close apps panel"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45"
      />
      <aside className={`fixed inset-y-3 right-3 z-50 w-[min(34rem,calc(100vw-1.5rem))] rounded-[26px] border ${dark ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold">Apps and imports</div>
              <div className="mt-1 text-xs text-slate-500">GitHub, Google Drive, and VS Code handoff tools for this chat.</div>
            </div>
            <button
              onClick={onClose}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-700"}`}
              title="Close"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <IntegrationsPanel
              dark={dark}
              linkedProviders={linkedProviders}
              authProvider={authProvider}
              oauthLoading={oauthLoading}
              copied={copied}
              hasArtifacts={hasArtifacts}
              onConnectProvider={onConnectProvider}
              onImportFile={onImportFile}
              onCopyVsCodePrompt={onCopyVsCodePrompt}
              onDownloadVsCodeBundle={onDownloadVsCodeBundle}
            />
          </div>
        </div>
      </aside>
    </>
  );
}