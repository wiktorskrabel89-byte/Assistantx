"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type PullToRefreshProps = {
  dark: boolean;
  disabled?: boolean;
  scrollContainerRef: RefObject<HTMLElement | null>;
  onRefresh: () => void | Promise<void>;
};

export function PullToRefresh({ dark, disabled = false, scrollContainerRef, onRefresh }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullDistanceRef = useRef(0);
  const startYRef = useRef<number | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    pullDistanceRef.current = pullDistance;
  }, [pullDistance]);

  useEffect(() => {
    const element = scrollContainerRef.current;
    if (!element || disabled) return;

    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || element.scrollTop > 0 || refreshing) return;
      startYRef.current = event.touches[0].clientY;
      activeRef.current = true;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || startYRef.current === null) return;
      const delta = event.touches[0].clientY - startYRef.current;

      if (delta <= 0 || element.scrollTop > 0) {
        setPullDistance(0);
        return;
      }

      event.preventDefault();
      setPullDistance(Math.min(delta * 0.55, 92));
    };

    const finishPull = () => {
      if (!activeRef.current) return;
      activeRef.current = false;
      startYRef.current = null;

      if (pullDistanceRef.current >= 72) {
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
  const label = refreshing ? "Refreshing..." : pullDistance >= 72 ? "Release to refresh" : "Pull to refresh";

  return (
    <div style={{ height }} className="shrink-0 overflow-hidden transition-[height] duration-150 ease-out">
      <div className={`flex h-11 items-center justify-center text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
        {label}
      </div>
    </div>
  );
}