"use client";

type CodeReviewBlock = {
  language: string;
  code: string;
};

type CodeReviewPanelProps = {
  dark: boolean;
  blocks: CodeReviewBlock[];
  onCreateFollowUp: (prompt: string) => void;
};

function summarizeLanguages(blocks: CodeReviewBlock[]) {
  const languages = Array.from(new Set(blocks.map((block) => block.language).filter(Boolean)));
  return languages.length > 0 ? languages.join(", ") : "mixed";
}

export function CodeReviewPanel({ dark, blocks, onCreateFollowUp }: CodeReviewPanelProps) {
  if (blocks.length === 0) return null;

  const combinedCode = blocks.map((block, index) => `Block ${index + 1} (${block.language || "text"}):\n${block.code}`).join("\n\n");
  const lineCount = blocks.reduce((total, block) => total + block.code.split(/\r?\n/).length, 0);

  const actions = [
    {
      label: "Review",
      prompt: `Review this code carefully. Focus on correctness, edge cases, readability, and maintainability.\n\n${combinedCode}`,
    },
    {
      label: "Find bugs",
      prompt: `Find likely bugs, regressions, and risky assumptions in this code. Be specific and propose fixes.\n\n${combinedCode}`,
    },
    {
      label: "Generate tests",
      prompt: `Generate practical tests for this code, including edge cases and failure paths.\n\n${combinedCode}`,
    },
  ];

  return (
    <div className={`mt-3 rounded-2xl border px-4 py-3 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
      <div>
        <div className="text-sm font-semibold">Code analysis</div>
        <div className="mt-1 text-xs text-slate-500">{blocks.length} block{blocks.length === 1 ? "" : "s"} • {lineCount} lines • {summarizeLanguages(blocks)}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => onCreateFollowUp(action.prompt)}
            className={`rounded-full border px-3 py-2 text-sm font-medium transition-colors ${dark ? "border-slate-700 bg-slate-950 text-slate-100 hover:bg-slate-800" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}