"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { CodeReviewPanel } from "./CodeReviewPanel";
import { ReviewPanel } from "./ReviewPanel";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatEntry, MessageFeedback, ResponseAction } from "../lib/chat-types";

// ── Inline citations ────────────────────────────────────────────────────────
type Citation = { index: number; url: string };

function parseCitations(text: string): { cleanText: string; citations: Citation[] } {
  const citationRegex = /^\[(\d+)\]:\s*(https?:\/\/\S+)/gm;
  const citations: Citation[] = [];
  let match = citationRegex.exec(text);
  while (match !== null) {
    citations.push({ index: parseInt(match[1], 10), url: match[2] });
    match = citationRegex.exec(text);
  }
  const cleanText = citations.length > 0
    ? text.replace(/\n?\[\d+\]:\s*https?:\/\/\S+/g, "").trim()
    : text;
  return { cleanText, citations };
}

// ── TTS helpers (useSyncExternalStore) ─────────────────────────────────────
function getTtsSupportSnapshot() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
function subscribeTtsSupport() {
  return () => { /* TTS support does not change at runtime */ };
}

type AIMessageProps = {
  entry: ChatEntry;
  dark: boolean;
  cardBg: string;
  codeBg: string;
  copied: string | null;
  isStreaming: boolean;
  reasoningOpen: boolean;
  rating?: MessageFeedback;
  reviewText?: string;
  onCopyText: (text: string, id: string) => void;
  onToggleReasoning: (id: string) => void;
  onResponseAction: (action: ResponseAction, text: string) => void;
  onCreateFollowUp: (prompt: string) => void;
  onRatingChange: (value: MessageFeedback | null) => void;
  onReviewTextChange: (text: string) => void;
  onFork?: () => void;
};

export function AIMessage({
  entry,
  dark,
  cardBg,
  codeBg,
  copied,
  isStreaming,
  reasoningOpen,
  rating,
  reviewText,
  onCopyText,
  onToggleReasoning,
  onResponseAction,
  onCreateFollowUp,
  onRatingChange,
  onReviewTextChange,
  onFork,
}: AIMessageProps) {
  let codeBlockIndex = 0;
  const responseCopyId = `${entry.id}-response`;
  const [isSpeaking, setIsSpeaking] = useState(false);

  const ttsSupported = useSyncExternalStore(subscribeTtsSupport, getTtsSupportSnapshot, () => false);

  const codeBlocks = useMemo(() => {
    const matches = Array.from(entry.ai.matchAll(/```([\w-]+)?\n([\s\S]*?)```/g));
    return matches.map((match) => ({
      language: match[1] || "text",
      code: match[2].trim(),
    })).filter((block) => block.code.length > 0);
  }, [entry.ai]);

  const { cleanText, citations } = useMemo(() => {
    const isSearchResponse = typeof entry.model === "string" && (entry.model.includes("perplexity") || entry.model.includes("sonar"));
    if (!isSearchResponse) return { cleanText: entry.ai, citations: [] as Citation[] };
    return parseCitations(entry.ai);
  }, [entry.ai, entry.model]);

  const handleSpeak = () => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleStopSpeaking = () => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

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
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={entry.imageUrl} alt={entry.user} className="max-w-full rounded-xl border border-gray-200 dark:border-gray-700" />
            {entry.imageGeneration ? (
              <div className={`rounded-xl border px-3 py-2 text-xs ${dark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                <div className="font-medium">
                  {entry.imageGeneration.provider} • {entry.imageGeneration.model}
                </div>
                {entry.imageGeneration.stages?.length > 0 ? (
                  <ul className="mt-1 list-inside list-disc space-y-0.5 opacity-90">
                    {entry.imageGeneration.stages.map((stage, index) => (
                      <li key={`${stage}-${index}`}>{stage}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
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
                {cleanText}
              </ReactMarkdown>
            )}

            {/* Inline citations — shown for search responses that include footnotes */}
            {citations.length > 0 && !isStreaming ? (
              <div className={`mt-3 border-t pt-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                <div className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${dark ? "text-slate-500" : "text-slate-400"}`}>Sources</div>
                <ol className="space-y-0.5">
                  {citations.map((c) => (
                    <li key={c.index} className="flex items-start gap-1.5 text-xs">
                      <span className={`flex-shrink-0 font-medium ${dark ? "text-slate-400" : "text-slate-500"}`}>[{c.index}]</span>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sky-500 hover:underline"
                      >
                        {c.url}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
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
              {ttsSupported ? (
                isSpeaking ? (
                  <button onClick={handleStopSpeaking} className="hover:text-amber-400" title="Stop speaking" aria-label="Stop speaking">
                    Stop
                  </button>
                ) : (
                  <button onClick={handleSpeak} className="hover:text-blue-400" title="Read aloud" aria-label="Read response aloud">
                    Speak
                  </button>
                )
              ) : null}
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
              {onFork ? (
                <button onClick={onFork} title="Fork conversation at this message" className="hover:text-emerald-400">
                  Fork
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        <CodeReviewPanel dark={dark} blocks={codeBlocks} onCreateFollowUp={onCreateFollowUp} />
        {entry.ai ? (
          <ReviewPanel
            dark={dark}
            rating={rating}
            reviewText={reviewText}
            onRatingChange={onRatingChange}
            onReviewTextChange={onReviewTextChange}
          />
        ) : null}
      </div>
    </div>
  );
}
