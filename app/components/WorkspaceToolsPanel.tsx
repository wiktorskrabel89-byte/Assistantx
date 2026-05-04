"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

type ToolDefinition = {
  id: string;
  label: string;
  description: string;
};

const TOOLS: ToolDefinition[] = [
  { id: "web_search", label: "Web Search", description: "Enable real-time web access in all queries" },
  { id: "image_generation", label: "Image Generation", description: "Allow auto-generating images from prompts" },
  { id: "code_execution", label: "Code Execution", description: "Suggest runnable code snippets" },
  { id: "calculator", label: "Calculator", description: "Solve math and equations automatically" },
];

type WorkspaceToolsPanelProps = {
  open: boolean;
  dark: boolean;
  enabledTools: string[];
  onToggleTool: (tools: string[]) => void;
  onClose: () => void;
};

export function WorkspaceToolsPanel({ open, dark, enabledTools, onToggleTool, onClose }: WorkspaceToolsPanelProps) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleToggle = (toolId: string) => {
    if (enabledTools.includes(toolId)) {
      onToggleTool(enabledTools.filter((t) => t !== toolId));
    } else {
      onToggleTool([...enabledTools, toolId]);
    }
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close tools panel"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40"
        />
      ) : null}
      <div
        className={`fixed right-0 top-0 z-40 h-full w-80 max-w-full shadow-2xl transition-transform duration-200 ${dark ? "bg-slate-900 border-l border-slate-800" : "bg-white border-l border-slate-200"} ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex h-full flex-col">
          <div className={`flex items-center justify-between border-b px-4 py-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
            <h2 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>Workspace Tools</h2>
            <button
              onClick={onClose}
              aria-label="Close workspace tools"
              className={`rounded-lg p-1.5 transition-colors ${dark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <p className={`text-xs leading-relaxed ${dark ? "text-slate-400" : "text-slate-500"}`}>
              Toggle features to enable or disable them for all queries in this workspace.
            </p>
            {TOOLS.map((tool) => {
              const enabled = enabledTools.includes(tool.id);
              return (
                <div
                  key={tool.id}
                  className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                    enabled
                      ? dark ? "border-sky-700 bg-sky-950/40" : "border-sky-200 bg-sky-50"
                      : dark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`Toggle ${tool.label}`}
                    onClick={() => handleToggle(tool.id)}
                    className={`relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors focus:outline-none ${enabled ? "bg-sky-500" : dark ? "bg-slate-700" : "bg-slate-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0"}`}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${dark ? "text-slate-100" : "text-slate-800"}`}>{tool.label}</div>
                    <div className={`mt-0.5 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>{tool.description}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
