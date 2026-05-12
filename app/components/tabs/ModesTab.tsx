"use client";

import { useCallback, useState } from "react";
import { Lock, Plus, Trash2, Zap, ZapOff } from "lucide-react";
import { useWorkspace } from "@/app/providers/WorkspaceProvider";
import { modeInstructionsPreview } from "@/app/lib/chat-state";
import type { JarvisMode } from "@/app/lib/chat-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type DraftMode = {
  name: string;
  description: string;
  instructions: string;
  icon: string;
};

const EMPTY_DRAFT: DraftMode = { name: "", description: "", instructions: "", icon: "🤖" };

const ICON_OPTIONS = ["🤖", "🎮", "🎯", "📚", "✨", "😎", "🔥", "🧠", "🛠️", "🎵", "💼", "🌍"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultModeFirst(modes: JarvisMode[]): JarvisMode[] {
  return [...modes].sort((a, b) => {
    if (a.isDefault === b.isDefault) return a.createdAt - b.createdAt;
    return a.isDefault ? -1 : 1;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModePreviewCard({ instructions }: { instructions: string }) {
  const bullets = modeInstructionsPreview(instructions, 4);
  if (!bullets.length) return null;
  return (
    <div className="rounded-lg border border-dashed border-sky-300 bg-sky-50/60 p-3 dark:border-sky-700/50 dark:bg-sky-950/30">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
        When this mode is active, Jarvis will…
      </p>
      <ul className="space-y-1">
        {bullets.map((line, i) => (
          <li key={i} className="flex gap-1.5 text-xs text-sky-900 dark:text-sky-200">
            <span className="mt-0.5 flex-shrink-0 text-sky-500">•</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DefaultModeCard({
  mode,
  isActive,
  onActivate,
}: {
  mode: JarvisMode;
  isActive: boolean;
  onActivate: () => void;
}) {
  return (
    <Card
      className={cn(
        "border transition-all",
        isActive
          ? "border-sky-400 bg-sky-50 shadow-sm dark:border-sky-600 dark:bg-sky-950/40"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900/50",
      )}
    >
      <CardHeader className="pb-2 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{mode.icon ?? "🤖"}</span>
            <CardTitle className="text-sm text-slate-900 dark:text-slate-100">{mode.name}</CardTitle>
            {isActive && (
              <Badge className="h-4 bg-sky-100 px-1 text-[9px] text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                Active
              </Badge>
            )}
          </div>
          <Lock className="h-3 w-3 flex-shrink-0 text-slate-400" aria-label="Built-in mode" />
        </div>
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        <p className="mb-2.5 text-xs leading-5 text-slate-600 dark:text-slate-400">{mode.description}</p>
        <Button
          size="sm"
          variant={isActive ? "secondary" : "outline"}
          className="h-7 text-xs"
          onClick={onActivate}
        >
          {isActive ? <><ZapOff className="mr-1 h-3 w-3" /> Deactivate</> : <><Zap className="mr-1 h-3 w-3" /> Activate</>}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ModesTab() {
  const {
    activeWorkspace,
    createJarvisMode,
    updateJarvisMode,
    deleteJarvisMode,
    setActiveJarvisMode,
  } = useWorkspace();

  const { jarvisModes = [], activeJarvisModeId = null } = activeWorkspace.settings;
  const sortedModes = defaultModeFirst(jarvisModes);
  const defaultModes = sortedModes.filter((m) => m.isDefault);
  const customModes = sortedModes.filter((m) => !m.isDefault);

  // Editing state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<DraftMode>(EMPTY_DRAFT);
  const [saveError, setSaveError] = useState("");

  const selectedMode = selectedId ? jarvisModes.find((m) => m.id === selectedId) ?? null : null;

  // ── Selection helpers ─────────────────────────────────────────────────────

  const selectMode = useCallback((mode: JarvisMode) => {
    setIsCreating(false);
    setSaveError("");
    setSelectedId(mode.id);
    setDraft({
      name: mode.name,
      description: mode.description,
      instructions: mode.instructions,
      icon: mode.icon ?? "🤖",
    });
  }, []);

  const startCreating = useCallback(() => {
    setSelectedId(null);
    setIsCreating(true);
    setSaveError("");
    setDraft(EMPTY_DRAFT);
  }, []);

  const cancelEditing = useCallback(() => {
    setSelectedId(null);
    setIsCreating(false);
    setSaveError("");
    setDraft(EMPTY_DRAFT);
  }, []);

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    const name = draft.name.trim();
    const description = draft.description.trim();
    const instructions = draft.instructions.trim();

    if (!name) { setSaveError("Name is required."); return; }
    if (!instructions) { setSaveError("Instructions are required."); return; }
    setSaveError("");

    if (isCreating) {
      const newId = createJarvisMode({ name, description, instructions, icon: draft.icon });
      setSelectedId(newId);
      setIsCreating(false);
    } else if (selectedId) {
      updateJarvisMode(selectedId, { name, description, instructions, icon: draft.icon });
    }
  }, [createJarvisMode, draft, isCreating, selectedId, updateJarvisMode]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    if (!window.confirm("Delete this mode?")) return;
    deleteJarvisMode(selectedId);
    cancelEditing();
  }, [cancelEditing, deleteJarvisMode, selectedId]);

  const handleActivate = useCallback((modeId: string) => {
    setActiveJarvisMode(activeJarvisModeId === modeId ? null : modeId);
  }, [activeJarvisModeId, setActiveJarvisMode]);

  const isEditing = isCreating || (selectedId !== null && !selectedMode?.isDefault);
  const canEdit = isCreating || (selectedMode !== null && !selectedMode.isDefault);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.10),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8 dark:bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.10),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Jarvis Modes</h1>
            {activeJarvisModeId && (
              <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300">
                {jarvisModes.find((m) => m.id === activeJarvisModeId)?.icon ?? "🤖"}{" "}
                {jarvisModes.find((m) => m.id === activeJarvisModeId)?.name ?? ""} active
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Create named behaviour presets for Jarvis. Say <em>&ldquo;start [name] mode&rdquo;</em> or activate below.
          </p>
        </div>

        {/* Built-in default mode cards */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Built-in modes
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {defaultModes.map((mode) => (
              <DefaultModeCard
                key={mode.id}
                mode={mode}
                isActive={activeJarvisModeId === mode.id}
                onActivate={() => handleActivate(mode.id)}
              />
            ))}
          </div>
        </div>

        <Separator />

        {/* Custom modes + editor */}
        <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">

          {/* Left: custom mode list */}
          <div className="flex w-full flex-col gap-2 lg:w-60 lg:flex-shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                My modes
              </p>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={startCreating}>
                <Plus className="h-3 w-3" /> New
              </Button>
            </div>

            {customModes.length === 0 && !isCreating && (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No custom modes yet.<br />Click <strong>New</strong> to create one.
              </p>
            )}

            <div className="flex flex-col gap-1">
              {customModes.map((mode) => {
                const isActive = activeJarvisModeId === mode.id;
                const isSelected = selectedId === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => selectMode(mode)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all",
                      isSelected
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-foreground/70 hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <span className="flex-shrink-0 text-base">{mode.icon ?? "🤖"}</span>
                    <span className="flex-1 truncate font-medium">{mode.name}</span>
                    {isActive && <Zap className="h-3 w-3 flex-shrink-0 text-sky-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: editor panel */}
          <div className="min-w-0 flex-1">
            {!isCreating && !selectedId && (
              <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                <div className="text-center">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Select a custom mode to edit,</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">or click <strong>New</strong> to create one.</p>
                </div>
              </div>
            )}

            {(isCreating || selectedId) && (
              <Card className="border-slate-200 bg-white/90 dark:border-slate-700 dark:bg-slate-900/80">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {isCreating ? "New mode" : (canEdit ? "Edit mode" : selectedMode?.name ?? "")}
                    </CardTitle>
                    {!canEdit && selectedMode && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Lock className="h-2.5 w-2.5" /> Built-in
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex flex-col gap-4">
                  {/* Icon picker */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Icon</label>
                    <div className="flex flex-wrap gap-1.5">
                      {ICON_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setDraft((d) => ({ ...d, icon: emoji }))}
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-lg border text-base transition-all",
                            draft.icon === emoji
                              ? "border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/40"
                              : "border-slate-200 hover:border-slate-400 dark:border-slate-700",
                            !canEdit && "cursor-default opacity-60",
                          )}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <label htmlFor="mode-name" className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="mode-name"
                      name="modeName"
                      value={draft.name}
                      disabled={!canEdit}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      placeholder="e.g. Night Owl"
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label htmlFor="mode-desc" className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Short description
                    </label>
                    <Input
                      id="mode-desc"
                      name="modeDescription"
                      value={draft.description}
                      disabled={!canEdit}
                      onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder="One-line summary of this mode"
                      className="h-9 text-sm"
                    />
                  </div>

                  {/* Instructions */}
                  <div>
                    <label htmlFor="mode-instructions" className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Instructions <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      id="mode-instructions"
                      name="modeInstructions"
                      value={draft.instructions}
                      disabled={!canEdit}
                      onChange={(e) => setDraft((d) => ({ ...d, instructions: e.target.value }))}
                      placeholder="Describe how Jarvis should behave in this mode. E.g. 'Be concise. Focus only on technical answers. Avoid pleasantries.'"
                      rows={5}
                      className={cn(
                        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
                        "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                        !canEdit && "cursor-default opacity-70",
                      )}
                    />
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      These instructions are prepended to the system prompt when this mode is active.
                    </p>
                  </div>

                  {/* Live preview */}
                  {draft.instructions.trim() && (
                    <ModePreviewCard instructions={draft.instructions} />
                  )}

                  {saveError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>
                  )}

                  {/* Action row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Activate / Deactivate */}
                    {selectedId && !isCreating && (
                      <Button
                        size="sm"
                        variant={activeJarvisModeId === selectedId ? "secondary" : "default"}
                        className="gap-1.5"
                        onClick={() => handleActivate(selectedId)}
                      >
                        {activeJarvisModeId === selectedId
                          ? <><ZapOff className="h-3.5 w-3.5" /> Deactivate</>
                          : <><Zap className="h-3.5 w-3.5" /> Activate</>}
                      </Button>
                    )}

                    {canEdit && (
                      <Button size="sm" onClick={handleSave} className="gap-1.5">
                        Save
                      </Button>
                    )}

                    <Button size="sm" variant="ghost" onClick={cancelEditing} className="text-slate-500">
                      Cancel
                    </Button>

                    {selectedId && !isCreating && !selectedMode?.isDefault && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto gap-1 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        onClick={handleDelete}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
