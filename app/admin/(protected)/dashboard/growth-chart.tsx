/**
 * Larger area chart showing waitlist signups per day for the last 30 days.
 * Server-rendered SVG — no JS libs, no client bundle overhead.
 */
export function GrowthChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  const W = 900;
  const H = 260;
  const PAD_X = 32;
  const PAD_TOP = 20;
  const PAD_BOTTOM = 30;
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const max = Math.max(1, ...data.map((d) => d.count));
  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;

  const points = data.map((d, i) => {
    const x = PAD_X + i * stepX;
    const y = PAD_TOP + chartH - (d.count / max) * chartH;
    return { x, y, ...d };
  });

  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = points[i - 1];
    const midX = (prev.x + p.x) / 2;
    return `${acc} Q ${prev.x} ${prev.y}, ${midX} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`;
  }, "");
  const areaPath = `${linePath} L ${PAD_X + chartW} ${PAD_TOP + chartH} L ${PAD_X} ${PAD_TOP + chartH} Z`;

  const total = data.reduce((s, d) => s + d.count, 0);

  // Y-axis ticks: 0, 50%, 100% of max
  const yTicks = [0, 0.5, 1].map((f) => ({
    y: PAD_TOP + chartH - f * chartH,
    label: Math.round(max * f).toLocaleString(),
  }));

  // X-axis labels: first, middle, last
  const xLabels = [0, Math.floor(data.length / 2), data.length - 1]
    .filter((i) => i >= 0 && i < data.length)
    .map((i) => ({ x: points[i].x, label: formatMonthDay(data[i].date) }));

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.02] p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-300/80">
            Waitlist growth
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">Signups per day · last {data.length} days</h3>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black tracking-tight">{total.toLocaleString()}</p>
          <p className="text-xs text-white/40">total in window</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full h-[220px] min-w-[600px]"
          aria-label="Waitlist signups per day"
        >
          <defs>
            <linearGradient id="growth-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.35" />
              <stop offset="70%" stopColor="#60a5fa" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="growth-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#60a5fa" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD_X}
                x2={W - PAD_X}
                y1={t.y}
                y2={t.y}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="3 4"
              />
              <text x={PAD_X - 8} y={t.y + 3} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.35)">
                {t.label}
              </text>
            </g>
          ))}

          {/* Area + line */}
          <path d={areaPath} fill="url(#growth-area)" />
          <path
            d={linePath}
            stroke="url(#growth-line)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 2000,
              strokeDashoffset: 2000,
              animation: "growth-line-draw 1.5s cubic-bezier(0.22,1,0.36,1) 0.15s forwards",
            }}
          />

          {/* End marker */}
          {points.length > 0 && (
            <>
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r={5}
                fill="#a78bfa"
                opacity="0.35"
              />
              <circle
                cx={points[points.length - 1].x}
                cy={points[points.length - 1].y}
                r={3}
                fill="#fff"
              />
            </>
          )}

          {/* X labels */}
          {xLabels.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y={H - 8}
              textAnchor="middle"
              fontSize="10"
              fill="rgba(255,255,255,0.35)"
            >
              {l.label}
            </text>
          ))}
        </svg>
      </div>

      <style>{`
        @keyframes growth-line-draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

function formatMonthDay(d: string): string {
  // 'YYYY-MM-DD' → 'Mon 24'
  const [, m, day] = d.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Number(m) - 1] || m} ${Number(day)}`;
}
