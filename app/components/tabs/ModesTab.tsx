"use client";

import { useCallback, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  GripVertical,
  Lock,
  MessageSquareText,
  Plus,
  Sliders,
  Trash2,
  Zap,
  ZapOff,
} from "lucide-react";
import { useWorkspace } from "@/app/providers/WorkspaceProvider";
import type { ActionMode, ActionStep, ActionStepType } from "@/app/lib/chat-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { createId } from "@/app/lib/chat-state";

const STEP_ICONS: Record<ActionStepType, string> = {
  open_url: "🌐",
  switch_jarvis_mode: "🎭",
  send_message: "💬",
};

const STEP_TYPE_LABELS: Record<ActionStepType, string> = {
  open_url: "Open URL / App",
  switch_jarvis_mode: "Switch Jarvis Personality",
  send_message: "Send Message to Jarvis",
};

const ICON_OPTIONS = ["🎮", "📚", "💼", "🎵", "✨", "🔥", "🧠", "🛠️", "🌍", "😎", "🎯", "💡", "🤖", "🚀"];

const COMMON_APPS = [
  { label: "Roblox", url: "https://www.roblox.com" },
  { label: "Discord", url: "https://discord.com/app" },
  { label: "Spotify", url: "https://open.spotify.com" },
  { label: "YouTube", url: "https://www.youtube.com" },
  { label: "Twitch", url: "https://www.twitch.tv" },
  { label: "Notion", url: "https://www.notion.so" },
  { label: "Figma", url: "https://www.figma.com" },
  { label: "GitHub", url: "https://github.com" },
  { label: "Netflix", url: "https://www.netflix.com" },
  { label: "Reddit", url: "https://www.reddit.com" },
];

function makeEmptyStep(type: ActionStepType): ActionStep {
  return {
    id: createId(),
    type,
    label: STEP_TYPE_LABELS[type],
    url: type === "open_url" ? "" : undefined,
    message: type === "send_message" ? "" : undefined,
    jarvisModeId: type === "switch_jarvis_mode" ? "" : undefined,
  };
}

export function executeActionModeSteps(
  steps: ActionStep[],
  jarvisModes: { id: string; name: string }[],
  callbacks: {
    setActiveJarvisMode: (id: string | null) => void;
    queueChatMessage?: (text: string) => void;
  },
) {
  for (const step of steps) {
    switch (step.type) {
      case "open_url":
        if (step.url) window.open(step.url, "_blank", "noopener,noreferrer");
        break;
      case "switch_jarvis_mode":
        if (step.jarvisModeId) callbacks.setActiveJarvisMode(step.jarvisModeId);
        break;
      case "send_message":
        if (step.message && callbacks.queueChatMessage) callbacks.queueChatMessage(step.message);
        break;
    }
  }
}

function StepCard({
  step,
  jarvisModes,
  disabled,
  onUpdate,
  onRemove,
}: {
  step: ActionStep;
  jarvisModes: { id: string; name: string; icon?: string }[];
  disabled: boolean;
  onUpdate: (updated: Partial<ActionStep>) => void;
  onRemove: () => void;
}) {
  const [showAppPicker, setShowAppPicker] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <GripVertical className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{STEP_ICONS[step.type]}</span>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{STEP_TYPE_LABELS[step.type]}</span>
        </div>
        <Input
          name="stepLabel"
          value={step.label}
          disabled={disabled}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="Step label"
          className="h-7 text-xs"
        />
        {step.type === "open_url" && (
          <div className="space-y-1.5">
            <Input
              name="stepUrl"
              value={step.url ?? ""}
              disabled={disabled}
              onChange={(e) => onUpdate({ url: e.target.value })}
              placeholder="https://... or deep-link"
              className="h-7 text-xs"
            />
            {!disabled && (
              <div>
                <button type="button" onClick={() => setShowAppPicker((v) => !v)} className="flex items-center gap-1 text-[10px] text-sky-600 hover:underline dark:text-sky-400">
                  Quick-pick app <ChevronDown className="h-3 w-3" />
                </button>
                {showAppPicker && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {COMMON_APPS.map((app) => (
                      <button key={app.url} type="button" onClick={() => { onUpdate({ url: app.url, label: `Open ${app.label}` }); setShowAppPicker(false); }} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
                        {app.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {step.type === "switch_jarvis_mode" && (
          <select name="stepJarvisMode" value={step.jarvisModeId ?? ""} disabled={disabled} onChange={(e) => onUpdate({ jarvisModeId: e.target.value })} className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus:ring-1 focus:ring-ring disabled:opacity-60">
            <option value="">— select personality —</option>
            {jarvisModes.map((m) => <option key={m.id} value={m.id}>{m.icon ?? "🤖"} {m.name}</option>)}
          </select>
        )}
        {step.type === "send_message" && (
          <textarea name="stepMessage" value={step.message ?? ""} disabled={disabled} onChange={(e) => onUpdate({ message: e.target.value })} placeholder="What to say to Jarvis when this mode starts…" rows={2} className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60" />
        )}
      </div>
      {!disabled && (
        <button type="button" onClick={onRemove} className="mt-1 flex-shrink-0 text-slate-400 hover:text-red-500" title="Remove step">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function AddStepMenu({ onAdd }: { onAdd: (type: ActionStepType) => void }) {
  const [open, setOpen] = useState(false);
  const types: ActionStepType[] = ["open_url", "switch_jarvis_mode", "send_message"];
  return (
    <div className="relative">
      <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setOpen((v) => !v)}>
        <Plus className="h-3.5 w-3.5" /> Add step
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {types.map((t) => (
            <button key={t} type="button" onClick={() => { onAdd(t); setOpen(false); }} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent">
              <span className="text-sm">{STEP_ICONS[t]}</span>
              {STEP_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DefaultModeCard({ mode, isActive, onRun, onSelect }: { mode: ActionMode; isActive: boolean; onRun: () => void; onSelect: () => void }) {
  return (
    <Card className={cn("cursor-pointer border transition-all hover:shadow-sm", isActive ? "border-sky-400 bg-sky-50 dark:border-sky-600 dark:bg-sky-950/40" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/50")} onClick={onSelect}>
      <CardHeader className="pb-1 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{mode.icon}</span>
          <CardTitle className="text-sm">{mode.name}</CardTitle>
          {isActive && <Badge className="ml-auto h-4 bg-sky-100 px-1.5 text-[9px] text-sky-700 dark:bg-sky-900 dark:text-sky-300">Active</Badge>}
          <Lock className="h-3 w-3 text-slate-400" />
        </div>
      </CardHeader>
      <CardContent className="pb-3 pt-0">
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{mode.description}</p>
        <div className="mb-3 space-y-1">
          {mode.steps.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 text-[10px] text-slate-500">
              <span>{STEP_ICONS[s.type]}</span>
              <span className="truncate">{s.label}</span>
              {s.url && <ExternalLink className="ml-0.5 h-2.5 w-2.5 flex-shrink-0 opacity-60" />}
            </div>
          ))}
        </div>
        <Button size="sm" variant={isActive ? "secondary" : "default"} className="h-7 gap-1 text-xs" onClick={(e) => { e.stopPropagation(); onRun(); }}>
          <Zap className="h-3 w-3" /> {isActive ? "Run again" : "Start"}
        </Button>
      </CardContent>
    </Card>
  );
}

type ModesTabProps = { onQueueMessage?: (text: string) => void };

export function ModesTab({ onQueueMessage }: ModesTabProps) {
  const { activeWorkspace, createActionMode, updateActionMode, deleteActionMode, setActiveActionMode, setActiveJarvisMode } = useWorkspace();
  const { actionModes = [], activeActionModeId = null, jarvisModes = [] } = activeWorkspace.settings;
  const defaultModes = actionModes.filter((m) => m.isDefault);
  const customModes = actionModes.filter((m) => !m.isDefault);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftIcon, setDraftIcon] = useState("🤖");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftSteps, setDraftSteps] = useState<ActionStep[]>([]);
  const [saveError, setSaveError] = useState("");

  const selectedMode = selectedId ? actionModes.find((m) => m.id === selectedId) ?? null : null;
  const canEdit = isCreating || (selectedMode !== null && !selectedMode.isDefault);

  const runMode = useCallback((mode: ActionMode) => {
    setActiveActionMode(mode.id);
    executeActionModeSteps(mode.steps, jarvisModes, { setActiveJarvisMode, queueChatMessage: onQueueMessage });
  }, [jarvisModes, onQueueMessage, setActiveActionMode, setActiveJarvisMode]);

  const selectMode = useCallback((mode: ActionMode) => {
    setIsCreating(false); setSaveError(""); setSelectedId(mode.id);
    setDraftName(mode.name); setDraftIcon(mode.icon ?? "🤖"); setDraftDesc(mode.description);
    setDraftSteps(mode.steps.map((s) => ({ ...s })));
  }, []);

  const startCreating = useCallback(() => {
    setSelectedId(null); setIsCreating(true); setSaveError("");
    setDraftName(""); setDraftIcon("🤖"); setDraftDesc(""); setDraftSteps([]);
  }, []);

  const cancelEditing = useCallback(() => { setSelectedId(null); setIsCreating(false); setSaveError(""); setDraftSteps([]); }, []);
  const addStep = useCallback((type: ActionStepType) => { setDraftSteps((prev) => [...prev, makeEmptyStep(type)]); }, []);
  const updateStep = useCallback((stepId: string, patch: Partial<ActionStep>) => { setDraftSteps((prev) => prev.map((s) => s.id === stepId ? { ...s, ...patch } : s)); }, []);
  const removeStep = useCallback((stepId: string) => { setDraftSteps((prev) => prev.filter((s) => s.id !== stepId)); }, []);

  const handleSave = useCallback(() => {
    const name = draftName.trim();
    if (!name) { setSaveError("Name is required."); return; }
    setSaveError("");
    if (isCreating) {
      const newId = createActionMode({ name, icon: draftIcon, description: draftDesc.trim(), steps: draftSteps });
      setSelectedId(newId); setIsCreating(false);
    } else if (selectedId) {
      updateActionMode(selectedId, { name, icon: draftIcon, description: draftDesc.trim(), steps: draftSteps });
    }
  }, [createActionMode, draftDesc, draftIcon, draftName, draftSteps, isCreating, selectedId, updateActionMode]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    if (!window.confirm("Delete this mode?")) return;
    deleteActionMode(selectedId); cancelEditing();
  }, [cancelEditing, deleteActionMode, selectedId]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.10),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8 dark:bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.10),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">Modes</h1>
            {activeActionModeId && (() => {
              const active = actionModes.find((m) => m.id === activeActionModeId);
              return active ? (
                <button type="button" onClick={() => setActiveActionMode(null)} className="flex items-center gap-1.5 rounded-full border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                  <span>{active.icon}</span><span>{active.name} active</span><ZapOff className="h-3 w-3 opacity-70" />
                </button>
              ) : null;
            })()}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Say <em>&ldquo;hey Jarvis, start [name] mode&rdquo;</em> or tap <strong>Start</strong>. Each mode runs a sequence of actions — open apps, switch personality, and more.
          </p>
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Built-in modes</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {defaultModes.map((mode) => (
              <DefaultModeCard key={mode.id} mode={mode} isActive={activeActionModeId === mode.id} onRun={() => runMode(mode)} onSelect={() => selectMode(mode)} />
            ))}
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
          <div className="flex w-full flex-col gap-2 lg:w-56 lg:flex-shrink-0">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">My modes</p>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={startCreating}><Plus className="h-3 w-3" /> New</Button>
            </div>
            {customModes.length === 0 && !isCreating && (
              <p className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                No custom modes yet.<br />Click <strong>New</strong> to create one.
              </p>
            )}
            <div className="flex flex-col gap-1">
              {customModes.map((mode) => {
                const isActive = activeActionModeId === mode.id;
                const isSelected = selectedId === mode.id;
                return (
                  <button key={mode.id} type="button" onClick={() => selectMode(mode)} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-all", isSelected ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-foreground/70 hover:bg-accent/60 hover:text-foreground")}>
                    <span className="flex-shrink-0 text-base">{mode.icon}</span>
                    <span className="flex-1 truncate font-medium">{mode.name}</span>
                    {isActive && <Zap className="h-3 w-3 flex-shrink-0 text-sky-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {!isCreating && !selectedId && (
              <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                <div className="text-center">
                  <Sliders className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">Select a mode to view,</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">or click <strong>New</strong> to build your own.</p>
                </div>
              </div>
            )}
            {(isCreating || selectedId) && (
              <Card className="border-slate-200 bg-white/90 dark:border-slate-700 dark:bg-slate-900/80">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{isCreating ? "New mode" : (canEdit ? "Edit mode" : selectedMode?.name)}</CardTitle>
                    {!canEdit && <Badge variant="outline" className="gap-1 text-xs"><Lock className="h-2.5 w-2.5" /> Built-in</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Icon</label>
                    <div className="flex flex-wrap gap-1">
                      {ICON_OPTIONS.map((emoji) => (
                        <button key={emoji} type="button" disabled={!canEdit} onClick={() => setDraftIcon(emoji)} className={cn("h-8 w-8 rounded-lg border text-base transition-all", draftIcon === emoji ? "border-sky-400 bg-sky-50 dark:border-sky-600" : "border-slate-200 hover:border-slate-400 dark:border-slate-700", !canEdit && "cursor-default opacity-60")}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="mode-name" className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Name <span className="text-red-500">*</span></label>
                    <Input id="mode-name" name="modeName" value={draftName} disabled={!canEdit} onChange={(e) => setDraftName(e.target.value)} placeholder="e.g. Homework, Gym, Late Night" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="mode-desc" className="mb-1.5 block text-xs font-medium text-slate-700 dark:text-slate-300">Description</label>
                    <Input id="mode-desc" name="modeDesc" value={draftDesc} disabled={!canEdit} onChange={(e) => setDraftDesc(e.target.value)} placeholder="What does this mode do?" className="h-9 text-sm" />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium text-slate-700 dark:text-slate-300">Steps — what happens when this mode starts</label>
                    <div className="space-y-2">
                      {draftSteps.length === 0 && (
                        <p className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          No steps yet. Click &ldquo;Add step&rdquo; below.
                        </p>
                      )}
                      {draftSteps.map((step) => (
                        <StepCard key={step.id} step={step} jarvisModes={jarvisModes} disabled={!canEdit} onUpdate={(patch) => updateStep(step.id, patch)} onRemove={() => removeStep(step.id)} />
                      ))}
                    </div>
                    {canEdit && <div className="mt-2"><AddStepMenu onAdd={addStep} /></div>}
                  </div>
                  {saveError && <p className="text-xs text-red-600 dark:text-red-400">{saveError}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedId && !isCreating && (
                      <Button size="sm" variant={activeActionModeId === selectedId ? "secondary" : "default"} className="gap-1.5" onClick={() => selectedMode && runMode(selectedMode)}>
                        {activeActionModeId === selectedId ? <><ZapOff className="h-3.5 w-3.5" /> Deactivate</> : <><Zap className="h-3.5 w-3.5" /> Start mode</>}
                      </Button>
                    )}
                    {canEdit && <Button size="sm" onClick={handleSave}>Save</Button>}
                    <Button size="sm" variant="ghost" className="text-slate-500" onClick={cancelEditing}>{canEdit ? "Cancel" : "Close"}</Button>
                    {selectedId && !isCreating && !selectedMode?.isDefault && (
                      <Button size="sm" variant="ghost" className="ml-auto gap-1 text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40" onClick={handleDelete}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                  {draftSteps.some((s) => s.type === "send_message") && !onQueueMessage && (
                    <p className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                      <MessageSquareText className="h-3 w-3 flex-shrink-0" />
                      &ldquo;Send message&rdquo; steps only fire when activated from the Chat tab.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
