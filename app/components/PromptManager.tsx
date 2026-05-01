"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type PromptTemplate = {
  id: string;
  label: string;
  text: string;
  mode: string;
};

type ModeOption = {
  id: string;
  label: string;
};

export function PromptManager({
  open,
  dark,
  templates,
  modeOptions,
  onClose,
  onApply,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  dark: boolean;
  templates: PromptTemplate[];
  modeOptions: ModeOption[];
  onClose: () => void;
  onApply: (templateId: string) => void;
  onCreate: (template: { label: string; text: string; mode: string }) => void;
  onUpdate: (templateId: string, template: { label: string; text: string; mode: string }) => void;
  onDelete: (templateId: string) => void;
}) {
  const initialTemplate = templates[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(() => initialTemplate?.id ?? null);
  const [isCreating, setIsCreating] = useState(() => templates.length === 0);
  const [draftLabel, setDraftLabel] = useState(() => initialTemplate?.label ?? "");
  const [draftText, setDraftText] = useState(() => initialTemplate?.text ?? "");
  const [draftMode, setDraftMode] = useState(() => initialTemplate?.mode ?? modeOptions[0]?.id ?? "auto");

  const selectedTemplate = useMemo(
    () => isCreating ? null : (templates.find((template) => template.id === selectedId) ?? null),
    [isCreating, selectedId, templates]
  );

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

  const canSave = draftLabel.trim() && draftText.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className={`flex h-[min(46rem,calc(100vh-2rem))] w-full max-w-5xl overflow-hidden rounded-[28px] border shadow-2xl ${dark ? "border-slate-800 bg-slate-950 text-slate-100" : "border-sky-200/70 bg-white text-slate-900"}`}>
        <div className={`flex w-full max-w-xs flex-col border-r ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="text-sm font-semibold">Prompt manager</div>
              <div className="mt-1 text-xs text-slate-500">Saved templates for this workspace</div>
            </div>
            <button
              onClick={() => {
                setIsCreating(true);
                setSelectedId(null);
                setDraftLabel("");
                setDraftText("");
                setDraftMode(modeOptions[0]?.id ?? "auto");
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-700"}`}
              title="New template"
              aria-label="New template"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(template.id);
                    setDraftLabel(template.label);
                    setDraftText(template.text);
                    setDraftMode(template.mode);
                  }}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${!isCreating && selectedId === template.id ? (dark ? "border-cyan-700 bg-cyan-950/30" : "border-sky-200 bg-sky-50") : (dark ? "border-slate-800 bg-slate-950 hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-100")}`}
                >
                  <div className="truncate text-sm font-semibold">{template.label}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">{template.mode}</div>
                  <div className="mt-2 truncate text-xs text-slate-500">{template.text}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold">{selectedTemplate ? "Edit template" : "New template"}</div>
              <div className="mt-1 text-xs text-slate-500">Build reusable prompts and apply them directly to the composer.</div>
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

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="grid gap-4">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Label</label>
                <input
                  id="prompt-label"
                  name="promptLabel"
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  placeholder="Template name"
                  className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"}`}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Prompt</label>
                <textarea
                  id="prompt-text"
                  name="promptText"
                  value={draftText}
                  onChange={(event) => setDraftText(event.target.value)}
                  rows={12}
                  placeholder="Write the prompt template here"
                  className={`w-full resize-none rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"}`}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex flex-wrap gap-2">
              {selectedTemplate ? (
                <button
                  onClick={() => onApply(selectedTemplate.id)}
                  className="rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 px-4 py-2 text-sm font-medium text-white hover:from-sky-800 hover:to-cyan-700"
                >
                  Apply to composer
                </button>
              ) : null}
              <button
                onClick={() => {
                  if (!canSave) return;
                  if (selectedTemplate) {
                    onUpdate(selectedTemplate.id, { label: draftLabel.trim(), text: draftText.trim(), mode: draftMode });
                  } else {
                    onCreate({ label: draftLabel.trim(), text: draftText.trim(), mode: draftMode });
                  }
                }}
                disabled={!canSave}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
              >
                {selectedTemplate ? "Save changes" : "Create template"}
              </button>
            </div>

            {selectedTemplate ? (
              <button
                onClick={() => {
                  onDelete(selectedTemplate.id);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm text-red-500 dark:border-red-900"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}