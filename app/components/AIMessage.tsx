"use client";

import { useMemo } from "react";
import { CodeReviewPanel } from "./CodeReviewPanel";
import { FeedbackEmojis } from "./FeedbackEmojis";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatEntry, MessageFeedback, ResponseAction } from "../lib/chat-types";

type AIMessageProps = {
  entry: ChatEntry;
  dark: boolean;
  cardBg: string;
  codeBg: string;
  copied: string | null;
  isStreaming: boolean;
  reasoningOpen: boolean;
  feedback?: MessageFeedback;
  onCopyText: (text: string, id: string) => void;
  onToggleReasoning: (id: string) => void;
  onResponseAction: (action: ResponseAction, text: string) => void;
  onCreateFollowUp: (prompt: string) => void;
  onFeedbackChange: (value: MessageFeedback | null) => void;
};

export function AIMessage({
  entry,
  dark,
  cardBg,
  codeBg,
  copied,
  isStreaming,
  reasoningOpen,
  feedback,
  onCopyText,
  onToggleReasoning,
  onResponseAction,
  onCreateFollowUp,
  onFeedbackChange,
}: AIMessageProps) {
  let codeBlockIndex = 0;
  const responseCopyId = `${entry.id}-response`;
  const codeBlocks = useMemo(() => {
    const matches = Array.from(entry.ai.matchAll(/```([\w-]+)?\n([\s\S]*?)```/g));
    return matches.map((match) => ({
      language: match[1] || "text",
      code: match[2].trim(),
    })).filter((block) => block.code.length > 0);
  }, [entry.ai]);

  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] space-y-1">
        {entry.reasoning ? (
          <div className={`mb-1 rounded-xl border px-3 py-2 text-xs ${dark ? "border-purple-800/30 bg-purple-950/30 text-purple-300" : "border-purple-200 bg-purple-50 text-purple-700"}`}>
            <button onClick={() => onToggleReasoning(entry.id)} className="flex w-full items-center gap-2 text-left font-medium">
              <span>Reasoning</span>
              {isStreaming
                ? <span className="ml-auto animate-pulse">...</span>
                : <span className="ml-auto">{reasoningOpen ? "-" : "+"}</span>}
            </button>
            {(reasoningOpen || isStreaming) ? (
              <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed opacity-80">
                {entry.reasoning}
              </div>
            ) : null}
          </div>
        ) : null}

        {entry.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.imageUrl} alt={entry.user} className="max-w-full rounded-xl border border-gray-200 dark:border-gray-700" />
        ) : (
          <div className={`${cardBg} rounded-2xl rounded-tl-sm border px-4 py-3 text-sm`}>
            {!entry.ai && isStreaming ? (
              <div className="space-y-2">
                <span className="flex items-center gap-2 py-1 text-xs text-gray-400">
                  <span className="inline-block h-2 w-20 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-400/40 via-blue-400/80 to-cyan-400/40 bg-[length:200%_100%]" />
                  <span>{entry.status ?? "Thinking..."}</span>
                </span>
                {entry.routeReason ? <div className="text-[11px] text-gray-400">{entry.routeReason}</div> : null}
              </div>
            ) : isStreaming ? (
              <div>
                {entry.status ? <div className="mb-1 text-[11px] opacity-70">{entry.status}</div> : null}
                <span className="whitespace-pre-wrap break-words leading-relaxed">{entry.ai}</span>
              </div>
            ) : (
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className ?? "");
                    const codeText = String(children).replace(/\n$/, "");
                    const isBlock = Boolean(match) || codeText.includes("\n");

                    if (isBlock) {
                      const blockId = `${entry.id}-code-${codeBlockIndex++}`;
                      return (
                        <div className="relative my-2 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                          <div className={`flex items-center justify-between px-3 py-1 text-xs text-gray-400 ${dark ? "bg-gray-900" : "bg-gray-200"}`}>
                            <span>{match?.[1] ?? "code"}</span>
                            <button onClick={() => onCopyText(codeText, blockId)} className="transition-colors hover:text-white">
                              {copied === blockId ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <SyntaxHighlighter style={dark ? oneDark : oneLight} language={match?.[1] ?? "text"} PreTag="div">
                            {codeText}
                          </SyntaxHighlighter>
                        </div>
                      );
                    }

                    return <code className={`${codeBg} rounded px-1 text-xs`} {...props}>{children}</code>;
                  },
                  p({ children }) {
                    return <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>;
                  },
                  ul({ children }) {
                    return <ul className="mb-2 ml-4 list-disc space-y-1">{children}</ul>;
                  },
                  ol({ children }) {
                    return <ol className="mb-2 ml-4 list-decimal space-y-1">{children}</ol>;
                  },
                  blockquote({ children }) {
                    return <blockquote className={`my-2 border-l-4 border-gray-400 pl-3 italic ${dark ? "text-gray-400" : "text-gray-600"}`}>{children}</blockquote>;
                  },
                  h1({ children }) {
                    return <h1 className="mb-2 text-xl font-bold">{children}</h1>;
                  },
                  h2({ children }) {
                    return <h2 className="mb-2 text-lg font-bold">{children}</h2>;
                  },
                  h3({ children }) {
                    return <h3 className="mb-1 text-base font-bold">{children}</h3>;
                  },
                }}
              >
                {entry.ai}
              </ReactMarkdown>
            )}
          </div>
        )}

        <div className="ml-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
          {entry.routeReason ? <span>{entry.routeReason}</span> : null}
          {entry.stopped ? <span className="text-amber-400">Stopped</span> : null}
          {entry.ai && !entry.imageUrl ? (
            <>
              <button onClick={() => onCopyText(entry.ai, responseCopyId)} className="hover:text-blue-400">
                {copied === responseCopyId ? "Copied" : "Copy"}
              </button>
              <button onClick={() => onResponseAction("summarize", entry.ai)} className="hover:text-blue-400">
                Summarize
              </button>
              <button onClick={() => onResponseAction("checklist", entry.ai)} className="hover:text-blue-400">
                Checklist
              </button>
              <button onClick={() => onResponseAction("translate", entry.ai)} className="hover:text-blue-400">
                Translate
              </button>
              <button onClick={() => onResponseAction("commit", entry.ai)} className="hover:text-blue-400">
                Commit msg
              </button>
            </>
          ) : null}
        </div>

        <CodeReviewPanel dark={dark} blocks={codeBlocks} onCreateFollowUp={onCreateFollowUp} />
        {entry.ai ? <FeedbackEmojis dark={dark} value={feedback} onChange={onFeedbackChange} /> : null}
      </div>
    </div>
  );
}