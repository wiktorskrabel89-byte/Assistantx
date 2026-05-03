"use client";

import { CalendarDays, ClipboardCheck, Code2, ImageIcon, Mail, type LucideIcon } from "lucide-react";
import { memo, type RefObject } from "react";
import { AIMessage } from "./AIMessage";
import type { ChatEntry, MessageFeedback, Mode, ResponseAction } from "../lib/chat-types";

export type ChatListProps = {
  chat: ChatEntry[];
  loading: boolean;
  dark: boolean;
  cardBg: string;
  codeBg: string;
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
  onQuickStart: (text: string, mode?: Mode) => void;
  onFork?: (messageIndex: number) => void;
  assistantName: string;
  assistantDescription: string;
  assistantIcon: LucideIcon;
};

export const ChatList = memo(function ChatList({
  chat,
  loading,
  dark,
  cardBg,
  codeBg,
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
  onQuickStart,
  onFork,
  assistantName,
  assistantDescription,
  assistantIcon: AssistantIcon,
}: ChatListProps) {
  const quickStarters: Array<{ label: string; hint: string; prompt: string; mode?: Mode; icon: LucideIcon }> = [
    { label: "Generuj Kod", hint: "Kompletne rozwiązania", prompt: "Napisz mi kompletny przykład kodu dla: ", mode: "code", icon: Code2 },
    { label: "Zadanie", hint: "Daj AI zadanie", prompt: "Pomoz mi z zadaniem kodowania: ", mode: "chat", icon: ClipboardCheck },
    { label: "Kalendarz", hint: "AI tworzy wydarzenia", prompt: "Stworz wydarzenie w kalendarzu dla: ", mode: "chat", icon: CalendarDays },
    { label: "Email", hint: "AI pisze maile", prompt: "Napisz profesjonalnego maila dotyczacego: ", mode: "chat", icon: Mail },
    { label: "Generuj Obraz", hint: "AI tworzy obrazy", prompt: "Wygeneruj obraz przedstawiajacy: ", mode: "image", icon: ImageIcon },
  ];

  return (
    <div ref={scrollRef} className="mx-auto flex-1 w-full max-w-4xl overflow-y-auto space-y-4 pr-1">
      {chat.length === 0 ? (
        <div className="mt-8 text-center sm:mt-12">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-700 via-cyan-600 to-amber-500 shadow-lg shadow-cyan-500/20">
            <AssistantIcon className="h-6 w-6 text-white" />
          </div>
          <h2 className={`mt-5 text-[2rem] font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>Jak moge Ci pomoc?</h2>
          <p className={`mx-auto mt-2 max-w-2xl text-sm ${dark ? "text-slate-400" : "text-slate-600"}`}>
            {assistantName === "Code Assistant"
              ? "Expert in AutoHotkey, Python, JavaScript, and all programming languages. Provides complete code solutions with best practices."
              : assistantDescription}
          </p>
          <div className="mx-auto mt-6 grid max-w-[38rem] grid-cols-1 gap-3 sm:grid-cols-2">
            {quickStarters.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.label}
                  onClick={() => onQuickStart(card.prompt, card.mode)}
                  className={`rounded-xl border px-4 py-3 text-left transition-all ${
                    dark
                      ? "border-slate-800 bg-slate-900/80 hover:border-blue-800 hover:bg-slate-900"
                      : "border-slate-200 bg-white shadow-sm hover:border-sky-300 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${dark ? "bg-slate-800 text-cyan-300" : "bg-sky-50 text-sky-700"}`}>
                      <Icon className="h-4 w-4" strokeWidth={2.2} />
                    </div>
                    <div>
                      <div className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>{card.label}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{card.hint}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {chat.map((entry, index) => (
        <div key={entry.id} className="space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[82%]">
              {entry.filePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entry.filePreview} alt="file" className="mb-1 ml-auto block h-24 rounded-xl" />
              ) : null}
              {entry.fileName && !entry.filePreview ? (
                <div className={`mb-1 ml-auto inline-flex rounded-full border px-2 py-1 text-xs ${dark ? "border-gray-600 text-gray-300" : "border-gray-300 text-gray-600"}`}>
                  {entry.fileName}
                </div>
              ) : null}
              {editingMessageId === entry.id ? (
                <div className="rounded-2xl rounded-tr-sm bg-sky-600/10 p-3">
                  <textarea
                    id="edit-message-content"
                    name="editMessageContent"
                    value={editedMessageContent}
                    onChange={(event) => onEditedMessageChange(event.target.value)}
                    rows={4}
                    className={`w-full resize-none rounded-xl border px-3 py-2 text-sm ${dark ? "border-slate-700 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button onClick={onCancelEditingMessage} className={`rounded-lg border px-3 py-1.5 text-xs ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}>
                      Cancel
                    </button>
                    <button onClick={onSaveEditedMessage} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white">
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-sm text-white">
                    {entry.user}
                  </div>
                  <div className="mt-1 flex justify-end gap-3">
                    <button onClick={() => onEditUser(entry.user)} className={`text-xs ${dark ? "text-cyan-300" : "text-sky-700"}`}>
                      Edit and resend
                    </button>
                    <button onClick={() => onStartEditingMessage(entry.id, entry.user)} className={`text-xs ${dark ? "text-slate-300" : "text-slate-600"}`}>
                      Edit inline
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <AIMessage
            entry={entry}
            dark={dark}
            cardBg={cardBg}
            codeBg={codeBg}
            copied={copied}
            isStreaming={loading && index === chat.length - 1}
            reasoningOpen={openReasoning.has(entry.id)}
            feedback={entry.feedback}
            onCopyText={onCopyText}
            onToggleReasoning={onToggleReasoning}
            onResponseAction={onResponseAction}
            onCreateFollowUp={onCreateFollowUp}
            onFeedbackChange={(value) => onSetFeedback(entry.id, value)}
            onFork={onFork ? () => onFork(index) : undefined}
          />
        </div>
      ))}

      <div ref={chatEndRef} />
    </div>
  );
});
