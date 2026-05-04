"use client";

import { useEffect, useRef } from "react";
import type { ChatEntry } from "../lib/chat-types";

type UseMemorySummarizerArgs = {
  workspaceId: string;
  chatId: string;
  messages: ChatEntry[];
  memoryEnabled: boolean;
  memoryNotes: string;
  setMemoryNotes: (notes: string) => void;
};

/**
 * Automatically summarizes older conversation history into persistent memory
 * notes.  Every time the message count crosses a new multiple of 20, the
 * oldest un-summarized block (up to 20 user+AI turns) is compressed into 2-3
 * bullet points and appended to `memoryNotes` in the workspace settings.
 *
 * The resulting notes are already injected into every subsequent chat request
 * by the existing `memoryInstruction` logic in the chat route.
 */
export function useMemorySummarizer({
  workspaceId,
  chatId,
  messages,
  memoryEnabled,
  memoryNotes,
  setMemoryNotes,
}: UseMemorySummarizerArgs) {
  // Track the last message count that triggered a summarization per chat.
  const lastSummarizedCountRef = useRef<Map<string, number>>(new Map());
  const isSummarizingRef = useRef(false);
  // Keep a ref to the latest memoryNotes so the async fetch callback
  // always appends to the most-current value (avoids stale-closure overwrites).
  const memoryNotesRef = useRef(memoryNotes);
  memoryNotesRef.current = memoryNotes;

  useEffect(() => {
    if (!memoryEnabled) return;

    const key = `${workspaceId}:${chatId}`;
    const lastCount = lastSummarizedCountRef.current.get(key) ?? 0;
    const count = messages.length;

    // Trigger when we cross a new multiple of 20
    const nextThreshold = lastCount + 20;
    if (count < nextThreshold || isSummarizingRef.current) return;

    // The block to summarize: messages[lastCount .. lastCount + 19] (only completed turns)
    const block = messages.slice(lastCount, lastCount + 20).filter((m) => m.ai.trim().length > 0);
    if (block.length === 0) return;

    isSummarizingRef.current = true;
    lastSummarizedCountRef.current.set(key, lastCount + 20);

    const payload = block.map((m) => ({ user: m.user, ai: m.ai }));

    fetch("/api/memory/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { summary?: string } | null) => {
        const summary = data?.summary?.trim();
        if (summary) {
          const latest = memoryNotesRef.current.trim();
          const separator = latest ? "\n" : "";
          setMemoryNotes(latest + separator + summary);
        }
      })
      .catch(() => {
        // Non-fatal: summarization failure doesn't break the chat
      })
      .finally(() => {
        isSummarizingRef.current = false;
      });
    // Only re-run when the message count changes. Other deps (workspaceId, chatId,
    // memoryEnabled, memoryNotes) are accessed via stable refs or are intentionally
    // not re-triggers: workspaceId/chatId are tracked via the Map key; memoryNotes
    // is read at call-time and does not need to restart the threshold watch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);
}
