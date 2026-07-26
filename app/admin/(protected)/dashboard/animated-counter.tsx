"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: number | null;
  format?: (n: number) => string;
  className?: string;
  durationMs?: number;
};

/**
 * Counts up from 0 to `value` on mount using rAF. Uses an easing curve so
 * the number decelerates as it lands — feels less like a spinner, more
 * like a settling reveal.
 */
export function AnimatedCounter({ value, format, className, durationMs = 1200 }: Props) {
  const [display, setDisplay] = useState(0);
  const startedAt = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);

  useEffect(() => {
    if (value === null || value === undefined) return;
    const target = value;
    startedAt.current = performance.now();

    const tick = (now: number) => {
      const start = startedAt.current!;
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(target * eased));
      if (t < 1) rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [value, durationMs]);

  if (value === null || value === undefined) return <span className={className}>—</span>;
  const shown = format ? format(display) : display.toLocaleString();
  return <span className={className}>{shown}</span>;
}
