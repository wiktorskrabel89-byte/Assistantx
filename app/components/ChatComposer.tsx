"use client";

import { Eye, Paperclip, Plus, Send, StopCircle, X } from "lucide-react";
import { useState, useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { type RefObject } from "react";
import dynamic from "next/dynamic";
import type { QueuedMessage } from "../lib/chat-types";
import { DEFAULT_WEB_WAKE_PHRASE } from "../lib/voice";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  premiumLimitReached?: boolean;
  planRequestLimit?: number;
  sttEnabled?: boolean;
  voiceLanguage?: string;
  wakeWordEnabled?: boolean;
  wakeWordPhrase?: string;
  externalVoiceActivationSignal?: number;
};

const DEFAULT_THINKING_EFFORT = 2;
const ComposerMarkdownPreview = dynamic(
  () => import("./ComposerMarkdownPreview").then((module) => module.ComposerMarkdownPreview),
  {
    ssr: false,
    loading: () => <span className="whitespace-pre-wrap break-words leading-relaxed text-foreground">Loading preview…</span>,
  }
);

export function ChatComposer({
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
  premiumLimitReached = false,
  planRequestLimit,
  sttEnabled = true,
  voiceLanguage = "en-US",
  wakeWordEnabled = true,
  wakeWordPhrase = DEFAULT_WEB_WAKE_PHRASE,
  externalVoiceActivationSignal = 0,
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

  // Run after paint (useEffect, not useLayoutEffect) so the synchronous reflow
  // does not block the browser from painting — keeps keyboard INP low.
  useEffect(() => {
    resizeComposer();
  }, [message, resizeComposer]);

  // ── Voice input ────────────────────────────────────────────────────────────
  const [micActive, setMicActive] = useState(false);
  const [voiceOrbMode, setVoiceOrbMode] = useState<"idle" | "listening" | "thinking">("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // useSyncExternalStore returns false on the server (prevents SSR hydration mismatch)
  // and the actual browser capability value on the client.
  const hasSpeechRecognition = useSyncExternalStore(
    () => () => {},
    () => !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    () => false
  );

  const stopMic = useCallback(() => {
    recognitionRef.current?.stop();
    setMicActive(false);
    setVoiceOrbMode("idle");
  }, []);

  const startMic = useCallback((autoSubmitOnFinal: boolean) => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SR || !sttEnabled) return;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = voiceLanguage || "en-US";
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = "";
      let hasFinal = false;
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
        if (event.results[i].isFinal) hasFinal = true;
      }
      onMessageChange(transcript.trim());
      if (autoSubmitOnFinal && hasFinal && transcript.trim()) {
        setVoiceOrbMode("thinking");
        onQueueMessage(DEFAULT_THINKING_EFFORT);
        recognition.stop();
      }
    };
    recognition.onend = () => {
      setMicActive(false);
      setVoiceOrbMode("idle");
    };
    recognition.onerror = () => {
      setMicActive(false);
      setVoiceOrbMode("idle");
    };
    recognitionRef.current = recognition;
    recognition.start();
    setMicActive(true);
    setVoiceOrbMode("listening");
  }, [onMessageChange, onQueueMessage, sttEnabled, voiceLanguage]);

  const toggleVoiceOrb = useCallback(() => {
    if (micActive) {
      stopMic();
      return;
    }
    startMic(true);
  }, [micActive, startMic, stopMic]);

  // Stop mic when component unmounts
  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  const lastExternalActivationRef = useRef<number>(externalVoiceActivationSignal);
  useEffect(() => {
    if (!wakeWordEnabled || !sttEnabled || micActive) return;
    if (lastExternalActivationRef.current === externalVoiceActivationSignal) return;
    lastExternalActivationRef.current = externalVoiceActivationSignal;
    const timeoutId = window.setTimeout(() => {
      startMic(true);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [externalVoiceActivationSignal, micActive, startMic, sttEnabled, wakeWordEnabled]);

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
    <div className="border-t border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl space-y-2">
        {premiumLimitReached ? (
          <div className={cn(
            "rounded-lg border px-4 py-2.5 text-xs font-medium",
            "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300"
          )}>
            You have used all {planRequestLimit ?? "your"} premium requests for this month. Your quota will reset next month.
          </div>
        ) : null}

        {file ? (
          <div className="flex flex-wrap gap-2">
            <div className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs",
              "border-border bg-muted text-foreground"
            )}>
              {filePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={filePreview} alt={file.name} className="h-8 w-8 rounded-lg object-cover" />
              ) : null}
              <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="max-w-[240px] truncate">{file.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemoveFile}
                className="ml-1 h-auto px-0 py-0 text-[11px] opacity-70 hover:opacity-100"
              >
                Remove
              </Button>
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
                  className={cn(
                    "flex max-w-full items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                    isActive
                      ? "border-border bg-accent text-accent-foreground"
                      : "border-border bg-muted text-muted-foreground"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{isActive ? "Sending now" : `Queued ${queueNumber}`}</div>
                    <div className="truncate opacity-80">{queuedLabel}</div>
                  </div>
                  {!isActive ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemoveQueuedMessage(queuedMessage.id)}
                      className="h-5 w-5 opacity-70 hover:opacity-100"
                      title="Remove queued message"
                      aria-label="Remove queued message"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {composerPreview && message.trim() ? (
          <div className="rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm text-foreground">
            <ComposerMarkdownPreview text={message} />
          </div>
        ) : null}

        <div className="flex items-center justify-center py-1">
          <button
            type="button"
            onClick={toggleVoiceOrb}
            disabled={!hasSpeechRecognition || !sttEnabled}
            className={cn(
              "group relative flex h-16 w-16 items-center justify-center rounded-full border transition-all duration-300",
              voiceOrbMode === "listening"
                ? "border-cyan-300 bg-gradient-to-br from-cyan-500 to-blue-600 shadow-[0_0_30px_rgba(59,130,246,0.45)]"
                : voiceOrbMode === "thinking"
                  ? "border-blue-300 bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_0_34px_rgba(99,102,241,0.4)]"
                  : "border-blue-200 bg-gradient-to-br from-blue-400 to-sky-500 shadow-[0_0_22px_rgba(59,130,246,0.3)]",
              (!hasSpeechRecognition || !sttEnabled) ? "cursor-not-allowed opacity-50" : "hover:scale-105"
            )}
            aria-label={micActive ? "Stop voice orb" : "Start voice orb"}
            title={micActive ? "Stop voice mode" : "Start voice mode"}
          >
            <span className={cn("absolute inset-0 rounded-full", voiceOrbMode !== "idle" ? "motion-safe:animate-ping bg-blue-300/25" : "")} />
            <span className="relative text-[10px] font-semibold uppercase tracking-wider text-white">
              {voiceOrbMode === "listening" ? "Live" : voiceOrbMode === "thinking" ? "AI" : "Voice"}
            </span>
          </button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Blue orb voice mode {wakeWordEnabled ? `• wake phrase: "${wakeWordPhrase}"` : ""}
        </p>

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

        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm">
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            className="h-11 w-11 flex-shrink-0 rounded-xl border-border bg-background text-foreground/70 hover:bg-accent"
            title="Attach file"
            aria-label="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Textarea
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
                onQueueMessage(DEFAULT_THINKING_EFFORT);
              }
            }}
            onPaste={handlePaste}
            placeholder="Wiadomość... (Enter to send)"
            rows={1}
            className={cn(
              "flex-1 resize-none border-0 bg-transparent px-3 py-3 text-sm shadow-none focus-visible:ring-0 text-foreground placeholder:text-muted-foreground"
            )}
            style={{ minHeight: 44, maxHeight: 180 }}
          />

          <Button
            variant="outline"
            size="icon"
            onClick={onTogglePreview}
            className={cn(
              "h-11 w-11 flex-shrink-0 rounded-xl",
              composerPreview
                ? "border-border bg-accent text-accent-foreground hover:bg-accent/80"
                : "border-border bg-background text-foreground/70 hover:bg-accent"
            )}
            title="Preview message"
            aria-label="Preview message"
          >
            <Eye className="h-4 w-4" />
          </Button>

          {loading ? (
            <Button
              variant="outline"
              size="icon"
              onClick={onStopGeneration}
              className={cn(
                "h-11 w-11 flex-shrink-0 rounded-xl",
                "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
              )}
              title="Stop generation"
              aria-label="Stop generation"
            >
              <StopCircle className="h-4 w-4" />
            </Button>
          ) : null}

          <Button
            onClick={() => onQueueMessage(2)}
            disabled={premiumLimitReached || (!message.trim() && !file)}
            size="icon"
            className="h-11 w-11 flex-shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            title={premiumLimitReached ? "Premium request limit reached" : loading ? "Add to queue" : "Send message"}
            aria-label={premiumLimitReached ? "Premium request limit reached" : loading ? "Add to queue" : "Send message"}
          >
            {loading ? <Plus className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
