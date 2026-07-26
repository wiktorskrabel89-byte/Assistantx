/**
 * Tiny inline SVG sparkline. Server component — no JS shipped.
 * Uses a filled gradient area + a smooth line for the "premium chart" vibe.
 */
export function Sparkline({
  data,
  width = 140,
  height = 40,
  color = "#a78bfa",
  fillOpacity = 0.14,
  id,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  id: string;
}) {
  if (!data.length) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
      </svg>
    );
  }
  const max = Math.max(1, ...data);
  const min = 0;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;
  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / (max - min || 1)) * (height - 4) - 2;
    return { x, y };
  });

  // Build a smooth path with quadratic curves for softer look.
  const linePath = points.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    const prev = points[i - 1];
    const midX = (prev.x + p.x) / 2;
    return `${acc} Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)}, ${midX.toFixed(2)} ${((prev.y + p.y) / 2).toFixed(2)} T ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }, "");
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

  const gradId = `spark-grad-${id}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={fillOpacity} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={2.5}
          fill={color}
        />
      )}
    </svg>
  );
}
