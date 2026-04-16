"use client";

import type { MessageFeedback } from "../lib/chat-types";

const FEEDBACK_OPTIONS: Array<{ value: MessageFeedback; emoji: string; label: string }> = [
  { value: "love", emoji: "😍", label: "Loved it" },
  { value: "helpful", emoji: "👍", label: "Helpful" },
  { value: "mixed", emoji: "🤔", label: "Mixed" },
  { value: "needs-work", emoji: "👎", label: "Needs work" },
];

type FeedbackEmojisProps = {
  dark: boolean;
  value?: MessageFeedback;
  onChange: (value: MessageFeedback | null) => void;
};

export function FeedbackEmojis({ dark, value, onChange }: FeedbackEmojisProps) {
  return (
    <div className={`mt-3 rounded-2xl border px-3 py-3 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Rate this response</span>
        <div className="flex flex-wrap items-center gap-2">
          {FEEDBACK_OPTIONS.map((option) => {
            const selected = value === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-label={option.label}
                title={option.label}
                onClick={() => onChange(selected ? null : option.value)}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-lg transition-colors ${selected ? (dark ? "border-blue-700 bg-blue-950/40" : "border-blue-300 bg-blue-50") : (dark ? "border-slate-700 bg-slate-950 hover:bg-slate-800" : "border-slate-200 bg-slate-50 hover:bg-slate-100")}`}
              >
                <span role="img" aria-hidden="true">{option.emoji}</span>
              </button>
            );
          })}
        </div>
      </div>
      {value ? <div className="mt-2 text-xs text-slate-500">Saved feedback: {FEEDBACK_OPTIONS.find((option) => option.value === value)?.label}</div> : null}
    </div>
  );
}