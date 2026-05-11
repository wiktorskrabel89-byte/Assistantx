"use client";

import { Download, Link2, Share2, X } from "lucide-react";
import { useEffect } from "react";

export function ShareConversationDialog({
  open,
  dark,
  title,
  copied,
  onClose,
  onCopyShareLink,
  onExportMarkdown,
  onExportJson,
  onCopyVsCodePrompt,
  onDownloadVsCodeBundle,
}: {
  open: boolean;
  dark: boolean;
  title: string;
  copied: string | null;
  onClose: () => void;
  onCopyShareLink: () => void;
  onExportMarkdown: () => void;
  onExportJson: () => void;
  onCopyVsCodePrompt: () => void;
  onDownloadVsCodeBundle: () => void;
}) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className={`w-full max-w-lg rounded-[28px] border p-5 shadow-2xl ${dark ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Share2 className="h-4 w-4 text-blue-500" />
              <span>Share conversation</span>
            </div>
            <div className="mt-1 text-sm text-slate-500">{title}</div>
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

        <div className="mt-5 grid gap-3">
          <button onClick={onCopyShareLink} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${dark ? "border-slate-800 bg-slate-900 hover:bg-slate-800" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}>
            <span>Copy share link</span>
            <Link2 className="h-4 w-4 text-slate-400" />
          </button>
          <button onClick={onCopyVsCodePrompt} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${dark ? "border-slate-800 bg-slate-900 hover:bg-slate-800" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}>
            <span>{copied === "vscode-prompt" ? "VS Code handoff copied" : "Copy VS Code handoff"}</span>
            <Share2 className="h-4 w-4 text-slate-400" />
          </button>
          <button onClick={onDownloadVsCodeBundle} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${dark ? "border-slate-800 bg-slate-900 hover:bg-slate-800" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}>
            <span>Download VS Code bundle</span>
            <Download className="h-4 w-4 text-slate-400" />
          </button>
          <button onClick={onExportMarkdown} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${dark ? "border-slate-800 bg-slate-900 hover:bg-slate-800" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}>
            <span>Export Markdown</span>
            <Download className="h-4 w-4 text-slate-400" />
          </button>
          <button onClick={onExportJson} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm ${dark ? "border-slate-800 bg-slate-900 hover:bg-slate-800" : "border-slate-200 bg-slate-50 hover:bg-slate-100"}`}>
            <span>Export JSON</span>
            <Download className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="mt-4 text-xs text-slate-500">
          {copied === "share-link" ? "Share link copied to clipboard." : "Pick a share action for the current conversation."}
        </div>
      </div>
    </div>
  );
}