"use client";

import { CalendarDays, ClipboardCheck, Code2, ImageIcon, Mail, type LucideIcon } from "lucide-react";
import { memo, useMemo, useState, type RefObject } from "react";
import { AIMessage } from "./AIMessage";
import type { ChatEntry, MessageFeedback, Mode, ResponseAction } from "../lib/chat-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MESSAGE_LOAD_BATCH_SIZE = 80;

export type ChatListProps = {
  chat: ChatEntry[];
  loading: boolean;
  copied: string | null;
  scrollRef: RefObject<HTMLDivElement | null>;
  chatEndRef: RefObject<HTMLDivElement | null>;
  openReasoning: Set<string>;
  onCopyText: (text: string, id: string) => void;
  onToggleReasoning: (id: string) => void;
  onEditUser: (text: string) => void;
  editingMessageId: string | null;
  editedMessageContent: string;
  onStartEditingMessage: (messageId: string, text: string) => void;
  onEditedMessageChange: (value: string) => void;
  onCancelEditingMessage: () => void;
  onSaveEditedMessage: () => void;
  onResponseAction: (action: ResponseAction, text: string) => void;
  onCreateFollowUp: (prompt: string) => void;
  onSetFeedback: (messageId: string, value: MessageFeedback | null) => void;
  onSetReviewText: (messageId: string, text: string) => void;
  onQuickStart: (text: string, mode?: Mode) => void;
  onFork?: (messageIndex: number) => void;
  assistantName: string;
  assistantDescription: string;
  assistantIcon: LucideIcon;
  dark?: boolean;
  ttsEnabled?: boolean;
  autoSpeakResponses?: boolean;
  voiceLanguage?: string;
};

export const ChatList = memo(function ChatList({
  chat,
  loading,
  copied,
  scrollRef,
  chatEndRef,
  openReasoning,
  onCopyText,
  onToggleReasoning,
  onEditUser,
  editingMessageId,
  editedMessageContent,
  onStartEditingMessage,
  onEditedMessageChange,
  onCancelEditingMessage,
  onSaveEditedMessage,
  onResponseAction,
  onCreateFollowUp,
  onSetFeedback,
  onSetReviewText,
  onQuickStart,
  onFork,
  assistantName,
  assistantDescription,
  assistantIcon: AssistantIcon,
  dark = false,
  ttsEnabled = true,
  autoSpeakResponses = false,
  voiceLanguage = "en-US",
}: ChatListProps) {
  const [visibleCount, setVisibleCount] = useState(MESSAGE_LOAD_BATCH_SIZE);
  const quickStarters: Array<{ label: string; hint: string; prompt: string; mode?: Mode; icon: LucideIcon }> = [
    { label: "Generuj Kod", hint: "Kompletne rozwiązania", prompt: "Napisz mi kompletny przykład kodu dla: ", mode: "code", icon: Code2 },
    { label: "Zadanie", hint: "Daj AI zadanie", prompt: "Pomoz mi z zadaniem kodowania: ", mode: "chat", icon: ClipboardCheck },
    { label: "Kalendarz", hint: "AI tworzy wydarzenia", prompt: "Stworz wydarzenie w kalendarzu dla: ", mode: "chat", icon: CalendarDays },
    { label: "Email", hint: "AI pisze maile", prompt: "Napisz profesjonalnego maila dotyczacego: ", mode: "chat", icon: Mail },
    { label: "Generuj Obraz", hint: "AI tworzy obrazy", prompt: "Wygeneruj obraz przedstawiajacy: ", mode: "image", icon: ImageIcon },
  ];
  const visibleStartIndex = Math.max(0, chat.length - visibleCount);
  const revealCount = Math.min(MESSAGE_LOAD_BATCH_SIZE, visibleStartIndex);
  const visibleMessages = useMemo(() => chat.slice(visibleStartIndex), [chat, visibleStartIndex]);

  return (
    <div ref={scrollRef} className="mx-auto flex-1 w-full max-w-4xl overflow-y-auto space-y-4 pr-1">
      {chat.length === 0 ? (
        <div className="mt-8 text-center sm:mt-12">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <AssistantIcon className="h-6 w-6 text-foreground/70" />
          </div>
          <h2 className="mt-5 text-[2rem] font-bold tracking-tight text-foreground">Jak moge Ci pomoc?</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            {assistantName === "Code Assistant"
              ? "Expert in AutoHotkey, Python, JavaScript, and all programming languages. Provides complete code solutions with best practices."
              : assistantDescription}
          </p>
          <div className="mx-auto mt-6 grid max-w-[38rem] grid-cols-1 gap-3 sm:grid-cols-2">
            {quickStarters.map((card) => {
              const Icon = card.icon;
              return (
                <Button
                  key={card.label}
                  variant="outline"
                  onClick={() => onQuickStart(card.prompt, card.mode)}
                  className={cn(
                    "h-auto rounded-xl px-4 py-3 text-left transition-all justify-start border border-border bg-card hover:bg-accent"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground/70">
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">{card.label}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{card.hint}</div>
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      {visibleStartIndex > 0 ? (
        <div className="sticky top-0 z-10 flex justify-center py-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVisibleCount((current) => current + MESSAGE_LOAD_BATCH_SIZE)}
            className={cn(
              "rounded-full text-xs backdrop-blur border-border bg-background/80 text-foreground hover:bg-accent"
            )}
          >
            Show {revealCount} older message{revealCount === 1 ? "" : "s"}
          </Button>
        </div>
      ) : null}

      {visibleMessages.map((entry, index) => (
        <div key={entry.id} className="space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[82%]">
              {entry.filePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.filePreview} alt="file" className="mb-1 ml-auto block h-24 rounded-xl" />
              ) : null}
              {entry.fileName && !entry.filePreview ? (
                <div className="mb-1 ml-auto inline-flex rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                  {entry.fileName}
                </div>
              ) : null}
              {editingMessageId === entry.id ? (
                <div className="rounded-2xl rounded-tr-sm bg-muted/40 p-3">
                  <Textarea
                    id="edit-message-content"
                    name="editMessageContent"
                    value={editedMessageContent}
                    onChange={(event) => onEditedMessageChange(event.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-xl text-sm border-border bg-background text-foreground"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={onCancelEditingMessage} className="rounded-lg text-xs border border-border bg-background text-foreground hover:bg-accent">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={onSaveEditedMessage} className="rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90">
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-muted px-4 py-2 text-sm text-foreground">
                    {entry.user}
                  </div>
                  <div className="mt-1 flex justify-end gap-3">
                    <Button variant="ghost" size="sm" onClick={() => onEditUser(entry.user)} className="h-auto px-0 py-0 text-xs text-foreground/80 hover:text-foreground">
                      Edit and resend
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onStartEditingMessage(entry.id, entry.user)} className="h-auto px-0 py-0 text-xs text-foreground/80 hover:text-foreground">
                      Edit inline
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <AIMessage
            entry={entry}
            copied={copied}
            isStreaming={loading && index === chat.length - 1}
            reasoningOpen={openReasoning.has(entry.id)}
            rating={entry.feedback}
            reviewText={entry.reviewText}
            onCopyText={onCopyText}
            onToggleReasoning={onToggleReasoning}
            onResponseAction={onResponseAction}
            onCreateFollowUp={onCreateFollowUp}
            onRatingChange={(value) => onSetFeedback(entry.id, value)}
            onReviewTextChange={(text) => onSetReviewText(entry.id, text)}
            onFork={onFork ? () => onFork(visibleStartIndex + index) : undefined}
            dark={dark}
            ttsEnabled={ttsEnabled}
            autoSpeakResponses={autoSpeakResponses}
            voiceLanguage={voiceLanguage}
          />
        </div>
      ))}

      <div ref={chatEndRef} />
    </div>
  );
});
