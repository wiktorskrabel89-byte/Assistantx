"use client";

import { Eye, Mic, MicOff, Paperclip, Plus, Send, StopCircle, X } from "lucide-react";
import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { useLayoutEffect, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import type { QueuedMessage } from "../lib/chat-types";
import { REASONING_MODEL_IDS } from "@/lib/ai-config";

// Minimal type stubs for the Web Speech API (not yet in TypeScript's lib.dom.d.ts)
declare global {
  interface SpeechRecognitionEventMap {
    result: Event;
    end: Event;
    error: Event;
  }

  interface SpeechRecognitionResultItem {
    transcript: string;
  }

  interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    item(index: number): SpeechRecognitionResultItem;
    [index: number]: SpeechRecognitionResultItem;
  }

  interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
    onerror: (() => void) | null;
    start(): void;
    stop(): void;
  }

  interface SpeechRecognitionConstructor {
    new(): SpeechRecognition;
  }

  interface Window {
    SpeechRecognition: SpeechRecognitionConstructor | undefined;
    webkitSpeechRecognition: SpeechRecognitionConstructor | undefined;
  }
}

export type ChatComposerProps = {
  dark: boolean;
  message: string;
  file: File | null;
  filePreview: string | null;
  queuedMessages: QueuedMessage[];
  loading: boolean;
  composerPreview: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onMessageChange: (value: string) => void;
  onSelectFile: (file: File) => void;
  onRemoveFile: () => void;
  onTogglePreview: () => void;
  onStopGeneration: () => void;
  onQueueMessage: (thinkingEffort: number) => void;
  onRemoveQueuedMessage: (queueId: string) => void;
  selectedModel: string;
  premiumLimitReached?: boolean;
  planRequestLimit?: number;
};

export function ChatComposer({
  dark,
  message,
  file,
  filePreview,
  queuedMessages,
  loading,
  composerPreview,
  fileInputRef,
  inputRef,
  onMessageChange,
  onSelectFile,
  onRemoveFile,
  onTogglePreview,
  onStopGeneration,
  onQueueMessage,
  onRemoveQueuedMessage,
  selectedModel,
  premiumLimitReached = false,
  planRequestLimit,
}: ChatComposerProps) {
  // Auto-resize textarea
  const resizeComposer = useCallback(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, 44), 180);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 180 ? "auto" : "hidden";
  }, [inputRef]);

  useLayoutEffect(() => {
    resizeComposer();
  }, [message, resizeComposer]);

  // Reasoning depth state
  const [thinkingEffort, setThinkingEffort] = useState("Medium");

  const showThinkingEffort = REASONING_MODEL_IDS.includes(selectedModel);

  // ── Voice input ────────────────────────────────────────────────────────────
  const [micActive, setMicActive] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // useSyncExternalStore returns false on the server (prevents SSR hydration mismatch)
  // and the actual browser capability value on the client.
  const hasSpeechRecognition = useSyncExternalStore(
    () => () => {},
    () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    () => false
  );

  const toggleMic = useCallback(() => {
    if (micActive) {
      recognitionRef.current?.stop();
      setMicActive(false);
      return;
    }
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    // Use the browser's preferred language so the recogniser picks the right model
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onMessageChange(transcript);
    };
    recognition.onend = () => setMicActive(false);
    recognition.onerror = () => setMicActive(false);
    recognitionRef.current = recognition;
    recognition.start();
    setMicActive(true);
  }, [micActive, onMessageChange]);

  // Stop mic when component unmounts
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  // ── Clipboard paste for images ─────────────────────────────────────────────
  const handlePaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) {
          onSelectFile(blob);
          event.preventDefault();
          return;
        }
      }
    }
  }, [onSelectFile]);

  return (
    <div className="border-t border-slate-200 bg-white/85 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto max-w-5xl space-y-2">
        {premiumLimitReached ? (
          <div className={`rounded-xl border px-4 py-2.5 text-xs font-medium ${dark ? "border-amber-800/50 bg-amber-950/30 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            You have used all {planRequestLimit ?? "your"} premium requests for this month. Your quota will reset next month.
          </div>
        ) : null}
        {file ? (
          <div className="flex flex-wrap gap-2">
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
              {filePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={filePreview} alt={file.name} className="h-8 w-8 rounded-lg object-cover" />
              ) : null}
              <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="max-w-[240px] truncate">{file.name}</span>
              <button
                onClick={onRemoveFile}
                className="ml-1 text-[11px] opacity-70 hover:opacity-100"
              >
                Remove
              </button>
            </div>
          </div>
        ) : null}

        {queuedMessages.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {queuedMessages.map((queuedMessage, index) => {
              const isActive = loading && index === 0;
              const queueNumber = loading ? index : index + 1;
              const queuedLabel = queuedMessage.text || queuedMessage.file?.name || "Queued message";
              return (
                <div
                  key={queuedMessage.id}
                  className={`flex max-w-full items-start gap-2 rounded-xl border px-3 py-2 text-xs ${
                    isActive
                      ? dark
                        ? "border-cyan-800 bg-cyan-950/30 text-cyan-100"
                        : "border-sky-200 bg-sky-50 text-sky-800"
                      : dark
                        ? "border-slate-700 bg-slate-900 text-slate-200"
                        : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{isActive ? "Sending now" : `Queued ${queueNumber}`}</div>
                    <div className="truncate opacity-80">{queuedLabel}</div>
                  </div>
                  {!isActive ? (
                    <button
                      onClick={() => onRemoveQueuedMessage(queuedMessage.id)}
                      className="flex h-5 w-5 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100"
                      title="Remove queued message"
                      aria-label="Remove queued message"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {composerPreview && message.trim() ? (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${dark ? "border-slate-800 bg-slate-950 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
            <ReactMarkdown>{message}</ReactMarkdown>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          id="chat-file-upload"
          name="chatFileUpload"
          accept="image/*,.txt,.md,.csv,.json,.pdf,.ts,.tsx,.js,.jsx,.py,.html,.css,.sql,.xml,.yml,.yaml"
          className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0];
            if (nextFile) onSelectFile(nextFile);
            event.target.value = "";
          }}
        />

        {showThinkingEffort && (
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor="thinking-effort" className="text-xs font-medium text-slate-500 dark:text-slate-400">Thinking Effort:</label>
            <select
              id="thinking-effort"
              value={thinkingEffort}
              onChange={e => setThinkingEffort(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Xhigh">Xhigh</option>
            </select>
          </div>
        )}
        <div className={`flex items-end gap-2 rounded-2xl border p-2 shadow-sm ${dark ? "border-slate-800 bg-slate-950" : "border-sky-200/60 bg-white/95"}`}>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-600"}`}
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          {hasSpeechRecognition && (
            <button
              onClick={toggleMic}
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border transition-colors ${
                micActive
                  ? dark
                    ? "border-red-800 bg-red-950/40 text-red-300"
                    : "border-red-200 bg-red-50 text-red-600"
                  : dark
                    ? "border-slate-700 bg-slate-900 text-slate-200"
                    : "border-slate-200 bg-white text-slate-600"
              }`}
              title={micActive ? "Stop recording" : "Start voice input"}
              aria-label={micActive ? "Stop recording" : "Start voice input"}
            >
              {micActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}

          <textarea
            ref={inputRef}
            id="chat-message"
            name="chatMessage"
            value={message}
            disabled={premiumLimitReached}
            onChange={(event) => {
              onMessageChange(event.target.value);
              resizeComposer();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                let effortNum = 2;
                if (thinkingEffort === "Low") effortNum = 1;
                else if (thinkingEffort === "High") effortNum = 3;
                else if (thinkingEffort === "Xhigh") effortNum = 4;
                onQueueMessage(showThinkingEffort ? effortNum : 2);
              }
            }}
            onPaste={handlePaste}
            placeholder="Wiadomość... (Enter to send)"
            rows={1}
            className={`flex-1 resize-none border-0 bg-transparent px-3 py-3 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${dark ? "text-slate-100 placeholder-slate-500" : "text-slate-900 placeholder-slate-400"}`}
            style={{ minHeight: 44, maxHeight: 180 }}
          />

          <button
            onClick={onTogglePreview}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${composerPreview ? (dark ? "border-blue-800 bg-blue-950/40 text-blue-200" : "border-blue-200 bg-blue-50 text-blue-700") : (dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-600")}`}
            title="Preview message"
            aria-label="Preview message"
          >
            <Eye className="h-4 w-4" />
          </button>

          {loading ? (
            <button
              onClick={onStopGeneration}
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${dark ? "border-red-900 bg-red-950/40 text-red-200" : "border-red-200 bg-red-50 text-red-700"}`}
              title="Stop generation"
              aria-label="Stop generation"
            >
              <StopCircle className="h-4 w-4" />
            </button>
          ) : null}

          <button
            onClick={() => {
              let effortNum = 2;
              if (thinkingEffort === "Low") effortNum = 1;
              else if (thinkingEffort === "High") effortNum = 3;
              else if (thinkingEffort === "Xhigh") effortNum = 4;
              onQueueMessage(showThinkingEffort ? effortNum : 2);
            }}
            disabled={premiumLimitReached || (!message.trim() && !file)}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 text-white transition-all hover:from-sky-800 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
            title={premiumLimitReached ? "Premium request limit reached" : loading ? "Add to queue" : "Send message"}
            aria-label={premiumLimitReached ? "Premium request limit reached" : loading ? "Add to queue" : "Send message"}
          >
            {loading ? <Plus className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
