"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import type { MessageFeedback } from "../lib/chat-types";

type ReviewPanelProps = {
  dark: boolean;
  rating?: MessageFeedback;
  reviewText?: string;
  onRatingChange: (rating: MessageFeedback | null) => void;
  onReviewTextChange: (text: string) => void;
};

const MAX_REVIEW_LENGTH = 500;

export function ReviewPanel({ dark, rating, reviewText, onRatingChange, onReviewTextChange }: ReviewPanelProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [localText, setLocalText] = useState(reviewText ?? "");
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up the "Saved" timer on unmount.
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const displayRating = hovered ?? rating ?? 0;

  function handleRatingClick(star: number) {
    if (rating === star) {
      onRatingChange(null);
      setLocalText("");
      setExpanded(false);
    } else {
      onRatingChange(star as MessageFeedback);
      setExpanded(true);
    }
  }

  function handleToggleExpanded() {
    const next = !expanded;
    // Sync localText from the persisted reviewText each time the textarea is opened,
    // so external changes (remote sync, mutations) are reflected.
    if (next) setLocalText(reviewText ?? "");
    setExpanded(next);
  }

  function handleSave() {
    onReviewTextChange(localText.slice(0, MAX_REVIEW_LENGTH));
    setSaved(true);
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className={`mt-3 rounded-2xl border px-4 py-3 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
          Oceń odpowiedź
        </span>
        <div
          className="flex items-center gap-1"
          onMouseLeave={() => setHovered(null)}
        >
          {([1, 2, 3, 4, 5] as MessageFeedback[]).map((star) => (
            <button
              key={star}
              type="button"
              aria-label={`${star} gwiazdek`}
              onMouseEnter={() => setHovered(star)}
              onClick={() => handleRatingClick(star)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`h-5 w-5 transition-colors ${
                  star <= displayRating
                    ? "fill-amber-400 text-amber-400"
                    : dark
                    ? "fill-slate-700 text-slate-600"
                    : "fill-slate-200 text-slate-300"
                }`}
              />
            </button>
          ))}
        </div>
        {rating ? (
          <button
            type="button"
            onClick={handleToggleExpanded}
            className={`text-xs transition-colors ${
              dark
                ? "text-slate-400 hover:text-slate-200"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {expanded
              ? "Ukryj komentarz"
              : reviewText
              ? "Edytuj komentarz"
              : "Dodaj komentarz"}
          </button>
        ) : null}
      </div>

      {expanded && rating ? (
        <div className="mt-3">
          <textarea
            id="review-comment"
            name="reviewComment"
            value={localText}
            onChange={(e) => setLocalText(e.target.value)}
            placeholder="Napisz komentarz (opcjonalnie)..."
            rows={3}
            maxLength={MAX_REVIEW_LENGTH}
            className={`w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none transition-colors ${
              dark
                ? "border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500 focus:border-sky-600"
                : "border-slate-200 bg-slate-50 text-slate-900 placeholder-slate-400 focus:border-sky-400"
            }`}
          />
          <div className="mt-2 flex items-center justify-between">
            <span className={`text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>
              {localText.length}/{MAX_REVIEW_LENGTH} znaków
            </span>
            <button
              type="button"
              onClick={handleSave}
              disabled={localText.length > MAX_REVIEW_LENGTH}
              className="rounded-lg bg-gradient-to-r from-sky-700 to-cyan-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-sky-800 hover:to-cyan-700 disabled:opacity-50"
            >
              {saved ? "Zapisano ✓" : "Zapisz recenzję"}
            </button>
          </div>
        </div>
      ) : null}

      {rating && !expanded && reviewText ? (
        <div className={`mt-2 text-xs italic ${dark ? "text-slate-400" : "text-slate-500"}`}>
          &ldquo;{reviewText}&rdquo;
        </div>
      ) : null}
    </div>
  );
}
