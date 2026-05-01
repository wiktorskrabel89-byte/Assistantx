"use client";

import { Eye, Paperclip, Plus, Send, StopCircle, X } from "lucide-react";
import { useState } from "react";
import { useCallback, useLayoutEffect, type RefObject } from "react";
import ReactMarkdown from "react-markdown";
import type { QueuedMessage } from "../lib/chat-types";

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
};

// Supported models for reasoning depth
const REASONING_MODELS = [
  "openai/gpt-5.4",
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-preview",
  "deepseek/deepseek-r1",
  "moonshotai/kimi-k2-thinking",
];

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

  const showThinkingEffort = REASONING_MODELS.some((id) => selectedModel.includes(id.split("/").pop()!));

  return (
    <div className="border-t border-slate-200 bg-white/85 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto max-w-5xl space-y-2">
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

          <textarea
            ref={inputRef}
            id="chat-message"
            name="chatMessage"
            value={message}
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
                onQueueMessage(effortNum);
              }
            }}
            placeholder="Wiadomosc... (Enter to send)"
            rows={1}
            className={`flex-1 resize-none border-0 bg-transparent px-3 py-3 text-sm focus:outline-none ${dark ? "text-slate-100 placeholder-slate-500" : "text-slate-900 placeholder-slate-400"}`}
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
              onQueueMessage(showThinkingEffort ? effortNum : 2);
            }}
            disabled={!message.trim() && !file}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-sky-700 to-cyan-600 text-white transition-all hover:from-sky-800 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-40"
            title={loading ? "Add to queue" : "Send message"}
            aria-label={loading ? "Add to queue" : "Send message"}
          >
            {loading ? <Plus className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}