"use client";

import { Sparkles, Wand2, X } from "lucide-react";
import { useEffect } from "react";

type QuickChip = {
  label: string;
  text: string;
  mode?: string;
};

type ModeOption = {
  id: string;
  label: string;
  description: string;
};

type LanguageOption = {
  code: string;
  label: string;
};

type ToolSettings = {
  styleMode: string;
  languageLock: string;
  memoryEnabled: boolean;
  memoryNotes: string;
};

export function AIToolsPanel({
  open,
  dark,
  mode,
  modeOptions,
  quickChips,
  settings,
  languageOptions,
  onClose,
  onModeChange,
  onQuickChip,
  onStyleChange,
  onLanguageChange,
  onMemoryToggle,
  onMemoryNotesChange,
  onClearMemory,
  onClearChat,
}: {
  open: boolean;
  dark: boolean;
  mode: string;
  modeOptions: ModeOption[];
  quickChips: QuickChip[];
  settings: ToolSettings;
  languageOptions: LanguageOption[];
  onClose: () => void;
  onModeChange: (modeId: string) => void;
  onQuickChip: (chip: QuickChip) => void;
  onStyleChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onMemoryToggle: (enabled: boolean) => void;
  onMemoryNotesChange: (value: string) => void;
  onClearMemory: () => void;
  onClearChat: () => void;
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
    <>
      <button
        type="button"
        aria-label="Close AI tools panel"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/45"
      />
      <aside className={`fixed inset-y-3 right-3 z-50 w-[min(26rem,calc(100vw-1.5rem))] rounded-[26px] border ${dark ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
            <div>
              <div className="text-sm font-semibold">AI tools</div>
              <div className="mt-1 text-xs text-slate-500">Mode, prompt shortcuts, and memory controls</div>
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

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <section className={`rounded-3xl border p-4 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-blue-500" />
                <h2 className="text-sm font-semibold">Modes</h2>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {modeOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => onModeChange(option.id)}
                    className={`rounded-2xl border px-3 py-3 text-left transition-colors ${mode === option.id ? (dark ? "border-blue-700 bg-blue-950/30 text-blue-100" : "border-blue-200 bg-blue-50 text-blue-800") : (dark ? "border-slate-800 bg-slate-950 hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-100")}`}
                  >
                    <div className="font-medium">{option.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{option.description}</div>
                  </button>
                ))}
              </div>
            </section>

            <section className={`mt-4 rounded-3xl border p-4 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500" />
                <h2 className="text-sm font-semibold">Prompt shortcuts</h2>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickChips.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => onQuickChip(chip)}
                    className={`rounded-full border px-3 py-1.5 text-xs ${dark ? "border-slate-700 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </section>

            <section className={`mt-4 rounded-3xl border p-4 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
              <h2 className="text-sm font-semibold">Preferences</h2>
              <div className="mt-3 grid gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Response style</label>
                  <select
                    value={settings.styleMode}
                    onChange={(event) => onStyleChange(event.target.value)}
                    className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
                  >
                    <option value="concise">Concise</option>
                    <option value="detailed">Detailed</option>
                    <option value="step-by-step">Step by step</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-500">Reply language</label>
                  <select
                    value={settings.languageLock}
                    onChange={(event) => onLanguageChange(event.target.value)}
                    className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
                  >
                    {languageOptions.map((option) => (
                      <option key={option.code} value={option.code}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-800">
                  <span>Use conversation memory</span>
                  <input
                    type="checkbox"
                    checked={settings.memoryEnabled}
                    onChange={(event) => onMemoryToggle(event.target.checked)}
                  />
                </label>

                <textarea
                  value={settings.memoryNotes}
                  onChange={(event) => onMemoryNotesChange(event.target.value)}
                  rows={4}
                  placeholder="Pinned memory for this workspace"
                  className={`w-full resize-none rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"}`}
                />

                <div className="flex flex-wrap gap-2">
                  <button onClick={onClearMemory} className="rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                    Clear pinned memory
                  </button>
                  <button onClick={onClearChat} className="rounded-xl border border-red-300 px-3 py-2 text-xs text-red-500 dark:border-red-900">
                    Clear active chat
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </aside>
    </>
  );
}