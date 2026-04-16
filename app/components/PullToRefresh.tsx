"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type PullToRefreshProps = {
  dark: boolean;
  disabled?: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
  onRefresh: () => void | Promise<void>;
};

/**
 * Minimum downward distance (px) the user must drag before the gesture
 * is recognised as a pull-to-refresh rather than a normal scroll.
 * Until this threshold is crossed the touch events are left alone so
 * the browser can scroll normally.
 */
const ACTIVATION_THRESHOLD = 12;

/** Distance (px) at which releasing triggers the refresh callback. */
const TRIGGER_THRESHOLD = 72;

/** Maximum visual pull distance (px). */
const MAX_PULL = 92;

export function PullToRefresh({ dark, disabled = false, scrollContainerRef, onRefresh }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  /** Whether the current gesture has been confirmed as a pull-to-refresh. */
  const confirmedRef = useRef(false);
  /**
   * Whether we already decided this gesture is a normal scroll (user
   * started scrolling sideways or upward, or the container was not at
   * the top). Once set, the gesture is ignored until the next touchstart.
   */
  const rejectedRef = useRef(false);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element || disabled) return;

    const isAtTop = () => element.scrollTop <= 1;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || refreshing) return;

      // Only consider the gesture if the scroll container is at the very top.
      if (!isAtTop()) {
        rejectedRef.current = true;
        return;
      }

      startYRef.current = event.touches[0].clientY;
      confirmedRef.current = false;
      rejectedRef.current = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      // Already decided this touch is a normal scroll — bail out.
      if (rejectedRef.current || startYRef.current === null) return;

      const delta = event.touches[0].clientY - startYRef.current;

      // If the user scrolls upward or the container moved away from the
      // top (e.g. momentum scroll), reject the gesture permanently.
      if (delta <= 0 || !isAtTop()) {
        rejectedRef.current = true;
        setPullDistance(0);
        return;
      }

      // Wait until the drag exceeds the activation threshold before
      // intercepting the touch. This lets short/gentle swipes scroll
      // normally instead of being hijacked.
      if (!confirmedRef.current) {
        if (delta < ACTIVATION_THRESHOLD) return;
        confirmedRef.current = true;
      }

      // Now we own the gesture — prevent the browser from scrolling.
      event.preventDefault();
      setPullDistance(Math.min(delta * 0.55, MAX_PULL));
    };

    const finishPull = () => {
      const wasConfirmed = confirmedRef.current;
      startYRef.current = null;
      confirmedRef.current = false;
      rejectedRef.current = false;

      if (wasConfirmed && pullDistanceRef.current >= TRIGGER_THRESHOLD) {
        setRefreshing(true);
        void Promise.resolve(onRefresh()).finally(() => {
          setRefreshing(false);
        });
      }

      setPullDistance(0);
    };

    element.addEventListener("touchstart", handleTouchStart, { passive: true });
    element.addEventListener("touchmove", handleTouchMove, { passive: false });
    element.addEventListener("touchend", finishPull);
    element.addEventListener("touchcancel", finishPull);

    return () => {
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchmove", handleTouchMove);
      element.removeEventListener("touchend", finishPull);
      element.removeEventListener("touchcancel", finishPull);
    };
  }, [disabled, onRefresh, refreshing, scrollContainerRef]);

  const height = refreshing ? 44 : pullDistance;
  const label = refreshing ? "Refreshing..." : pullDistance >= TRIGGER_THRESHOLD ? "Release to refresh" : "Pull to refresh";

  return (
    <div style={{ height }} className="shrink-0 overflow-hidden transition-[height] duration-150 ease-out">
      <div className={`flex h-11 items-center justify-center text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
        {label}
      </div>
    </div>
  );
}