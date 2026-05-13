"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { CodeReviewPanel } from "./CodeReviewPanel";
import { ReviewPanel } from "./ReviewPanel";
import ReactMarkdown from "react-markdown";
import type { ChatEntry, MessageFeedback, ResponseAction } from "../lib/chat-types";
import { getVoiceProfile, resolveSpeechVoice } from "../lib/voice";

// Lazily load the syntax highlighter so the large Prism bundle is excluded from
// the initial page JavaScript, significantly reducing Total Blocking Time.
const LazyCodeBlock = dynamic(
  () => import("./LazyCodeBlock").then((m) => m.LazyCodeBlock),
  { ssr: false }
);

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

type AIMessageProps = {
  entry: ChatEntry;
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
  dark?: boolean;
  ttsEnabled?: boolean;
  autoSpeakResponses?: boolean;
  voiceLanguage?: string;
  ttsVoiceId?: string;
};

export function AIMessage({
  entry,
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
  dark = false,
  ttsEnabled = true,
  autoSpeakResponses = false,
  voiceLanguage = "en-US",
  ttsVoiceId = "default",
}: AIMessageProps) {
  const responseCopyId = `${entry.id}-response`;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lastAutoSpokenTextRef = useRef("");
  const ttsSupported = ttsEnabled && typeof window !== "undefined" && "speechSynthesis" in window;

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

  const createUtterance = useCallback(() => {
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = voiceLanguage;
    const profile = getVoiceProfile(ttsVoiceId);
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    const availableVoices = typeof window.speechSynthesis.getVoices === "function"
      ? window.speechSynthesis.getVoices()
      : [];
    const matchedVoice = resolveSpeechVoice(availableVoices, ttsVoiceId, voiceLanguage);
    if (matchedVoice) utterance.voice = matchedVoice;
    return utterance;
  }, [cleanText, ttsVoiceId, voiceLanguage]);

  const handleSpeak = () => {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    const utterance = createUtterance();
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

  useEffect(() => {
    if (!autoSpeakResponses || !ttsSupported || isStreaming || !cleanText.trim()) return;
    if (lastAutoSpokenTextRef.current === cleanText) return;
    lastAutoSpokenTextRef.current = cleanText;
    window.speechSynthesis.cancel();
    const utterance = createUtterance();
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [autoSpeakResponses, cleanText, createUtterance, isStreaming, ttsSupported]);

  let codeBlockIndex = 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] space-y-1">
        {entry.reasoning ? (
          <div className={`mb-1 rounded-lg border px-3 py-2 text-xs border-border bg-muted/50 text-muted-foreground`}>
            <button onClick={() => onToggleReasoning(entry.id)} className="flex w-full items-center gap-2 text-left font-medium">
              <span>Reasoning</span>
              {isStreaming
                ? <span className="ml-auto animate-pulse">...</span>
                : <span className="ml-auto">{reasoningOpen ? "-" : "+"}</span>}
            </button>
            {reasoningOpen ? (
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
              <div className={`rounded-lg border px-3 py-2 text-xs border-border bg-muted/50 text-muted-foreground`}>
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
          <div className="rounded-2xl rounded-tl-sm py-3 text-sm">
            {!entry.ai && isStreaming ? (
              <div className="space-y-2">
                <span className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                  <span className="inline-block h-2 w-20 animate-[pulse_1.2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-400/40 via-blue-400/80 to-cyan-400/40 bg-[length:200%_100%]" />
                  <span>{entry.status ?? "Thinking..."}</span>
                </span>
                {entry.routeReason ? <div className="text-[11px] text-muted-foreground">{entry.routeReason}</div> : null}
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
                          <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground bg-muted">
                            <span>{match?.[1] ?? "code"}</span>
                            <button onClick={() => onCopyText(codeText, blockId)} className="transition-colors hover:text-white">
                              {copied === blockId ? "Copied" : "Copy"}
                            </button>
                          </div>
                          <LazyCodeBlock isDark={dark} language={match?.[1] ?? "text"} code={codeText} />
                        </div>
                      );
                    }

                    return <code className="bg-muted rounded px-1 text-xs" {...props}>{children}</code>;
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
                    return <blockquote className="my-2 border-l-4 border-border pl-3 italic text-muted-foreground">{children}</blockquote>;
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
              <div className="mt-3 border-t border-border pt-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sources</div>
                <ol className="space-y-0.5">
                  {citations.map((c) => (
                    <li key={c.index} className="flex items-start gap-1.5 text-xs">
                      <span className="flex-shrink-0 font-medium text-muted-foreground">[{c.index}]</span>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-sky-600 hover:underline dark:text-sky-300"
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

        <div className="ml-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {entry.routeReason ? <span>{entry.routeReason}</span> : null}
          {entry.stopped ? <span className="text-amber-500 dark:text-amber-300">Stopped</span> : null}
          {entry.ai && !entry.imageUrl ? (
            <>
              <button onClick={() => onCopyText(entry.ai, responseCopyId)} className="hover:text-blue-600 dark:hover:text-blue-300">
                {copied === responseCopyId ? "Copied" : "Copy"}
              </button>
              {ttsSupported ? (
                isSpeaking ? (
                  <button onClick={handleStopSpeaking} className="hover:text-amber-500 dark:hover:text-amber-300" title="Stop speaking" aria-label="Stop speaking">
                    Stop
                  </button>
                ) : (
                  <button onClick={handleSpeak} className="hover:text-blue-600 dark:hover:text-blue-300" title="Read aloud" aria-label="Read response aloud">
                    Speak
                  </button>
                )
              ) : null}
              <button onClick={() => onResponseAction("summarize", entry.ai)} className="hover:text-blue-600 dark:hover:text-blue-300">
                Summarize
              </button>
              <button onClick={() => onResponseAction("checklist", entry.ai)} className="hover:text-blue-600 dark:hover:text-blue-300">
                Checklist
              </button>
              <button onClick={() => onResponseAction("translate", entry.ai)} className="hover:text-blue-600 dark:hover:text-blue-300">
                Translate
              </button>
              <button onClick={() => onResponseAction("commit", entry.ai)} className="hover:text-blue-600 dark:hover:text-blue-300">
                Commit msg
              </button>
              {onFork ? (
                <button onClick={onFork} title="Fork conversation at this message" className="hover:text-emerald-600 dark:hover:text-emerald-300">
                  Fork
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        <CodeReviewPanel blocks={codeBlocks} onCreateFollowUp={onCreateFollowUp} />
        {entry.ai ? (
          <ReviewPanel
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
