/**
 * GitHub-style activity heatmap. 12 weeks × 7 days grid.
 * Server component — no client JS.
 */
export function Heatmap({ data }: { data: { date: string; count: number }[] }) {
  const weeks = 12;
  const gridDays = weeks * 7;
  const trimmed = data.slice(-gridDays);
  const max = Math.max(1, ...trimmed.map((d) => d.count));

  const cell = 12;
  const gap = 3;
  const w = weeks * (cell + gap);
  const h = 7 * (cell + gap);

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            Activity
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">
            Last {weeks} weeks · daily signups
          </h3>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-white/40">
          <span>less</span>
          {[0.1, 0.3, 0.55, 0.8, 1].map((f, i) => (
            <span
              key={i}
              className="inline-block rounded-[3px]"
              style={{
                width: 10,
                height: 10,
                background: intensityFill(f),
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            />
          ))}
          <span>more</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
          {trimmed.map((d, i) => {
            const col = Math.floor(i / 7);
            const row = i % 7;
            const x = col * (cell + gap);
            const y = row * (cell + gap);
            const t = d.count > 0 ? Math.min(1, d.count / max) : 0;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx={2}
                ry={2}
                fill={intensityFill(t)}
                style={{
                  animation: `heat-fade 0.4s ease ${(i / gridDays) * 0.6}s both`,
                }}
              >
                <title>{`${d.date} — ${d.count} signup${d.count === 1 ? "" : "s"}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>

      <style>{`
        @keyframes heat-fade { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
        rect[style*="heat-fade"] { transform-origin: center; transform-box: fill-box; }
      `}</style>
    </div>
  );
}

function intensityFill(t: number): string {
  if (t <= 0) return "rgba(255,255,255,0.03)";
  // Blend violet-500 → cyan-400 by intensity for a subtle color range.
  const alpha = 0.15 + t * 0.7;
  const r = Math.round(139 + (96 - 139) * t);
  const g = Math.round(92 + (165 - 92) * t);
  const b = Math.round(246 + (250 - 246) * t);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
