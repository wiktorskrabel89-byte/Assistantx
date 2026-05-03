"use client";

type ThinkingIndicatorProps = {
  dark: boolean;
  visible: boolean;
  status?: string;
  routeReason?: string;
  /** Approximate length (in characters) of the partial response being streamed. */
  partialResponseLength?: number;
};

export function ThinkingIndicator({ dark, visible, status, routeReason, partialResponseLength }: ThinkingIndicatorProps) {
  if (!visible) return null;

  const tokenEstimate = partialResponseLength ? Math.ceil(partialResponseLength / 4) : 0;

  return (
    <div className={`mt-3 rounded-2xl border px-4 py-3 ${dark ? "border-slate-800 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}>
      <div className="flex items-center gap-3 text-sm font-medium">
        <span className="inline-flex gap-1">
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_infinite] rounded-full bg-blue-500" />
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_0.2s_infinite] rounded-full bg-cyan-500" />
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_0.4s_infinite] rounded-full bg-violet-500" />
        </span>
        <span>{status ?? "Thinking through the next response..."}</span>
        {tokenEstimate > 0 && (
          <span className={`ml-auto text-xs font-normal ${dark ? "text-slate-500" : "text-slate-400"}`}>
            ~{tokenEstimate.toLocaleString()} tokens
          </span>
        )}
      </div>
      {routeReason ? <div className="mt-2 text-xs text-slate-500">{routeReason}</div> : null}
    </div>
  );
}
