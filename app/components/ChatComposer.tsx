"use client";

import { Code2, Eye, MessageSquareText, Mic, Paperclip, Plus, Send, StopCircle, X } from "lucide-react";
import type { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import type { Mode, QueuedMessage } from "../lib/chat-types";

type ChatComposerProps = {
  dark: boolean;
  message: string;
  file: File | null;
  listening: boolean;
  speechError: string | null;
  queuedMessages: QueuedMessage[];
  loading: boolean;
  composerPreview: boolean;
  mode: Mode;
  auxiliaryMode: Mode | "auto";
  fileInputRef: RefObject<HTMLInputElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onMessageChange: (value: string) => void;
  onRemoveFile: () => void;
  onToggleSpeechInput: () => void;
  onSelectMode: (mode: Mode) => void;
  onTogglePreview: () => void;
  onStopGeneration: () => void;
  onQueueMessage: () => void;
  onRemoveQueuedMessage: (queueId: string) => void;
};

export function ChatComposer({
  dark,
  message,
  file,
  listening,
  speechError,
  queuedMessages,
  loading,
  composerPreview,
  mode,
  auxiliaryMode,
  fileInputRef,
  inputRef,
  onMessageChange,
  onRemoveFile,
  onToggleSpeechInput,
  onSelectMode,
  onTogglePreview,
  onStopGeneration,
  onQueueMessage,
  onRemoveQueuedMessage,
}: ChatComposerProps) {
  return (
    <div className="border-t border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto max-w-5xl space-y-2">
        {speechError ? (
          <div className={`rounded-xl border px-3 py-2 text-xs ${dark ? "border-amber-900 bg-amber-950/30 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {speechError}
          </div>
        ) : null}

        {listening ? (
          <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${dark ? "border-emerald-900 bg-emerald-950/30 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
            <Mic className="h-3.5 w-3.5 animate-pulse" />
            <span>Listening...</span>
          </div>
        ) : null}

        {file ? (
          <div className="flex flex-wrap gap-2">
            <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
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
                        ? "border-blue-800 bg-blue-950/30 text-blue-100"
                        : "border-blue-200 bg-blue-50 text-blue-800"
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

        <div className={`flex items-end gap-2 rounded-2xl border p-2 shadow-sm ${dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white"}`}>
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-600"}`}
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <button
            onClick={onToggleSpeechInput}
            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border ${listening ? (dark ? "border-emerald-800 bg-emerald-950/40 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-700") : (dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-600")}`}
            title={listening ? "Stop speech input" : "Start speech input"}
            aria-label={listening ? "Stop speech input" : "Start speech input"}
          >
            <Mic className={`h-4 w-4 ${listening ? "animate-pulse" : ""}`} />
          </button>

          <div className={`hidden items-center gap-1 rounded-xl p-1 sm:flex ${dark ? "border border-slate-800 bg-slate-900" : "border border-slate-200 bg-slate-100"}`}>
            <button
              onClick={() => onSelectMode("code")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${mode === "code" ? "bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-300" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>Kod</span>
            </button>
            <button
              onClick={() => onSelectMode("chat")}
              className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors ${mode === "chat" ? "bg-white text-purple-700 shadow-sm dark:bg-slate-800 dark:text-purple-300" : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"}`}
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              <span>Chat</span>
            </button>
            <select
              value={auxiliaryMode}
              onChange={(event) => onSelectMode(event.target.value as Mode)}
              className={`rounded-lg border-0 bg-transparent px-2 py-2 text-xs font-medium ${dark ? "text-slate-200" : "text-slate-700"}`}
            >
              <option value="auto">Auto</option>
              <option value="search">Search</option>
              <option value="image">Image</option>
              <option value="upload">File</option>
            </select>
          </div>

          <textarea
            ref={inputRef}
            value={message}
            onChange={(event) => onMessageChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onQueueMessage();
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
            onClick={onQueueMessage}
            disabled={!message.trim() && !file}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
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