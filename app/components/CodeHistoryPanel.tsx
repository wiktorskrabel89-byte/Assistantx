"use client";

import { Copy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { Artifact } from "../lib/chat-types";

type CodeHistoryPanelProps = {
  open: boolean;
  dark: boolean;
  artifacts: Artifact[];
  copied: string | null;
  onCopyCode: (code: string, id: string) => void;
  onClose: () => void;
};

export function CodeHistoryPanel({ open, dark, artifacts, copied, onCopyCode, onClose }: CodeHistoryPanelProps) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);

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

  const selectedArtifact = useMemo(
    () => artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? artifacts[0] ?? null,
    [artifacts, selectedArtifactId]
  );

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close code history panel"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45"
      />
      <aside className={`fixed inset-y-3 right-3 z-50 w-[min(68rem,calc(100vw-1.5rem))] rounded-[26px] border ${dark ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold">Code history</div>
              <div className="mt-1 text-xs text-slate-500">Reusable code blocks captured from this conversation.</div>
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

          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className={`w-full shrink-0 border-b p-3 lg:w-72 lg:border-b-0 lg:border-r ${dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
              {artifacts.length === 0 ? (
                <div className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${dark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`}>
                  No code artifacts yet. Generate or paste code in the chat and it will show up here.
                </div>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      onClick={() => setSelectedArtifactId(artifact.id)}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${selectedArtifact?.id === artifact.id ? (dark ? "border-blue-800 bg-blue-950/30" : "border-blue-200 bg-blue-50") : (dark ? "border-slate-800 bg-slate-900 hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-100")}`}
                    >
                      <div className="truncate text-sm font-semibold">{artifact.label}</div>
                      <div className="mt-1 truncate text-xs text-slate-500">{artifact.sourceTitle}</div>
                      <div className="mt-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">{artifact.language}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedArtifact ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">{selectedArtifact.label}</div>
                      <div className="mt-1 text-xs text-slate-500">{selectedArtifact.sourceTitle}</div>
                    </div>
                    <button
                      onClick={() => onCopyCode(selectedArtifact.code, selectedArtifact.id)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-700"}`}
                    >
                      <Copy className="h-4 w-4" />
                      <span>{copied === selectedArtifact.id ? "Copied" : "Copy code"}</span>
                    </button>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800">
                    <div className={`border-b px-4 py-2 text-xs uppercase tracking-[0.14em] text-slate-400 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
                      {selectedArtifact.language}
                    </div>
                    <SyntaxHighlighter style={dark ? oneDark : oneLight} language={selectedArtifact.language || "text"} PreTag="div">
                      {selectedArtifact.code}
                    </SyntaxHighlighter>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}