"use client";

import { Bot, LoaderCircle, Plus, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type CustomAgent = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  preferredMode: string;
};

type ModeOption = {
  id: string;
  label: string;
};

export function CustomAgentManager({
  open,
  dark,
  agents,
  modeOptions,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: {
  open: boolean;
  dark: boolean;
  agents: CustomAgent[];
  modeOptions: ModeOption[];
  onClose: () => void;
  onCreate: (agent: { name: string; description: string; instructions: string; preferredMode: string }) => void;
  onUpdate: (agentId: string, agent: { name: string; description: string; instructions: string; preferredMode: string }) => void;
  onDelete: (agentId: string) => void;
}) {
  const initialAgent = agents[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(() => initialAgent?.id ?? null);
  const [isCreating, setIsCreating] = useState(() => agents.length === 0);
  const [draftName, setDraftName] = useState(() => initialAgent?.name ?? "");
  const [draftDescription, setDraftDescription] = useState(() => initialAgent?.description ?? "");
  const [draftInstructions, setDraftInstructions] = useState(() => initialAgent?.instructions ?? "");
  const [draftPreferredMode, setDraftPreferredMode] = useState(() => initialAgent?.preferredMode ?? modeOptions[0]?.id ?? "chat");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");

  const selectedAgent = useMemo(
    () => isCreating ? null : (agents.find((agent) => agent.id === selectedId) ?? null),
    [agents, isCreating, selectedId]
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

  const canSave = draftName.trim() && draftDescription.trim() && draftInstructions.trim();
  const canGenerate = draftName.trim().length > 0;

  async function generateAgentDocumentation() {
    if (!canGenerate) {
      setGenerationError("Enter an agent name first.");
      return;
    }

    setIsGenerating(true);
    setGenerationError("");

    try {
      const response = await fetch("/api/agents/documentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          descriptionHint: draftDescription.trim(),
          preferredMode: draftPreferredMode,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Failed to generate agent documentation.");
      }

      if (typeof data.description === "string" && data.description.trim()) {
        setDraftDescription(data.description.trim());
      }
      if (typeof data.instructions === "string" && data.instructions.trim()) {
        setDraftInstructions(data.instructions.trim());
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Failed to generate agent documentation.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className={`flex h-[min(46rem,calc(100vh-2rem))] w-full max-w-5xl overflow-hidden rounded-[28px] border shadow-2xl ${dark ? "border-slate-800 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}>
        <div className={`flex w-full max-w-xs flex-col border-r ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
          <div className="flex items-center justify-between px-4 py-4">
            <div>
              <div className="text-sm font-semibold">Custom agents</div>
              <div className="mt-1 text-xs text-slate-500">Create reusable assistant personas for this workspace</div>
            </div>
            <button
              onClick={() => {
                setIsCreating(true);
                setSelectedId(null);
                setDraftName("");
                setDraftDescription("");
                setDraftInstructions("");
                setDraftPreferredMode(modeOptions[0]?.id ?? "chat");
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-700"}`}
              title="New agent"
              aria-label="New agent"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <div className="space-y-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  onClick={() => {
                    setIsCreating(false);
                    setSelectedId(agent.id);
                    setDraftName(agent.name);
                    setDraftDescription(agent.description);
                    setDraftInstructions(agent.instructions);
                    setDraftPreferredMode(agent.preferredMode);
                  }}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${!isCreating && selectedId === agent.id ? (dark ? "border-blue-700 bg-blue-950/30" : "border-blue-200 bg-blue-50") : (dark ? "border-slate-800 bg-slate-950 hover:bg-slate-800" : "border-slate-200 bg-white hover:bg-slate-100")}`}
                >
                  <div className="truncate text-sm font-semibold">{agent.name}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">{agent.preferredMode}</div>
                  <div className="mt-2 truncate text-xs text-slate-500">{agent.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-blue-500" />
                <span>{selectedAgent ? "Edit agent" : "New agent"}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">Describe the assistant and give it explicit instructions for future chats.</div>
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
                <label className="mb-1 block text-xs text-slate-500">Agent name</label>
                <input
                  id="agent-name"
                  name="agentName"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="Frontend reviewer"
                  className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"}`}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Short description</label>
                <input
                  id="agent-description"
                  name="agentDescription"
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  placeholder="Reviews React UI work and spots regressions"
                  className={`w-full rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"}`}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-500">Instructions</label>
                <textarea
                  id="agent-instructions"
                  name="agentInstructions"
                  value={draftInstructions}
                  onChange={(event) => setDraftInstructions(event.target.value)}
                  rows={12}
                  placeholder="Tell the agent how it should reason, what to prioritize, and how to structure answers."
                  className={`w-full resize-none rounded-2xl border px-3 py-3 text-sm ${dark ? "border-slate-700 bg-slate-900 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-white text-slate-900 placeholder-slate-400"}`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => void generateAgentDocumentation()}
                  disabled={!canGenerate || isGenerating}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                >
                  {isGenerating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-blue-500" />}
                  <span>{isGenerating ? "Generating..." : "Generate docs"}</span>
                </button>
                <div className="text-xs text-slate-500">Use AI to draft the description and instructions from the agent name.</div>
              </div>

              {generationError ? <div className="text-sm text-rose-500">{generationError}</div> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800">
            <button
              onClick={() => {
                if (!canSave) return;
                if (selectedAgent) {
                  onUpdate(selectedAgent.id, {
                    name: draftName.trim(),
                    description: draftDescription.trim(),
                    instructions: draftInstructions.trim(),
                    preferredMode: draftPreferredMode,
                  });
                } else {
                  onCreate({
                    name: draftName.trim(),
                    description: draftDescription.trim(),
                    instructions: draftInstructions.trim(),
                    preferredMode: draftPreferredMode,
                  });
                }
              }}
              disabled={!canSave}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
            >
              {selectedAgent ? "Save agent" : "Create agent"}
            </button>

            {selectedAgent ? (
              <button
                onClick={() => onDelete(selectedAgent.id)}
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