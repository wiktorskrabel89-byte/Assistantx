"use client";

type CodeReviewBlock = {
  language: string;
  code: string;
};

type CodeReviewPanelProps = {
  blocks: CodeReviewBlock[];
  onCreateFollowUp: (prompt: string) => void;
};

function summarizeLanguages(blocks: CodeReviewBlock[]) {
  const languages = Array.from(new Set(blocks.map((block) => block.language).filter(Boolean)));
  return languages.length > 0 ? languages.join(", ") : "mixed";
}

export function CodeReviewPanel({ blocks, onCreateFollowUp }: CodeReviewPanelProps) {
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
    <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3">
      <div>
        <div className="text-sm font-semibold text-foreground">Code analysis</div>
        <div className="mt-1 text-xs text-muted-foreground">{blocks.length} block{blocks.length === 1 ? "" : "s"} • {lineCount} lines • {summarizeLanguages(blocks)}</div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => onCreateFollowUp(action.prompt)}
            className="rounded-full border border-border bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}