"use client";

import dynamic from "next/dynamic";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

// Monaco Editor requires browser-specific APIs (DOM, Web Workers, dynamic script loading)
// that are unavailable during Next.js server-side rendering. The dynamic import with
// ssr: false ensures it is only loaded in the browser.
const MonacoEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-[#1e1e2e]" />
    ),
  }
);

export type SandboxEditorProps = {
  language: string;
  value: string;
  onChange?: (value: string) => void;
  dark?: boolean;
  /** CSS height for the wrapper — defaults to "100%" */
  height?: string | number;
  readOnly?: boolean;
  /** Optional label shown in a header bar above the editor */
  label?: string;
  /** Label text colour (CSS colour string) */
  labelColor?: string;
};

export function SandboxEditor({
  language,
  value,
  onChange,
  dark = true,
  height = "100%",
  readOnly = false,
  label,
  labelColor,
}: SandboxEditorProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden" style={{ height }}>
      {label && (
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-700/60 bg-[#1e1e2e] px-3 py-1.5">
          <span className="text-xs font-semibold" style={{ color: labelColor ?? "#888" }}>
            {label}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            title="Kopiuj kod"
            aria-label="Kopiuj kod"
            className="text-slate-400 transition-colors hover:text-slate-200"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1">
        <MonacoEditor
          height="100%"
          language={language}
          value={value}
          onChange={(v) => onChange?.(v ?? "")}
          theme={dark ? "vs-dark" : "light"}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: "on",
            readOnly,
            lineNumbers: "on",
            renderLineHighlight: "line",
            padding: { top: 8, bottom: 8 },
            folding: false,
            glyphMargin: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
